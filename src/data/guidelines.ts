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
    id: 'ERROR-01',
    type: 'ERROR',
    title: 'Respect collection boundaries',
    summary:
      'Arrays are zero-indexed. A loop that reads up to `length` runs one item past the end and can crash on missing data.',
  },
  {
    id: 'SECURITY-01',
    type: 'SECURITY',
    title: 'Never transmit secrets',
    summary:
      'Production keys, tokens, credentials, and material derived from them must never enter source, logs, or outbound payloads.',
  },
];

export const GUIDELINE_BY_ID: Record<string, Guideline> = Object.fromEntries(
  GUIDELINES.map((guideline) => [guideline.id, guideline]),
);

export const TYPE_LABEL: Record<ViolationType, string> = {
  STYLE: 'Style',
  ERROR: 'Error',
  SECURITY: 'Security',
};

export const TYPE_SHORT: Record<ViolationType, string> = {
  STYLE: 'STY',
  ERROR: 'ERR',
  SECURITY: 'SEC',
};
