import {
  GUIDELINES,
  GUIDELINE_BY_ID,
  TYPE_LABEL,
  TYPE_SHORT,
} from '../data/guidelines';
import { PULL_REQUESTS, PR_BY_ID } from '../data/levels';
import { formatClock, remainingFor, ReviewGame } from '../game/engine';
import { rankFor } from '../game/scoring';
import type {
  Defect,
  DiffFile,
  DiffLine,
  GameState,
  PRResult,
  PRRuntime,
  PullRequest,
  ReviewFlag,
  ViolationType,
} from '../types';

const TYPE_ORDER: ViolationType[] = ['STYLE', 'LOGIC', 'SECURITY'];

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'Promise',
  'return',
  'string',
  'switch',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'var',
  'while',
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function highlightCode(source: string): string {
  let output = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      output += `<span class="tok-comment">${escapeHtml(
        source.slice(index),
      )}</span>`;
      break;
    }

    if (char === '"' || char === "'" || char === '`') {
      let end = index + 1;
      let escaped = false;

      while (end < source.length) {
        const current = source[end];
        if (escaped) {
          escaped = false;
          end += 1;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          end += 1;
          continue;
        }
        if (current === char) {
          end += 1;
          break;
        }
        end += 1;
      }

      output += `<span class="tok-string">${escapeHtml(
        source.slice(index, end),
      )}</span>`;
      index = end;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) {
        end += 1;
      }
      const word = source.slice(index, end);
      output += KEYWORDS.has(word)
        ? `<span class="tok-keyword">${escapeHtml(word)}</span>`
        : escapeHtml(word);
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[0-9_]/.test(source[end])) {
        end += 1;
      }
      output += `<span class="tok-number">${escapeHtml(
        source.slice(index, end),
      )}</span>`;
      index = end;
      continue;
    }

    output += escapeHtml(char);
    index += 1;
  }

  return output;
}

function prose(value: string): string {
  return escapeHtml(value).replace(
    /`([^`]+)`/g,
    '<code class="inline-code">$1</code>',
  );
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function typeClass(type: ViolationType): string {
  return `type-${type.toLowerCase()}`;
}

function formatPoints(value: number, signed = false): string {
  const absolute = String(Math.abs(value)).padStart(4, '0');
  if (value < 0) {
    return `-${absolute}`;
  }
  return signed ? `+${absolute}` : absolute;
}

function verdictLabel(result: PRResult): string {
  if (result.verdict === 'timeout') {
    return 'AUTO-REJECTED';
  }
  return result.verdict === 'approved' ? 'APPROVED' : 'REJECTED';
}

function metricBar(label: string, value: number): string {
  return `
    <div class="metric" title="${label}: ${value}/100">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${String(value).padStart(3, '0')}</span>
      <span class="metric-track"><i style="width:${value}%"></i></span>
    </div>
  `;
}

function controlRows(): string {
  const controls: Array<[string, string]> = [
    ['↑ / ↓  ·  J / K', 'Move line cursor'],
    ['S  ·  L  ·  X', 'Flag style / logic / security'],
    ['A  /  R', 'Approve / request changes'],
    ['G', 'Open engineering guidelines'],
    ['1 / 2 / 3  ·  TAB', 'Switch active PR'],
    ['[  /  ]', 'Switch changed file'],
    ['BKSP', 'Clear findings on current line'],
    ['P', 'Pause shift clock'],
    ['?', 'Controls reference'],
  ];

  return controls
    .map(
      ([keys, description]) => `
      <div class="control-row">
        <kbd>${escapeHtml(keys)}</kbd>
        <span>${escapeHtml(description)}</span>
      </div>
    `,
    )
    .join('');
}

export class App {
  private readonly game = new ReviewGame();
  private readonly root: HTMLElement;
  private revealCursorNext = true;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.addEventListener('click', this.handleClick);
    window.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.game.subscribe((event) => {
      if (event === 'render') {
        this.render();
      } else {
        this.tickClocks();
      }
    });
    this.render();
  }

  private render(): void {
    const state = this.game.state;
    const currentCodeScroll =
      this.root.querySelector<HTMLElement>('.code-scroll');
    const previousScroll = currentCodeScroll?.scrollTop ?? 0;

    let screen = '';
    if (state.screen === 'title') {
      screen = this.renderTitle();
    } else if (state.screen === 'summary') {
      screen = this.renderSummary();
    } else {
      screen = this.renderShift();
    }

    let overlay = '';
    if (state.paused && state.screen === 'shift' && state.modal === null) {
      overlay = this.renderPauseOverlay();
    } else if (state.modal !== null) {
      overlay = this.renderModal(state);
    } else if (state.guidelinesOpen) {
      overlay = this.renderGuidelines();
    }

    this.root.innerHTML = `
      <div class="app-shell">
        <div class="scanlines" aria-hidden="true"></div>
        ${screen}
      </div>
      ${overlay}
    `;

    const newCodeScroll =
      this.root.querySelector<HTMLElement>('.code-scroll');
    if (newCodeScroll !== null) {
      newCodeScroll.scrollTop = previousScroll;
    }

    if (this.revealCursorNext) {
      requestAnimationFrame(() => {
        const cursor = this.root.querySelector<HTMLElement>(
          '.code-line.is-cursor',
        );
        cursor?.scrollIntoView({ block: 'nearest' });
      });
      this.revealCursorNext = false;
    }

    const autofocus = this.root.querySelector<HTMLElement>('[data-autofocus]');
    autofocus?.focus({ preventScroll: true });

    this.tickClocks();
  }

  private renderTitle(): string {
    return `
      <main class="title-screen">
        <div class="title-topline">
          <span>NEXUS DYNAMICS / INTERNAL SYSTEMS</span>
          <span class="blink">▮</span>
          <span>TERMINAL 09-C</span>
        </div>

        <section class="title-panel panel">
          <div class="eyebrow">HUMAN-IN-THE-LOOP REVIEW PROGRAM</div>
          <pre class="ascii-logo" aria-label="Pull Request"> ____  _   _ _      _      ____  _____ ____  ___ ____   _  _____ _____
