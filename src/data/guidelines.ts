import type { Guideline, ViolationType } from '../types';

export const GUIDELINES: Guideline[] = [
  {
    id: 'STYLE-01',
    type: 'STYLE',
    title: 'Declare variables with const or let',
    summary:
      'Never ship new `var` declarations. Use `const` by default and `let` only when reassignment is required.',
  },
  {
    id: 'STYLE-02',
    type: 'STYLE',
    title: 'Use strict equality',
    summary:
      'Use `===` and `!==`. Loose equality hides type coercion bugs and is not permitted in production code.',
  },
  {
    id: 'LOGIC-01',
    type: 'LOGIC',
    title: 'Respect collection boundaries',
    summary:
      'Arrays are zero-indexed. A loop over `0..length` must stop before the final index. Read every boundary twice.',
  },
  {
    id: 'LOGIC-02',
    type: 'LOGIC',
    title: 'Compare, do not assign',
    summary:
      'Conditions must use comparison operators. A single `=` inside an `if` or loop condition is almost always a defect.',
  },
  {
    id: 'LOGIC-03',
    type: 'LOGIC',
    title: 'Guard empty and missing values',
    summary:
      'Do not index, iterate, or dereference a value until it is known to be present. Empty inputs are normal traffic.',
  },
  {
    id: 'SECURITY-01',
    type: 'SECURITY',
    title: 'Never transmit secrets',
    summary:
      'Production keys, tokens, credentials, and material derived from them must never enter source, logs, or outbound payloads.',
  },
  {
    id: 'SECURITY-02',
    type: 'SECURITY',
    title: 'No untrusted code execution',
    summary:
      'Never pass request data to `eval`, `Function`, a shell, or an interpolated query. Use parameterized interfaces.',
  },
  {
    id: 'SECURITY-03',
    type: 'SECURITY',
    title: 'Egress only to approved hosts',
    summary:
      'Outbound network calls are restricted to allowlisted internal hosts. A friendly hostname proves nothing.',
  },
];

export const GUIDELINE_BY_ID: Record<string, Guideline> = Object.fromEntries(
  GUIDELINES.map((guideline) => [guideline.id, guideline]),
);

export const TYPE_LABEL: Record<ViolationType, string> = {
  STYLE: 'Style',
  LOGIC: 'Logic',
  SECURITY: 'Security',
};

export const TYPE_SHORT: Record<ViolationType, string> = {
  STYLE: 'STY',
  LOGIC: 'LOG',
  SECURITY: 'SEC',
};
