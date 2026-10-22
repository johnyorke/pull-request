export type ViolationType = 'STYLE' | 'LOGIC' | 'SECURITY';

export interface Guideline {
  id: string;
  type: ViolationType;
  title: string;
  summary: string;
}

export type LineKind = 'add' | 'del' | 'context';

export interface DiffLine {
  id: string;
  kind: LineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffFile {
  path: string;
  language: string;
  lines: DiffLine[];
}

export type DefectSeverity = 'blocker' | 'minor';

export interface Defect {
  id: string;
  type: ViolationType;
  guidelineId: string;
  severity: DefectSeverity;
  lineIds: string[];
  title: string;
  explanation: string;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  author: string;
  authorKind: 'human' | 'agent';
  branch: string;
  description: string;
  files: DiffFile[];
  defects: Defect[];
  arrivalDelayMs: number;
  slaMs: number;
  ci: string;
  tests: string;
}

export interface ReviewFlag {
  filePath: string;
  lineId: string;
  type: ViolationType;
}

export type PRStatus = 'waiting' | 'available' | 'resolved';
export type Verdict = 'approved' | 'rejected' | 'timeout';

export interface Metrics {
  quality: number;
  security: number;
  throughput: number;
}

export type MetricDelta = Partial<Metrics>;

export interface PRResult {
  prId: string;
  prNumber: number;
  verdict: Verdict;
  correctAction: boolean;
  clean: boolean;
  caught: Defect[];
  missed: Defect[];
  falseFlags: ReviewFlag[];
  scoreDelta: number;
  metricDelta: MetricDelta;
  remainingMs: number;
  securityIncident: boolean;
  qualityIncident: boolean;
  allDefectsCaught: boolean;
}

export interface PRRuntime {
  status: PRStatus;
  arrivedAtMs: number | null;
  deadlineAtMs: number | null;
  resolvedAtMs: number | null;
  verdict: Verdict | null;
  flags: ReviewFlag[];
  result: PRResult | null;
  fileIndex: number;
  lineIndex: number;
}

export type LogTone = 'info' | 'warning' | 'danger' | 'success';

export interface LogEntry {
  id: number;
  atMs: number;
  text: string;
  tone: LogTone;
}

export type Modal =
  | { type: 'verdict'; result: PRResult; final: boolean }
  | { type: 'confirm-approve'; prId: string }
  | { type: 'help' }
  | null;

export type Screen = 'title' | 'shift' | 'summary';

export interface GameState {
  screen: Screen;
  elapsedMs: number;
  paused: boolean;
  activePrId: string | null;
  prs: Record<string, PRRuntime>;
  metrics: Metrics;
  score: number;
  results: PRResult[];
  modal: Modal;
  guidelinesOpen: boolean;
  log: LogEntry[];
  nextLogId: number;
}
