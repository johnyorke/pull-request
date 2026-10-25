import { describe, expect, it } from 'vitest';
import { GUIDELINES, GUIDELINE_BY_ID } from '../data/guidelines';
import { createShift, MAX_SLA_MS, PULL_REQUESTS, SHIFT_SIZE } from '../data/levels';
import type { PullRequest, ViolationType } from '../types';

const LEVEL_COUNT = 11;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
}

function defectTypes(pr: PullRequest): ViolationType[] {
  return pr.defects.map((defect) => defect.type);
}

describe('PR level data', () => {
  it('contains the expected PRs with unique identifiers', () => {
    expect(PULL_REQUESTS).toHaveLength(LEVEL_COUNT);
    expect(new Set(PULL_REQUESTS.map((pr) => pr.id)).size).toBe(LEVEL_COUNT);
    expect(new Set(PULL_REQUESTS.map((pr) => pr.number)).size).toBe(LEVEL_COUNT);
  });

  it('includes a few clean PRs for approval testing', () => {
    const clean = PULL_REQUESTS.filter((pr) => pr.defects.length === 0);

    expect(clean.length).toBeGreaterThanOrEqual(2);
  });

  it('includes a PR with multiple offences of the same type', () => {
    const repeatedType = PULL_REQUESTS.find((pr) => {
      const counts = defectTypes(pr).reduce<Record<string, number>>(
        (totals, type) => {
          totals[type] = (totals[type] ?? 0) + 1;
          return totals;
        },
        {},
      );

      return Object.values(counts).some((count) => count > 1);
    });

    expect(repeatedType).toBeDefined();
    expect(repeatedType?.defects.length).toBeGreaterThan(1);
  });

  it('includes a PR that fails every review category', () => {
    const allThree = PULL_REQUESTS.find(
      (pr) => new Set(defectTypes(pr)).size === 3,
    );

    expect(allThree).toBeDefined();
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

  it('aligns every defect with its guideline', () => {
    for (const pr of PULL_REQUESTS) {
      for (const defect of pr.defects) {
        expect(defect.guidelineId).toBe(`${defect.type}-01`);
        expect(GUIDELINE_BY_ID[defect.guidelineId]?.type).toBe(defect.type);
      }
    }
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

  it('keeps each PR to a single file', () => {
    for (const pr of PULL_REQUESTS) {
      expect(pr.files).toHaveLength(1);
    }
  });

  it('queues a fixed number of PRs with a 30 second SLA cap', () => {
    const scheduled = createShift(() => 0.999_999);

    expect(scheduled).toHaveLength(SHIFT_SIZE);
    expect(SHIFT_SIZE).toBeGreaterThan(0);
    expect(scheduled.every((pr) => pr.slaMs === MAX_SLA_MS)).toBe(true);
    expect(MAX_SLA_MS).toBe(30_000);
  });

  it('shuffles the queue while keeping every level', () => {
    const first = createShift(seededRandom(1)).map((pr) => pr.id);
    const second = createShift(seededRandom(2)).map((pr) => pr.id);

    expect(first).not.toEqual(second);
    expect([...first].sort()).toEqual([...second].sort());
    expect(first).toHaveLength(SHIFT_SIZE);
  });
});
