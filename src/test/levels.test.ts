import { describe, expect, it } from 'vitest';
import { GUIDELINES, GUIDELINE_BY_ID } from '../data/guidelines';
import { PULL_REQUESTS } from '../data/levels';

describe('PR level data', () => {
  it('contains exactly three PRs with unique identifiers', () => {
    expect(PULL_REQUESTS).toHaveLength(3);
    expect(new Set(PULL_REQUESTS.map((pr) => pr.id)).size).toBe(3);
    expect(new Set(PULL_REQUESTS.map((pr) => pr.number)).size).toBe(3);
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

  it('gives every PR exactly one defect from its guideline', () => {
    for (const pr of PULL_REQUESTS) {
      expect(pr.defects).toHaveLength(1);
      const defect = pr.defects[0];
      expect(defect.guidelineId).toBe(
        `${defect.type}-01`,
      );
      expect(GUIDELINE_BY_ID[defect.guidelineId]?.type).toBe(defect.type);
    }

    expect(PULL_REQUESTS.map((pr) => pr.defects[0].type)).toEqual([
      'STYLE',
      'ERROR',
      'SECURITY',
    ]);
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
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
    expect(arrivals[0]).toBe(0);
    expect(arrivals[2] - arrivals[1]).toBeLessThan(
      arrivals[1] - arrivals[0],
    );
    expect(PULL_REQUESTS.every((pr) => pr.slaMs > 0)).toBe(true);
  });
});
