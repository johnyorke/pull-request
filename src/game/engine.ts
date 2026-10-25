import { createShift, MAX_SLA_MS, PULL_REQUESTS } from '../data/levels';
import type {
  GameState,
  LogTone,
  Metrics,
  PRResult,
  PRRuntime,
  PullRequest,
  ReviewFlag,
  Verdict,
  ViolationType,
} from '../types';
import { applyMetrics, evaluatePR } from './scoring';

const TICK_MS = 200;

export const CRITICAL_SLA_MS = 10_000;

const STARTING_METRICS: Metrics = {
  quality: 80,
  security: 80,
  throughput: 80,
};

 type EngineEvent = 'render' | 'clock';

function createRuntimes(
  prs: readonly PullRequest[],
): Record<string, PRRuntime> {
  return Object.fromEntries(
    prs.map((pr) => [
      pr.id,
      {
        status: 'available',
        activatedAtMs: null,
        deadlineAtMs: null,
        remainingMs: pr.slaMs,
        resolvedAtMs: null,
        verdict: null,
        flags: [],
        result: null,
        fileIndex: 0,
        lineIndex: 0,
      } satisfies PRRuntime,
    ]),
  );
}

export function createInitialState(
  prs: readonly PullRequest[] = PULL_REQUESTS,
): GameState {
  return {
    screen: 'title',
    elapsedMs: 0,
    paused: false,
    activePrId: null,
    prs: createRuntimes(prs),
    metrics: { ...STARTING_METRICS },
    score: 0,
    results: [],
    modal: null,
    guidelinesOpen: false,
    log: [],
    nextLogId: 1,
  };
}

