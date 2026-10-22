import { describe, expect, it } from 'vitest';
import { PR_BY_ID, PULL_REQUESTS } from '../data/levels';
import { applyMetrics, evaluatePR, rankFor } from '../game/scoring';
import type { Defect, PullRequest, ReviewFlag, ViolationType } from '../types';

const [stylePr, cleanLevelPr, securityPr, errorPr] = PULL_REQUESTS;

const cleanPr: PullRequest = {
  id: 'pr-clean',
  number: 9999,
  title: 'Clean formatting-only change',
  author: 'test.user',
  authorKind: 'human',
  branch: 'chore/formatting',
  description: 'A safe change.',
  files: [
    {
      path: 'src/clean.ts',
      language: 'typescript',
      lines: [
        {
          id: 'clean-1',
          kind: 'add',
          oldNo: null,
          newNo: 1,
          text: 'const answer = 42;',
        },
      ],
    },
  ],
  defects: [],
  arrivalDelayMs: 0,
  slaMs: 100_000,
  ci: 'PASS',
  tests: '1 passed',
};

function flagFor(
  pr: PullRequest,
  defect: Defect,
  type: ViolationType = defect.type,
): ReviewFlag {
  const lineId = defect.lineIds[0];
  const file = pr.files.find((item) =>
    item.lines.some((line) => line.id === lineId),
  );
  if (file === undefined) {
    throw new Error(`No file found for ${lineId}`);
  }
  return { filePath: file.path, lineId, type };
}

describe('PR scoring', () => {
  it('rewards rejecting each defective PR on its guideline', () => {
    for (const pr of PULL_REQUESTS.filter((item) => item.defects.length > 0)) {
      const result = evaluatePR(
        pr,
        [flagFor(pr, pr.defects[0])],
        'rejected',
        90_000,
      );

      expect(result.correctAction).toBe(true);
      expect(result.caught).toHaveLength(1);
      expect(result.missed).toHaveLength(0);
      expect(result.falseFlags).toHaveLength(0);
      expect(result.allDefectsCaught).toBe(true);
      expect(result.scoreDelta).toBeGreaterThan(200);
    }
  });

  it('rewards a clean approval without incidents', () => {
    const result = evaluatePR(cleanPr, [], 'approved', 60_000);

    expect(result.correctAction).toBe(true);
    expect(result.clean).toBe(true);
    expect(result.securityIncident).toBe(false);
    expect(result.qualityIncident).toBe(false);
    expect(result.scoreDelta).toBeGreaterThan(200);
  });

  it('approves the clean level PR without findings', () => {
    const result = evaluatePR(cleanLevelPr, [], 'approved', 60_000);

    expect(result.correctAction).toBe(true);
    expect(result.clean).toBe(true);
    expect(result.securityIncident).toBe(false);
    expect(result.qualityIncident).toBe(false);
    expect(result.scoreDelta).toBeGreaterThan(200);
  });

  it('penalizes rejecting a clean PR', () => {
    const result = evaluatePR(
      cleanPr,
      [
        {
          filePath: cleanPr.files[0].path,
          lineId: cleanPr.files[0].lines[0].id,
          type: 'SECURITY',
        },
      ],
      'rejected',
      60_000,
    );

    expect(result.correctAction).toBe(false);
    expect(result.falseFlags).toHaveLength(1);
    expect(result.scoreDelta).toBeLessThan(0);
    expect(result.metricDelta.throughput).toBeLessThan(0);
  });

  it('treats a missed security defect on approval as an incident', () => {
    const result = evaluatePR(securityPr, [], 'approved', 40_000);

    expect(result.correctAction).toBe(false);
    expect(result.securityIncident).toBe(true);
    expect(result.qualityIncident).toBe(false);
    expect(result.scoreDelta).toBeLessThan(-200);
    expect(result.metricDelta.security).toBeLessThan(0);
  });

  it('treats a missed error defect on approval as a quality incident', () => {
    const result = evaluatePR(errorPr, [], 'approved', 40_000);

    expect(result.correctAction).toBe(false);
    expect(result.securityIncident).toBe(false);
    expect(result.qualityIncident).toBe(true);
    expect(result.scoreDelta).toBeLessThan(0);
    expect(result.metricDelta.quality).toBeLessThan(0);
  });

  it('counts duplicate flags on one defect only once', () => {
    const security = securityPr.defects[0];
    const file = securityPr.files.find((item) =>
      item.lines.some((line) => line.id === security.lineIds[0]),
    );
    if (file === undefined) {
      throw new Error('Expected a security file');
    }

    const flags: ReviewFlag[] = security.lineIds.slice(0, 2).map((lineId) => ({
      filePath: file.path,
      lineId,
      type: 'SECURITY',
    }));
    const result = evaluatePR(securityPr, flags, 'rejected', 20_000);

    expect(result.caught).toHaveLength(1);
    expect(result.falseFlags).toHaveLength(0);
    expect(result.missed).toHaveLength(0);
    expect(result.allDefectsCaught).toBe(true);
    expect(result.securityIncident).toBe(false);
  });

  it('penalizes false flags without hiding the real catch', () => {
    const error = errorPr.defects[0];
    const realFlag = flagFor(errorPr, error);
    const safeLine = errorPr.files[0].lines[0];
    const result = evaluatePR(
      errorPr,
      [
        realFlag,
        {
          filePath: errorPr.files[0].path,
          lineId: safeLine.id,
          type: 'SECURITY',
        },
      ],
      'rejected',
      50_000,
    );

    expect(result.correctAction).toBe(true);
    expect(result.caught).toHaveLength(1);
    expect(result.falseFlags).toHaveLength(1);
  });

  it('penalizes an expired SLA', () => {
    const result = evaluatePR(stylePr, [], 'timeout', 0);

    expect(result.correctAction).toBe(false);
    expect(result.scoreDelta).toBeLessThan(0);
    expect(result.metricDelta.throughput).toBeLessThan(0);
  });

  it('clamps metrics to the zero-to-one-hundred range', () => {
    expect(
      applyMetrics(
        { quality: 98, security: 5, throughput: 50 },
        { quality: 12, security: -20, throughput: 100 },
      ),
    ).toEqual({ quality: 100, security: 0, throughput: 100 });
  });

  it('ranks strong and weak shifts differently', () => {
    const senior = rankFor(1000, {
      quality: 94,
      security: 96,
      throughput: 90,
    });
    const probation = rankFor(-120, {
      quality: 32,
      security: 10,
      throughput: 44,
    });

    expect(senior.label).toBe('SENIOR REVIEWER');
    expect(probation.label).toBe('PROBATIONARY');
    expect(PR_BY_ID[stylePr.id]).toBe(stylePr);
  });
});