|  _ \\| | | | |    | |    |  _ \\| ____|  _ \\|_ _/ ___| / \\|_   _| ____|
| |_) | | | | |    | |    | |_) |  _| | |_) || | |    / _ \\ | | |  _|
|  __/| |_| | |___ | |___ |  _ &lt;| |___|  _ &lt; | | |___/ ___ \\| | | |___
|_|    \\___/|_____|_____||_| \\_\\_____|_| \\_\\___\\____/_/   \\_\\_| |_____|</pre>
          <p class="tagline">AI writes the code. You decide what ships.</p>

          <div class="briefing-grid">
            <div class="briefing-item">
              <span class="briefing-number">01</span>
              <div>
                <strong>READ THE DIFF</strong>
                <p>AI-authored code arrives with confident commit messages. Confidence is not correctness.</p>
              </div>
            </div>
            <div class="briefing-item">
              <span class="briefing-number">02</span>
              <div>
                <strong>CITE THE VIOLATION</strong>
                <p>Highlight lines and fail PRs against the engineering guidelines. Unexplained rejections are blocked.</p>
              </div>
            </div>
            <div class="briefing-item">
              <span class="briefing-number">03</span>
              <div>
                <strong>BEAT THE QUEUE</strong>
                <p>Three PRs incoming. SLAs compress. Missed deadlines auto-reject, but approving bad code is worse.</p>
              </div>
            </div>
          </div>

          <div class="title-actions">
            <button class="btn btn-primary btn-large" data-action="start" data-autofocus>
              <span class="btn-key">ENTER</span> START SHIFT
            </button>
            <button class="btn" data-action="guidelines">
              <span class="btn-key">G</span> READ GUIDELINES
            </button>
          </div>

          <div class="title-controls">
            <div class="panel-title">CONTROL REFERENCE</div>
            <div class="control-grid">${controlRows()}</div>
          </div>
        </section>

        <div class="title-footer">
          <span>REVIEWERS ONLINE: 1</span>
          <span>AI MERGE REQUESTS TODAY: 14,882</span>
          <span>INCIDENTS: 3</span>
        </div>
      </main>
    `;
  }

  private renderShift(): string {
    const state = this.game.state;
    const active = this.game.activePR();

    return `
      <div class="terminal-shell shift-screen">
        ${this.renderHud(state)}
        ${this.renderQueue(state)}
        <main class="workspace">
          ${active === null ? this.renderEmptyReview(state) : this.renderReview(active)}
          <aside class="sidebar">
            ${active === null ? this.renderEmptySidebar(state) : this.renderSidebar(active)}
          </aside>
        </main>
        ${this.renderFooter(state)}
      </div>
    `;
  }

  private renderHud(state: GameState): string {
    return `
      <header class="hud">
        <div class="brand-block">
          <div class="brand">NEXUS<span>//</span>ENG-REVIEW</div>
          <div class="hud-sub">SHIFT 01 · T+${formatClock(state.elapsedMs)} · QUEUE ${
            PULL_REQUESTS.filter(
              (pr) => state.prs[pr.id].status === 'available',
            ).length
          } OPEN</div>
        </div>
        <div class="metrics">
          ${metricBar('QLTY', state.metrics.quality)}
          ${metricBar('SEC', state.metrics.security)}
          ${metricBar('THRU', state.metrics.throughput)}
        </div>
        <div class="score-block">
          <span class="hud-label">REVIEW SCORE</span>
          <span class="score-value">${formatPoints(state.score, true)}</span>
        </div>
      </header>
    `;
  }

  private renderQueue(state: GameState): string {
    const tabs = PULL_REQUESTS.map((pr, index) => {
      const runtime = state.prs[pr.id];
      const active = state.activePrId === pr.id;
      const disabled = runtime.status !== 'available';
      const clock = this.queueClock(state, pr, runtime);
      const stateLabel =
        runtime.status === 'resolved'
          ? runtime.verdict === 'approved'
            ? 'MERGED'
            : 'CLOSED'
          : runtime.status === 'waiting'
            ? 'INBOUND'
            : 'READY';

      return `
        <button
          class="queue-tab ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''} ${clock.critical ? 'is-critical' : ''}"
          data-action="select-pr"
          data-pr-id="${pr.id}"
          ${disabled ? 'disabled' : ''}
          aria-current="${active ? 'true' : 'false'}"
          title="PR #${pr.number}: ${escapeHtml(pr.title)}"
        >
          <span class="queue-index">[${index + 1}]</span>
          <span class="queue-number">#${pr.number}</span>
          <span class="queue-title">${escapeHtml(pr.title)}</span>
          <span class="queue-status">${stateLabel}</span>
          <span class="queue-clock" data-clock="${pr.id}">${clock.label}</span>
        </button>
      `;
    }).join('');

    return `
      <nav class="queue" aria-label="Pull request queue">
        <div class="queue-label">QUEUE</div>
        ${tabs}
      </nav>
    `;
  }

  private queueClock(
    state: GameState,
    pr: PullRequest,
    runtime: PRRuntime,
  ): { label: string; critical: boolean } {
    if (runtime.status === 'waiting') {
      return {
        label: `T-${formatClock(
          Math.max(0, pr.arrivalDelayMs - state.elapsedMs),
        )}`,
        critical: false,
      };
    }

    if (runtime.status === 'resolved') {
      if (runtime.verdict === 'approved') {
        return { label: 'MERGED', critical: false };
      }
      if (runtime.verdict === 'timeout') {
        return { label: 'TIMEOUT', critical: true };
      }
      return { label: 'BLOCKED', critical: false };
    }

    const remaining = remainingFor(state, pr);
    return {
      label: formatClock(remaining),
      critical: remaining <= 30_000,
    };
  }

  private renderReview(pr: PullRequest): string {
    const state = this.game.state;
    const runtime = state.prs[pr.id];
    const file = pr.files[runtime.fileIndex];
    if (file === undefined) {
      return this.renderEmptyReview(state);
    }

    const remaining = remainingFor(state, pr);
    const critical = remaining <= 30_000;
    const agent = pr.authorKind === 'agent';
    const fileTabs = pr.files
      .map(
        (item, index) => `
        <button
          class="file-tab ${index === runtime.fileIndex ? 'is-active' : ''}"
          data-action="select-file"
          data-file-index="${index}"
          title="${escapeHtml(item.path)}"
        >
          ${index === runtime.fileIndex ? '▸ ' : ''}${escapeHtml(
            basename(item.path),
          )}
        </button>
      `,
      )
      .join('');

    return `
      <section class="review-panel panel">
        <div class="review-head">
          <div class="review-heading">
            <div class="eyebrow">
              PULL REQUEST #${pr.number}
              <span class="author-tag ${agent ? 'is-agent' : ''}">${
                agent ? 'AI AGENT' : 'HUMAN'
              }</span>
            </div>
            <h1>${escapeHtml(pr.title)}</h1>
            <div class="review-sub">
              ${escapeHtml(pr.author)} · ${escapeHtml(pr.branch)} · ${pr.files.length} file${
                pr.files.length === 1 ? '' : 's'
              }
            </div>
          </div>
          <div class="sla-block ${critical ? 'is-critical' : ''}" data-sla-block="${pr.id}">
            <div class="sla-label">SLA REMAINING</div>
            <div class="sla-time" data-sla-time="${pr.id}">${formatClock(remaining)}</div>
            <div class="sla-track">
              <i data-sla-meter="${pr.id}" style="width:${Math.max(
                0,
                Math.min(100, (remaining / pr.slaMs) * 100),
              )}%"></i>
            </div>
          </div>
        </div>

        <div class="file-bar">
          <div class="file-tabs">${fileTabs}</div>
          <div class="file-hint">[ / ] SWITCH FILE</div>
        </div>

        <div class="code-shell">
          <div class="code-head">
            <span>DIFF · ${escapeHtml(file.path)}</span>
            <span>${pr.ci} · TESTS ${escapeHtml(pr.tests)}</span>
          </div>
          <div class="code-scroll" tabindex="0" aria-label="Code review diff">
            <div class="code">
              ${file.lines
                .map((line, index) =>
                  this.renderCodeLine(
                    line,
                    index,
                    runtime.lineIndex,
                    runtime,
                    file,
                  ),
                )
                .join('')}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private renderCodeLine(
    line: DiffLine,
    index: number,
    cursorIndex: number,
    runtime: PRRuntime,
    file: DiffFile,
  ): string {
    const isCursor = index === cursorIndex;
    const flags = runtime.flags.filter(
      (flag) => flag.filePath === file.path && flag.lineId === line.id,
    );
    const marks = flags
      .map(
        (flag) =>
          `<span class="flag-tag ${typeClass(flag.type)}" title="${TYPE_LABEL[flag.type]}">${TYPE_SHORT[flag.type]}</span>`,
      )
      .join('');
    const kindMark = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ';
    const text = line.text.length === 0 ? ' ' : highlightCode(line.text);

    return `
      <div
        class="code-line kind-${line.kind} ${isCursor ? 'is-cursor' : ''} ${
          flags.length > 0 ? 'has-flag' : ''
        }"
        data-action="select-line"
        data-line-id="${line.id}"
        role="button"
        tabindex="-1"
        aria-label="Line ${line.newNo ?? line.oldNo ?? index + 1}"
      >
        <span class="cursor-mark">${isCursor ? '>' : ' '}</span>
        <span class="line-old">${line.oldNo ?? ''}</span>
        <span class="line-new">${line.newNo ?? ''}</span>
        <span class="diff-mark">${kindMark}</span>
        <span class="flag-rail">${marks}</span>
        <span class="code-text">${text}</span>
      </div>
    `;
  }

  private renderSidebar(pr: PullRequest): string {
    const runtime = this.game.state.prs[pr.id];

    return `
      ${this.renderFindings(pr, runtime)}
      <section class="panel side-panel meta-panel">
        <div class="panel-title">PR METADATA</div>
        <div class="meta-row"><span>AUTHOR</span><strong>${escapeHtml(pr.author)}</strong></div>
        <div class="meta-row"><span>TYPE</span><strong class="${pr.authorKind === 'agent' ? 'agent-text' : ''}">${
          pr.authorKind === 'agent' ? 'AUTONOMOUS AGENT' : 'HUMAN ENGINEER'
        }</strong></div>
        <div class="meta-row"><span>BRANCH</span><strong>${escapeHtml(pr.branch)}</strong></div>
        <div class="meta-row"><span>CI</span><strong>${escapeHtml(pr.ci)}</strong></div>
        <div class="meta-row"><span>TESTS</span><strong>${escapeHtml(pr.tests)}</strong></div>
        <p class="pr-description">${escapeHtml(pr.description)}</p>
      </section>

      <section class="panel side-panel actions-panel">
        <div class="panel-title">DECISION</div>
        <div class="action-grid">
          <button class="btn btn-primary" data-action="approve">
            <span class="btn-key">A</span> APPROVE
          </button>
          <button class="btn btn-danger" data-action="reject">
            <span class="btn-key">R</span> REJECT
          </button>
        </div>
        <div class="action-hint">Rejection requires at least one line finding.</div>
        <div class="action-grid secondary-actions">
          <button class="btn btn-quiet" data-action="guidelines">
            <span class="btn-key">G</span> GUIDELINES
          </button>
          <button class="btn btn-quiet" data-action="pause">
            <span class="btn-key">P</span> PAUSE
          </button>
        </div>
      </section>
    `;
  }

  private renderFindings(pr: PullRequest, runtime: PRRuntime): string {
    const findings = runtime.flags
      .map((flag, index) => {
        const file = pr.files.find((item) => item.path === flag.filePath);
        const line = file?.lines.find((item) => item.id === flag.lineId);
        const lineLabel = line?.newNo ?? line?.oldNo ?? '?';
        return `
          <button
            class="finding-row ${typeClass(flag.type)}"
            data-action="select-line"
            data-line-id="${flag.lineId}"
            title="Jump to ${escapeHtml(flag.filePath)}:${lineLabel}"
          >
            <span class="finding-index">${String(index + 1).padStart(2, '0')}</span>
            <span class="finding-type">${TYPE_LABEL[flag.type]}</span>
            <span class="finding-location">${escapeHtml(
              basename(flag.filePath),
            )}:${lineLabel}</span>
          </button>
        `;
      })
      .join('');

    return `
      <section class="panel side-panel findings-panel">
        <div class="panel-title">
          FINDINGS <span class="count-badge">${runtime.flags.length}</span>
        </div>
        <div class="finding-list">
          ${findings.length > 0 ? findings : '<div class="empty-copy">No violations flagged. Use S / L / X on a line to cite a rule.</div>'}
        </div>
        <div class="finding-help">
          <button class="flag-action type-style" data-action="flag" data-flag-type="STYLE" title="Flag current line as a style violation">
            <kbd>S</kbd> STYLE
          </button>
          <button class="flag-action type-logic" data-action="flag" data-flag-type="LOGIC" title="Flag current line as a logic violation">
            <kbd>L</kbd> LOGIC
          </button>
          <button class="flag-action type-security" data-action="flag" data-flag-type="SECURITY" title="Flag current line as a security violation">
            <kbd>X</kbd> SECURITY
          </button>
          <button class="flag-action" data-action="clear-line" title="Clear findings on current line">
            <kbd>BKSP</kbd> CLEAR
          </button>
        </div>
      </section>
    `;
  }

  private renderEmptyReview(state: GameState): string {
    const waiting = PULL_REQUESTS.filter(
      (pr) => state.prs[pr.id].status === 'waiting',
    );
    return `
      <section class="review-panel panel empty-review">
        <div class="empty-glyph">[ NO ACTIVE PULL REQUEST ]</div>
        <p>${
          waiting.length > 0
            ? `${waiting.length} PR${waiting.length === 1 ? '' : 's'} still inbound.`
            : 'Queue drained. Generating report.'
        }</p>
      </section>
    `;
  }

  private renderEmptySidebar(state: GameState): string {
    return `
      <section class="panel side-panel">
        <div class="panel-title">FINDINGS</div>
        <div class="empty-copy">No active review.</div>
      </section>
      <section class="panel side-panel">
        <div class="panel-title">QUEUE</div>
        <div class="empty-copy">${
          PULL_REQUESTS.filter(
            (pr) => state.prs[pr.id].status === 'waiting',
          ).length
        } inbound.</div>
      </section>
    `;
  }

  private renderFooter(state: GameState): string {
    const logs = state.log
      .slice(0, 3)
      .map(
        (entry) => `
        <div class="log-line tone-${entry.tone}">
          <span class="log-time">[${formatClock(entry.atMs)}]</span>
          <span>${escapeHtml(entry.text)}</span>
        </div>
      `,
      )
      .join('');

    return `
      <footer class="status-bar">
        <div class="log-strip" aria-live="polite">${logs}</div>
        <div class="status-hints">
          <span>↑↓ MOVE</span>
          <span>S/L/X FLAG</span>
          <span>A APPROVE</span>
          <span>R REJECT</span>
          <span>G RULES</span>
          <span>? HELP</span>
        </div>
      </footer>
    `;
  }

  private renderGuidelines(): string {
    const groups = TYPE_ORDER.map((type) => {
      const guidelines = GUIDELINES.filter(
        (guideline) => guideline.type === type,
      );
      return `
        <div class="guideline-group">
          <h3 class="${typeClass(type)}">${TYPE_LABEL[type]}</h3>
          ${guidelines
            .map(
              (guideline) => `
              <article class="guideline-item">
                <div class="guideline-head">
                  <span class="guideline-id ${typeClass(type)}">${guideline.id}</span>
                  <strong>${escapeHtml(guideline.title)}</strong>
                </div>
                <p>${prose(guideline.summary)}</p>
              </article>
            `,
            )
            .join('')}
        </div>
      `;
    }).join('');

    const timerNote =
      this.game.state.screen === 'shift'
        ? '<span class="warning-text">SHIFT TIMERS CONTINUE WHILE THIS PANEL IS OPEN</span>'
        : '';

    return `
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="guidelines-title">
        <section class="modal guidelines-modal">
          <div class="modal-head">
            <div>
              <div class="eyebrow">NEXUS ENGINEERING / HANDBOOK v4.2</div>
              <h2 id="guidelines-title">REVIEW GUIDELINES</h2>
            </div>
            <button class="btn btn-quiet" data-action="close-guidelines">
              <span class="btn-key">ESC</span> CLOSE
            </button>
          </div>
          <div class="guideline-grid">${groups}</div>
          <div class="modal-foot">
            ${timerNote}
            <span>Cite any line with <kbd>S</kbd> / <kbd>L</kbd> / <kbd>X</kbd>.</span>
          </div>
        </section>
      </div>
    `;
  }

  private renderPauseOverlay(): string {
    return `
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <section class="modal pause-modal">
          <div class="eyebrow">SHIFT CLOCK HALTED</div>
          <h2 id="pause-title" class="pause-title">PAUSED</h2>
          <p>The queue is holding. No SLAs are draining.</p>
          <button class="btn btn-primary" data-action="resume" data-autofocus>
            <span class="btn-key">P</span> RESUME SHIFT
          </button>
        </section>
      </div>
    `;
  }

  private renderModal(state: GameState): string {
    const modal = state.modal;
    if (modal === null) {
      return '';
    }

    if (modal.type === 'confirm-approve') {
      const pr = PR_BY_ID[modal.prId];
      const runtime = pr === undefined ? undefined : state.prs[pr.id];
      if (pr === undefined || runtime === undefined) {
        return '';
      }

      return `
        <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <section class="modal confirm-modal">
            <div class="eyebrow">MERGE OVERRIDE</div>
            <h2 id="confirm-title">UNRESOLVED FINDINGS</h2>
            <p>You have flagged <strong>${runtime.flags.length}</strong> violation${
              runtime.flags.length === 1 ? '' : 's'
            } on PR #${pr.number}, but you are about to approve it.</p>
            <p class="warning-text">Approving will merge the code with your findings unresolved.</p>
            <div class="modal-actions">
              <button class="btn" data-action="dismiss-modal" data-autofocus>
                <span class="btn-key">ESC</span> CANCEL
              </button>
              <button class="btn btn-danger" data-action="confirm-approve">
                <span class="btn-key">ENTER</span> APPROVE ANYWAY
              </button>
            </div>
          </section>
        </div>
      `;
    }

    if (modal.type === 'help') {
      return `
        <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <section class="modal help-modal">
            <div class="modal-head">
              <div>
                <div class="eyebrow">REVIEWER INTERFACE</div>
                <h2 id="help-title">CONTROLS</h2>
              </div>
              <button class="btn btn-quiet" data-action="dismiss-modal" data-autofocus>
                <span class="btn-key">ESC</span> CLOSE
              </button>
            </div>
            <div class="control-grid">${controlRows()}</div>
            <div class="modal-foot">Mouse works too: click queue tabs, file tabs, lines, and actions.</div>
          </section>
        </section>
      `;
    }

    const result = modal.result;
    const pr = PR_BY_ID[result.prId];
    if (pr === undefined) {
      return '';
    }

    const stamp =
      result.verdict === 'timeout'
        ? 'AUTO-REJECTED'
        : result.verdict.toUpperCase();
    const stampClass = result.correctAction ? 'is-good' : 'is-bad';
    const incidentText = result.securityIncident
      ? 'SECURITY INCIDENT LOGGED'
      : result.qualityIncident
        ? 'QUALITY INCIDENT LOGGED'
        : '';
    const headline =
      result.verdict === 'timeout'
        ? 'SLA EXPIRED · CODE DID NOT SHIP'
        : result.verdict === 'approved'
          ? result.correctAction
            ? 'CLEAN MERGE'
            : 'SHIPPED WITH DEFECTS'
          : result.correctAction
            ? 'CHANGES REQUESTED'
            : 'FALSE ALARM';

    const caught = result.caught
      .map((defect) => this.renderDefectRow(pr, defect, true))
      .join('');
    const missed = result.missed
      .map((defect) => this.renderDefectRow(pr, defect, false))
      .join('');
    const falseFlags = result.falseFlags
      .map((flag) => this.renderFalseFlag(pr, flag))
      .join('');

    return `
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="verdict-title">
        <section class="modal verdict-modal">
          <div class="verdict-top">
            <div>
              <div class="eyebrow">PR #${pr.number} · REVIEW RESULT</div>
              <h2 id="verdict-title">${escapeHtml(pr.title)}</h2>
              <p class="verdict-headline">${headline}</p>
            </div>
            <div class="stamp ${stampClass}">${stamp}</div>
          </div>

          <div class="verdict-stats">
            <div><span>SCORE</span><strong class="${result.scoreDelta >= 0 ? 'positive' : 'negative'}">${formatPoints(result.scoreDelta, true)}</strong></div>
            <div><span>CAUGHT</span><strong>${result.caught.length}/${pr.defects.length}</strong></div>
            <div><span>FALSE FLAGS</span><strong>${result.falseFlags.length}</strong></div>
            <div><span>TIME LEFT</span><strong>${formatClock(result.remainingMs)}</strong></div>
          </div>

          ${incidentText ? `<div class="incident-banner">${incidentText}</div>` : ''}

          <div class="postmortem-grid">
            <div class="postmortem-block">
              <div class="panel-title">CAUGHT</div>
              ${caught.length > 0 ? caught : '<div class="empty-copy">None.</div>'}
            </div>
            <div class="postmortem-block">
              <div class="panel-title">MISSED</div>
              ${missed.length > 0 ? missed : '<div class="empty-copy">None.</div>'}
            </div>
            <div class="postmortem-block">
              <div class="panel-title">FALSE FLAGS</div>
              ${falseFlags.length > 0 ? falseFlags : '<div class="empty-copy">None.</div>'}
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-primary" data-action="dismiss-modal" data-autofocus>
              <span class="btn-key">ENTER</span> ${modal.final ? 'VIEW SHIFT REPORT' : 'CONTINUE QUEUE'}
            </button>
          </div>
        </section>
      </div>
    `;
  }

  private renderDefectRow(
    pr: PullRequest,
    defect: Defect,
    caught: boolean,
  ): string {
    const locations = this.defectLocations(pr, defect);
    const guideline = GUIDELINE_BY_ID[defect.guidelineId];
    return `
      <div class="defect-row ${caught ? 'is-caught' : 'is-missed'}">
        <div class="defect-meta">
          <span class="guideline-id ${typeClass(defect.type)}">${defect.guidelineId}</span>
          <span>${escapeHtml(locations)}</span>
        </div>
        <strong>${escapeHtml(defect.title)}</strong>
        <p>${escapeHtml(defect.explanation)}</p>
        ${
          guideline === undefined
            ? ''
            : `<span class="defect-rule">${escapeHtml(guideline.title)}</span>`
        }
      </div>
    `;
  }

  private renderFalseFlag(pr: PullRequest, flag: ReviewFlag): string {
    const file = pr.files.find((item) => item.path === flag.filePath);
    const line = file?.lines.find((item) => item.id === flag.lineId);
    return `
      <div class="defect-row is-false">
        <div class="defect-meta">
          <span class="guideline-id ${typeClass(flag.type)}">${TYPE_LABEL[flag.type]}</span>
          <span>${escapeHtml(basename(flag.filePath))}:${line?.newNo ?? '?'}</span>
        </div>
        <p>No matching violation at this location.</p>
      </div>
    `;
  }

  private defectLocations(pr: PullRequest, defect: Defect): string {
    return defect.lineIds
      .map((lineId) => {
        const file = pr.files.find((item) =>
          item.lines.some((line) => line.id === lineId),
        );
        const line = file?.lines.find((item) => item.id === lineId);
        return `${basename(file?.path ?? '?')}:${line?.newNo ?? '?'}`;
      })
      .join(' · ');
  }

  private renderSummary(): string {
    const state = this.game.state;
    const rank = rankFor(state.score, state.metrics);
    const correct = state.results.filter((result) => result.correctAction).length;
    const incidents = state.results.filter(
      (result) => result.securityIncident || result.qualityIncident,
    ).length;

    const rows = PULL_REQUESTS.map((pr) => {
      const result = state.results.find((item) => item.prId === pr.id);
      if (result === undefined) {
        return '';
      }
      const caughtTotal = pr.defects.length;
      const reviewText =
        caughtTotal === 0
          ? result.verdict === 'approved'
            ? 'CLEAN APPROVAL'
            : 'CLEAN PR BLOCKED'
          : `CAUGHT ${result.caught.length}/${caughtTotal} · FALSE ${result.falseFlags.length}`;
      const verdictClass =
        result.correctAction
          ? 'is-good'
          : result.verdict === 'timeout'
            ? 'is-warn'
            : 'is-bad';

      return `
        <div class="result-row">
          <div class="result-pr">
            <span>#${pr.number}</span>
            <strong>${escapeHtml(pr.title)}</strong>
            <small>${escapeHtml(pr.author)}</small>
          </div>
          <div class="result-verdict ${verdictClass}">${verdictLabel(result)}</div>
          <div class="result-review">${reviewText}</div>
          <div class="result-score ${result.scoreDelta >= 0 ? 'positive' : 'negative'}">${formatPoints(result.scoreDelta, true)}</div>
        </div>
      `;
    }).join('');

    return `
      <main class="summary-screen">
        <section class="summary-card panel">
          <div class="eyebrow">SHIFT 01 / COMPLETE · PERFORMANCE REVIEW</div>
          <div class="summary-hero">
            <div>
              <h1>${rank.label}</h1>
              <p>${escapeHtml(rank.caption)}</p>
            </div>
            <div class="summary-score">
              <span>FINAL SCORE</span>
              <strong>${formatPoints(state.score, true)}</strong>
            </div>
          </div>

          <div class="summary-metrics">
            ${metricBar('QUALITY', state.metrics.quality)}
            ${metricBar('SECURITY', state.metrics.security)}
            ${metricBar('THROUGHPUT', state.metrics.throughput)}
          </div>

          <div class="summary-totals">
            <span>CORRECT DECISIONS <strong>${correct}/${state.results.length}</strong></span>
            <span>INCIDENTS <strong class="${incidents > 0 ? 'negative' : 'positive'}">${incidents}</strong></span>
            <span>SHIFT TIME <strong>${formatClock(state.elapsedMs)}</strong></span>
          </div>

          <div class="results-table">
            <div class="result-row result-header">
              <span>PULL REQUEST</span>
              <span>OUTCOME</span>
              <span>REVIEW QUALITY</span>
              <span>POINTS</span>
            </div>
            ${rows}
          </div>

          <div class="summary-actions">
            <button class="btn btn-primary btn-large" data-action="replay" data-autofocus>
              <span class="btn-key">ENTER</span> REPLAY SHIFT
            </button>
            <span class="summary-note">The queue does not stop for you.</span>
          </div>
        </section>
      </main>
    `;
  }

  private tickClocks(): void {
    const state = this.game.state;
    if (state.screen !== 'shift') {
      return;
    }

    for (const pr of PULL_REQUESTS) {
      const runtime = state.prs[pr.id];
      const queueClock = this.root.querySelector<HTMLElement>(
        `[data-clock="${pr.id}"]`,
      );
      const clock = this.queueClock(state, pr, runtime);
      if (queueClock !== null) {
        queueClock.textContent = clock.label;
        queueClock.closest('.queue-tab')?.classList.toggle(
          'is-critical',
          clock.critical,
        );
      }

      const slaTime = this.root.querySelector<HTMLElement>(
        `[data-sla-time="${pr.id}"]`,
      );
      const slaBlock = this.root.querySelector<HTMLElement>(
        `[data-sla-block="${pr.id}"]`,
      );
      const slaMeter = this.root.querySelector<HTMLElement>(
        `[data-sla-meter="${pr.id}"]`,
      );

      if (
        runtime.status === 'available' &&
        slaTime !== null &&
        slaBlock !== null &&
        slaMeter !== null
      ) {
        const remaining = remainingFor(state, pr);
        slaTime.textContent = formatClock(remaining);
        slaBlock.classList.toggle('is-critical', remaining <= 30_000);
        slaMeter.style.width = `${Math.max(
          0,
          Math.min(100, (remaining / pr.slaMs) * 100),
        )}%`;
      }
    }
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const trigger = target.closest<HTMLElement>('[data-action]');
    if (trigger === null) {
      return;
    }

    const action = trigger.dataset.action;
    if (action === undefined) {
      return;
    }

    event.preventDefault();

    switch (action) {
      case 'start':
        this.revealCursorNext = true;
        this.game.startShift();
        break;
      case 'select-pr': {
        if (trigger instanceof HTMLButtonElement && trigger.disabled) {
          return;
        }
        const prId = trigger.dataset.prId;
        if (prId !== undefined) {
          this.revealCursorNext = true;
          this.game.selectPR(prId);
        }
        break;
      }
      case 'select-file': {
        const fileIndex = Number(trigger.dataset.fileIndex);
        if (Number.isFinite(fileIndex)) {
          this.revealCursorNext = true;
          this.game.selectFile(fileIndex);
        }
        break;
      }
      case 'select-line': {
        const lineId = trigger.dataset.lineId;
        if (lineId !== undefined) {
          this.game.selectLine(lineId);
        }
        break;
      }
      case 'flag': {
        const type = trigger.dataset.flagType;
        if (type === 'STYLE' || type === 'LOGIC' || type === 'SECURITY') {
          this.game.toggleFlag(type);
        }
        break;
      }
      case 'clear-line':
        this.game.clearLineFlags();
        break;
      case 'approve':
        this.game.approve();
        break;
      case 'reject':
        this.game.reject();
        break;
      case 'confirm-approve':
        this.game.confirmApprove();
        break;
      case 'pause':
        this.game.togglePause();
        break;
      case 'resume':
        this.game.togglePause();
        break;
      case 'guidelines':
        this.game.toggleGuidelines();
        break;
      case 'close-guidelines':
        this.game.closeGuidelines();
        break;
      case 'dismiss-modal':
        this.game.dismissModal();
        break;
      case 'replay':
        this.revealCursorNext = true;
        this.game.replay();
        break;
      case 'help':
        this.game.openHelp();
        break;
      default:
        break;
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const lower = event.key.toLowerCase();
    const state = this.game.state;

    if (state.modal !== null) {
      if (state.modal.type === 'confirm-approve') {
        if (lower === 'enter') {
          event.preventDefault();
          this.game.confirmApprove();
        } else if (lower === 'escape') {
          event.preventDefault();
          this.game.dismissModal();
        }
        return;
      }

      if (lower === 'enter' || lower === ' ' || lower === 'escape') {
        event.preventDefault();
        this.game.dismissModal();
      }
      return;
    }

    if (state.screen === 'title') {
      if (state.guidelinesOpen) {
        if (lower === 'escape' || lower === 'g') {
          event.preventDefault();
          this.game.closeGuidelines();
        }
        return;
      }
      if (lower === 'enter' || lower === ' ') {
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.startShift();
      } else if (lower === 'g') {
        event.preventDefault();
        this.game.toggleGuidelines();
      } else if (lower === '?') {
        event.preventDefault();
        this.game.openHelp();
      }
      return;
    }

    if (state.screen === 'summary') {
      if (lower === 'enter' || lower === 'r') {
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.replay();
      } else if (lower === '?') {
        event.preventDefault();
        this.game.openHelp();
      }
      return;
    }

    if (state.guidelinesOpen) {
      if (lower === 'escape' || lower === 'g') {
        event.preventDefault();
        this.game.closeGuidelines();
      }
      return;
    }

    if (state.paused) {
      if (lower === 'p' || lower === 'escape') {
        event.preventDefault();
        this.game.togglePause();
      }
      return;
    }

    if (
      event.repeat &&
      ['a', 'r', 's', 'l', 'x', 'g', 'p', '?', '[', ']', 'tab', '1', '2', '3'].includes(
        lower,
      )
    ) {
      return;
    }

    switch (lower) {
      case 'arrowup':
      case 'k':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.moveCursor(-1);
        break;
      case 'arrowdown':
      case 'j':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.moveCursor(1);
        break;
      case 'pageup':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.moveCursor(-10);
        break;
      case 'pagedown':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.moveCursor(10);
        break;
      case 'home':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.jumpCursor('home');
        break;
      case 'end':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.jumpCursor('end');
        break;
      case 'tab':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.cyclePR(event.shiftKey ? -1 : 1);
        break;
      case '1':
      case '2':
      case '3': {
        event.preventDefault();
        const pr = PULL_REQUESTS[Number(lower) - 1];
        if (pr !== undefined) {
          const runtime = state.prs[pr.id];
          if (runtime.status === 'available') {
            this.revealCursorNext = true;
            this.game.selectPR(pr.id);
          } else if (runtime.status === 'waiting') {
            this.game.addLog(`PR #${pr.number} is still inbound.`, 'warning');
            this.render();
          }
        }
        break;
      }
      case '[':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.cycleFile(-1);
        break;
      case ']':
        event.preventDefault();
        this.revealCursorNext = true;
        this.game.cycleFile(1);
        break;
      case 's':
        event.preventDefault();
        this.game.toggleFlag('STYLE');
        break;
      case 'l':
        event.preventDefault();
        this.game.toggleFlag('LOGIC');
        break;
      case 'x':
        event.preventDefault();
        this.game.toggleFlag('SECURITY');
        break;
      case 'backspace':
      case 'delete':
        event.preventDefault();
        this.game.clearLineFlags();
        break;
      case 'a':
        event.preventDefault();
        this.game.approve();
        break;
      case 'r':
        event.preventDefault();
        this.game.reject();
        break;
      case 'g':
        event.preventDefault();
        this.game.toggleGuidelines();
        break;
      case 'p':
        event.preventDefault();
        this.game.togglePause();
        break;
      case '?':
      case 'h':
        event.preventDefault();
        this.game.openHelp();
        break;
      default:
        break;
    }
  };

  private handleVisibilityChange = (): void => {
    const state = this.game.state;
    if (
      document.hidden &&
      state.screen === 'shift' &&
      !state.paused &&
      state.modal === null
    ) {
      this.game.togglePause();
    }
  };
}