export class ReviewGame {
  state: GameState;
  private shiftPRs: PullRequest[];
  private listeners = new Set<(event: EngineEvent) => void>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastWallMs = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.shiftPRs = createShift(this.random);
    this.state = createInitialState(this.shiftPRs);
  }

  get pullRequests(): readonly PullRequest[] {
    return this.shiftPRs;
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  startShift(): void {
    this.shiftPRs = createShift(this.random);
    this.state = createInitialState(this.shiftPRs);
    this.state.screen = 'shift';
    this.addLog(
      `REVIEW TERMINAL ONLINE. ${this.shiftPRs.length} PRs queued · ${formatClock(
        MAX_SLA_MS,
      )} per review.`,
      'info',
    );
    const first = this.firstAvailable();
    if (first !== null) {
      this.activatePR(first);
    }
    this.startLoop();
    this.emit('render');
  }

  startLoop(): void {
    if (this.intervalId !== null) {
      return;
    }

    this.lastWallMs = performance.now();
    this.intervalId = setInterval(() => this.step(), TICK_MS);
  }

  stopLoop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private step(): void {
    const now = performance.now();
    const delta = now - this.lastWallMs;
    this.lastWallMs = now;

    if (this.state.screen !== 'shift' || this.state.paused || this.state.modal) {
      return;
    }

    this.state.elapsedMs += Math.max(0, delta);
    const structural = this.advanceWorld();

    if (this.state.screen !== 'shift') {
      this.emit('render');
      return;
    }

    this.emit(structural ? 'render' : 'clock');
  }

  private advanceWorld(): boolean {
    let structural = false;

    const active = this.activePR();
    if (active !== null) {
      const runtime = this.state.prs[active.id];
      if (
        runtime.status === 'available' &&
        runtime.deadlineAtMs !== null &&
        this.state.elapsedMs >= runtime.deadlineAtMs
      ) {
        this.finishPR(active, 'timeout', true);
        structural = true;
      }
    }

    if (this.state.screen === 'shift' && this.allResolved() && !this.state.modal) {
      this.finishShift();
      structural = true;
    }

    return structural;
  }

  private activatePR(pr: PullRequest): void {
    const runtime = this.state.prs[pr.id];
    if (runtime.status !== 'available') {
      return;
    }

    const current = this.activePR();
    if (current !== null && current.id !== pr.id) {
      const currentRuntime = this.state.prs[current.id];
      if (
        currentRuntime.status === 'available' &&
        currentRuntime.deadlineAtMs !== null
      ) {
        currentRuntime.remainingMs = Math.max(
          0,
          currentRuntime.deadlineAtMs - this.state.elapsedMs,
        );
        currentRuntime.deadlineAtMs = null;
      }
    }

    this.state.activePrId = pr.id;
    runtime.activatedAtMs = this.state.elapsedMs;
    runtime.deadlineAtMs = this.state.elapsedMs + runtime.remainingMs;
    this.addLog(
      `Reviewing PR #${pr.number}: ${pr.title}. SLA ${formatClock(
        runtime.remainingMs,
      )}.`,
      'info',
    );
  }

  private finishPR(pr: PullRequest, verdict: Verdict, showModal: boolean): void {
    const runtime = this.state.prs[pr.id];
    if (runtime.status === 'resolved') {
      return;
    }

    const remainingMs =
      verdict === 'timeout' || runtime.deadlineAtMs === null
        ? 0
        : runtime.deadlineAtMs - this.state.elapsedMs;
    const result = evaluatePR(pr, runtime.flags, verdict, remainingMs);

    runtime.status = 'resolved';
    runtime.verdict = verdict;
    runtime.resolvedAtMs = this.state.elapsedMs;
    runtime.remainingMs = 0;
    runtime.deadlineAtMs = null;
    runtime.result = result;

    this.state.results.push(result);
    this.state.score += result.scoreDelta;
    this.state.metrics = applyMetrics(this.state.metrics, result.metricDelta);

    if (verdict === 'timeout') {
      this.addLog(
        `SLA EXPIRED: PR #${pr.number} was auto-rejected. Throughput hit.`,
        'danger',
      );
    } else if (verdict === 'rejected') {
      this.addLog(
        `PR #${pr.number} rejected with ${runtime.flags.length} finding(s).`,
        'warning',
      );
    } else {
      this.addLog(`PR #${pr.number} approved and merged.`, 'success');
    }

    if (this.state.activePrId === pr.id) {
      this.state.activePrId = null;
      const next = this.firstAvailable();
      if (next !== null) {
        this.activatePR(next);
      }
    }

    if (showModal && this.state.modal === null) {
      this.state.guidelinesOpen = false;
      this.state.modal = {
        type: 'verdict',
        result,
        final: this.allResolved(),
      };
    }
  }

  private finishShift(): void {
    this.state.screen = 'summary';
    this.state.modal = null;
    this.state.guidelinesOpen = false;
    this.stopLoop();
    this.addLog('Shift complete. Performance report generated.', 'success');
  }

  private firstAvailable(): PullRequest | null {
    for (const pr of this.shiftPRs) {
      if (this.state.prs[pr.id].status === 'available') {
        return pr;
      }
    }
    return null;
  }

  private allResolved(): boolean {
    return this.shiftPRs.every(
      (pr) => this.state.prs[pr.id].status === 'resolved',
    );
  }

  approve(): void {
    if (!this.canReview()) {
      return;
    }

    const active = this.activePR();
    if (active === null) {
      this.addLog('No PR is active.', 'warning');
      this.emit('render');
      return;
    }

    const runtime = this.state.prs[active.id];
    if (runtime.flags.length > 0) {
      this.state.modal = { type: 'confirm-approve', prId: active.id };
      this.emit('render');
      return;
    }

    this.finishPR(active, 'approved', true);
    this.emit('render');
  }

  confirmApprove(): void {
    if (this.state.modal?.type !== 'confirm-approve') {
      return;
    }

    const prId = this.state.modal.prId;
    const pr = this.shiftPRs.find((item) => item.id === prId);
    this.state.modal = null;
    if (pr === undefined) {
      return;
    }

    this.finishPR(pr, 'approved', true);
    this.emit('render');
  }

  reject(): void {
    if (!this.canReview()) {
      return;
    }

    const active = this.activePR();
    if (active === null) {
      this.addLog('No PR is active.', 'warning');
      this.emit('render');
      return;
    }

    const runtime = this.state.prs[active.id];
    if (runtime.flags.length === 0) {
      this.addLog(
        'Rejection blocked: flag at least one line with [S], [E], or [C].',
        'warning',
      );
      this.emit('render');
      return;
    }

    this.finishPR(active, 'rejected', true);
    this.emit('render');
  }

  dismissModal(): void {
    if (this.state.modal?.type === 'verdict') {
      this.state.modal = null;

      if (this.allResolved()) {
        this.finishShift();
      } else if (this.state.activePrId === null) {
        const next = this.firstAvailable();
        if (next !== null) {
          this.activatePR(next);
        }
      }

      this.emit('render');
      return;
    }

    if (this.state.modal !== null) {
      this.state.modal = null;
      this.emit('render');
    }
  }

  selectPR(id: string): void {
    const runtime = this.state.prs[id];
    if (
      this.state.screen !== 'shift' ||
      this.state.modal !== null ||
      runtime === undefined ||
      runtime.status !== 'available'
    ) {
      return;
    }

    const pr = this.shiftPRs.find((item) => item.id === id);
    if (pr === undefined) {
      return;
    }

    this.activatePR(pr);
    this.emit('render');
  }

  cyclePR(direction: number): void {
    const available = this.shiftPRs.filter(
      (pr) => this.state.prs[pr.id].status === 'available',
    );
    if (available.length < 2) {
      return;
    }

    const currentIndex = available.findIndex(
      (pr) => pr.id === this.state.activePrId,
    );
    const nextIndex =
      (currentIndex + direction + available.length) % available.length;
    this.activatePR(available[nextIndex]);
    this.emit('render');
  }

  moveCursor(delta: number): void {
    const active = this.activePR();
    if (active === null) {
      return;
    }

    const runtime = this.state.prs[active.id];
    const file = active.files[runtime.fileIndex];
    if (file === undefined) {
      return;
    }

    runtime.lineIndex = Math.min(
      Math.max(0, runtime.lineIndex + delta),
      file.lines.length - 1,
    );
    this.emit('render');
  }

  jumpCursor(position: 'home' | 'end'): void {
    const active = this.activePR();
    if (active === null) {
      return;
    }

    const runtime = this.state.prs[active.id];
    const file = active.files[runtime.fileIndex];
    if (file === undefined) {
      return;
    }

    runtime.lineIndex = position === 'home' ? 0 : file.lines.length - 1;
    this.emit('render');
  }

  selectFile(index: number): void {
    const active = this.activePR();
    if (active === null) {
      return;
    }

    const runtime = this.state.prs[active.id];
    if (index < 0 || index >= active.files.length) {
      return;
    }

    runtime.fileIndex = index;
    runtime.lineIndex = 0;
    this.emit('render');
  }

  cycleFile(direction: number): void {
    const active = this.activePR();
    if (active === null || active.files.length < 2) {
      return;
    }

    const runtime = this.state.prs[active.id];
    const next =
      (runtime.fileIndex + direction + active.files.length) %
      active.files.length;
    runtime.fileIndex = next;
    runtime.lineIndex = 0;
    this.emit('render');
  }

  selectLine(lineId: string): void {
    const active = this.activePR();
    if (active === null) {
      return;
    }

    const runtime = this.state.prs[active.id];
    const fileIndex = active.files.findIndex((file) =>
      file.lines.some((line) => line.id === lineId),
    );
    if (fileIndex < 0) {
      return;
    }

    const file = active.files[fileIndex];
    const lineIndex = file.lines.findIndex((line) => line.id === lineId);
    runtime.fileIndex = fileIndex;
    runtime.lineIndex = lineIndex;
    this.emit('render');
  }

  toggleFlag(type: ViolationType): void {
    if (!this.canReview()) {
      return;
    }

    const active = this.activePR();
    if (active === null) {
      return;
    }

    const runtime = this.state.prs[active.id];
    const file = active.files[runtime.fileIndex];
    const line = file?.lines[runtime.lineIndex];
    if (file === undefined || line === undefined) {
      return;
    }

    const existingIndex = runtime.flags.findIndex(
      (flag) =>
        flag.filePath === file.path &&
        flag.lineId === line.id &&
        flag.type === type,
    );

    if (existingIndex >= 0) {
      runtime.flags.splice(existingIndex, 1);
      this.addLog(`Cleared ${type} flag on ${file.path}:${line.newNo ?? '?'}.`, 'info');
    } else {
      const flag: ReviewFlag = {
        filePath: file.path,
        lineId: line.id,
        type,
      };
      runtime.flags.push(flag);
      this.addLog(`Flagged ${type} on ${file.path}:${line.newNo ?? '?'}.`, 'info');
    }

    this.emit('render');
  }

  clearLineFlags(): void {
    if (!this.canReview()) {
      return;
    }

    const active = this.activePR();
    if (active === null) {
      return;
    }

    const runtime = this.state.prs[active.id];
    const file = active.files[runtime.fileIndex];
    const line = file?.lines[runtime.lineIndex];
    if (file === undefined || line === undefined) {
      return;
    }

    const before = runtime.flags.length;
    runtime.flags = runtime.flags.filter(
      (flag) => !(flag.filePath === file.path && flag.lineId === line.id),
    );

    if (runtime.flags.length !== before) {
      this.addLog(`Cleared findings on ${file.path}:${line.newNo ?? '?'}.`, 'info');
      this.emit('render');
    }
  }

  toggleGuidelines(): void {
    if (this.state.modal !== null) {
      return;
    }
    this.state.guidelinesOpen = !this.state.guidelinesOpen;
    this.emit('render');
  }

  closeGuidelines(): void {
    if (this.state.guidelinesOpen) {
      this.state.guidelinesOpen = false;
      this.emit('render');
    }
  }

  openHelp(): void {
    if (this.state.modal !== null) {
      return;
    }
    this.state.guidelinesOpen = false;
    this.state.modal = { type: 'help' };
    this.emit('render');
  }

  togglePause(): void {
    if (this.state.screen !== 'shift' || this.state.modal !== null) {
      return;
    }
    this.state.guidelinesOpen = false;
    this.state.paused = !this.state.paused;
    this.emit('render');
  }

  replay(): void {
    this.stopLoop();
    this.state = createInitialState(this.shiftPRs);
    this.emit('render');
  }

  addLog(text: string, tone: LogTone): void {
    this.state.log.unshift({
      id: this.state.nextLogId,
      atMs: this.state.elapsedMs,
      text,
      tone,
    });
    this.state.nextLogId += 1;
    this.state.log = this.state.log.slice(0, 6);
  }

  activePR(): PullRequest | null {
    if (this.state.activePrId === null) {
      return null;
    }
    return (
      this.shiftPRs.find((pr) => pr.id === this.state.activePrId) ?? null
    );
  }

  private canReview(): boolean {
    return (
      this.state.screen === 'shift' &&
      !this.state.paused &&
      this.state.modal === null &&
      !this.state.guidelinesOpen
    );
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function remainingFor(
  state: GameState,
  pr: PullRequest,
): number {
  const runtime = state.prs[pr.id];
  if (runtime.status === 'resolved') {
    return 0;
  }
  if (runtime.deadlineAtMs === null) {
    return runtime.remainingMs;
  }
  return Math.max(0, runtime.deadlineAtMs - state.elapsedMs);
}

export function resultFor(
  results: PRResult[],
  prId: string,
): PRResult | undefined {
  return results.find((result) => result.prId === prId);
}
