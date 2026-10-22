import { describe, expect, it } from 'vitest';
import { GUIDELINE_BY_ID } from '../data/guidelines';
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

  it('references only real lines and guidelines from defects', () => {
    for (const pr of PULL_REQUESTS) {
      const lineIds = new Set(
        pr.files.flatMap((file) => file.lines.map((line) => line.id)),
      );

      for (const defect of pr.defects) {
        expect(lineIds.has(defect.lineIds[0])).toBe(true);
        for (const lineId of defect.lineIds) {
          expect(lineIds.has(lineId)).toBe(true);
        }
        expect(GUIDELINE_BY_ID[defect.guidelineId]).toBeDefined();
      }
    }
  });

  it('includes one clean PR and two flawed PRs with blockers', () => {
    const clean = PULL_REQUESTS.filter((pr) => pr.defects.length === 0);
    const flawed = PULL_REQUESTS.filter((pr) => pr.defects.length > 0);

    expect(clean).toHaveLength(1);
    expect(flawed).toHaveLength(2);
    for (const pr of flawed) {
      expect(
        pr.defects.some((defect) => defect.severity === 'blocker'),
      ).toBe(true);
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
