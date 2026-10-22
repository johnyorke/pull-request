import { describe, expect, it } from 'vitest';
import { PR_BY_ID, PULL_REQUESTS } from '../data/levels';
import { applyMetrics, evaluatePR, rankFor } from '../game/scoring';
import type { Defect, PullRequest, ReviewFlag, ViolationType } from '../types';

const [offByOne, cleanPr, malicious] = PULL_REQUESTS;

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
  it('rewards catching every defect in a flawed PR', () => {
    const flags = offByOne.defects.map((defect) => flagFor(offByOne, defect));
    const result = evaluatePR(offByOne, flags, 'rejected', 90_000);

    expect(result.correctAction).toBe(true);
    expect(result.caught).toHaveLength(2);
    expect(result.missed).toHaveLength(0);
    expect(result.falseFlags).toHaveLength(0);
    expect(result.allDefectsCaught).toBe(true);
    expect(result.scoreDelta).toBeGreaterThan(300);
  });

  it('rewards a clean approval without incidents', () => {
    const result = evaluatePR(cleanPr, [], 'approved', 60_000);

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
          lineId: cleanPr.files[0].lines[13].id,
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
    const result = evaluatePR(malicious, [], 'approved', 40_000);

    expect(result.correctAction).toBe(false);
    expect(result.securityIncident).toBe(true);
    expect(result.qualityIncident).toBe(true);
    expect(result.scoreDelta).toBeLessThan(-300);
    expect(result.metricDelta.security).toBeLessThan(0);
  });

  it('counts duplicate security flags on one defect only once', () => {
    const security = malicious.defects.find(
      (defect) => defect.type === 'SECURITY',
    );
    if (security === undefined) {
      throw new Error('Expected a security defect');
    }
    const file = malicious.files.find((item) =>
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
    const result = evaluatePR(malicious, flags, 'rejected', 20_000);

    expect(result.caught).toHaveLength(1);
    expect(result.falseFlags).toHaveLength(0);
    expect(result.missed).toHaveLength(1);
    expect(result.allDefectsCaught).toBe(false);
    expect(result.securityIncident).toBe(false);
  });

  it('does not credit missed defects when rejecting', () => {
    const logic = malicious.defects.find((defect) => defect.type === 'LOGIC');
    const security = malicious.defects.find(
      (defect) => defect.type === 'SECURITY',
    );
    if (logic === undefined || security === undefined) {
      throw new Error('Expected both defects');
    }

    const result = evaluatePR(
      malicious,
      [flagFor(malicious, logic)],
      'rejected',
      30_000,
    );

    expect(result.correctAction).toBe(true);
    expect(result.caught).toHaveLength(1);
    expect(result.missed).toHaveLength(1);
    expect(result.allDefectsCaught).toBe(false);
  });

  it('penalizes an expired SLA', () => {
    const result = evaluatePR(offByOne, [], 'timeout', 0);

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
    expect(PR_BY_ID[offByOne.id]).toBe(offByOne);
  });
});
