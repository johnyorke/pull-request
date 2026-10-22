import type { Guideline, ViolationType } from '../types';

export const GUIDELINES: Guideline[] = [
  {
    id: 'STYLE-01',
    type: 'STYLE',
    title: 'Declare variables with let or const',
    summary:
      'Never ship new `var` declarations. Use `let` when a variable is reassigned and `const` otherwise.',
  },
  {
    id: 'ERROR-01',
    type: 'ERROR',
    title: 'Keep conditional branches distinct',
    summary:
      'The two branches of an `if` statement must not do the same thing. Identical branches mean the condition has no effect.',
  },
  {
    id: 'SECURITY-01',
    type: 'SECURITY',
    title: 'Only send data to trusted hosts',
    summary:
      'Uploads must target known company infrastructure. Never send data to unknown or suspicious external addresses.',
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
