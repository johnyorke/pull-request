import { describe, expect, it } from 'vitest';
import { GUIDELINES, GUIDELINE_BY_ID } from '../data/guidelines';
import { PULL_REQUESTS } from '../data/levels';

describe('PR level data', () => {
  it('contains exactly four PRs with unique identifiers', () => {
    expect(PULL_REQUESTS).toHaveLength(4);
    expect(new Set(PULL_REQUESTS.map((pr) => pr.id)).size).toBe(4);
    expect(new Set(PULL_REQUESTS.map((pr) => pr.number)).size).toBe(4);
  });

  it('includes a clean PR at index one for approval testing', () => {
    expect(PULL_REQUESTS[1].defects).toHaveLength(0);
  });

  it('gives every diff line a unique stable id', () => {
    const ids = PULL_REQUESTS.flatMap((pr) =>
      pr.files.flatMap((file) => file.lines.map((line) => line.id)),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starts with one guideline per violation category', () => {
    expect(GUIDELINES).toHaveLength(3);
    expect(GUIDELINES.map((guideline) => guideline.type)).toEqual([
      'STYLE',
      'ERROR',
      'SECURITY',
    ]);
  });

  it('gives every PR at most one defect from its guideline', () => {
    for (const pr of PULL_REQUESTS) {
      expect(pr.defects.length).toBeLessThanOrEqual(1);
      for (const defect of pr.defects) {
        expect(defect.guidelineId).toBe(`${defect.type}-01`);
        expect(GUIDELINE_BY_ID[defect.guidelineId]?.type).toBe(defect.type);
      }
    }

    expect(
      PULL_REQUESTS.flatMap((pr) =>
        pr.defects.map((defect) => defect.type),
      ),
    ).toEqual(['STYLE', 'SECURITY', 'ERROR']);
  });

  it('references only real lines from defects', () => {
    for (const pr of PULL_REQUESTS) {
      const lineIds = new Set(
        pr.files.flatMap((file) => file.lines.map((line) => line.id)),
      );

      for (const defect of pr.defects) {
        expect(defect.lineIds.length).toBeGreaterThan(0);
        for (const lineId of defect.lineIds) {
          expect(lineIds.has(lineId)).toBe(true);
        }
      }
    }
  });

  it('keeps each early PR to a single file', () => {
    for (const pr of PULL_REQUESTS) {
      expect(pr.files).toHaveLength(1);
    }
  });

  it('delivers PRs on a compressing schedule', () => {
    const arrivals = PULL_REQUESTS.map((pr) => pr.arrivalDelayMs);
    const gaps = arrivals
      .slice(1)
      .map((arrival, index) => arrival - arrivals[index]);

    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
    expect(arrivals[0]).toBe(0);
    expect(
      gaps.every((gap, index) => index === 0 || gap < gaps[index - 1]),
    ).toBe(true);
    expect(PULL_REQUESTS.every((pr) => pr.slaMs > 0)).toBe(true);
  });
});
