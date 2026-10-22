import type {
  Defect,
  MetricDelta,
  Metrics,
  PRResult,
  PullRequest,
  ReviewFlag,
  Verdict,
} from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addMetric(
  delta: MetricDelta,
  key: keyof Metrics,
  amount: number,
): void {
  delta[key] = (delta[key] ?? 0) + amount;
}

function defectScore(defect: Defect): number {
  return defect.severity === 'blocker' ? 110 : 55;
}

function defectMetric(defect: Defect): { key: keyof Metrics; amount: number } {
  if (defect.type === 'SECURITY') {
    return { key: 'security', amount: 4 };
  }
  if (defect.type === 'ERROR') {
    return { key: 'quality', amount: 3 };
  }
  return { key: 'quality', amount: 1 };
}

export function evaluatePR(
  pr: PullRequest,
  flags: ReviewFlag[],
  verdict: Verdict,
  remainingMs: number,
): PRResult {
  const caught: Defect[] = [];
  const falseFlags: ReviewFlag[] = [];

  for (const flag of flags) {
    const matches = pr.defects.filter(
      (defect) =>
        defect.type === flag.type && defect.lineIds.includes(flag.lineId),
    );

    if (matches.length === 0) {
      falseFlags.push(flag);
      continue;
    }

    for (const defect of matches) {
      if (!caught.some((item) => item.id === defect.id)) {
        caught.push(defect);
      }
    }
  }

  const missed = pr.defects.filter(
    (defect) => !caught.some((item) => item.id === defect.id),
  );
  const clean = pr.defects.length === 0;
  const allDefectsCaught = missed.length === 0;
  const correctAction =
    verdict === 'approved' ? clean : verdict === 'rejected' ? !clean : false;
  const scoreBase = Math.max(0, Math.floor(remainingMs / 1000));
  const speedBonus = verdict === 'timeout' ? 0 : Math.min(80, scoreBase);
  const metricDelta: MetricDelta = {};

  let scoreDelta = 0;
  let securityIncident = false;
  let qualityIncident = false;

  if (verdict === 'timeout') {
    scoreDelta -= 70;
    addMetric(metricDelta, 'throughput', -18);
  } else if (verdict === 'approved') {
    if (clean) {
      scoreDelta += 180 + speedBonus;
      addMetric(metricDelta, 'quality', 2);
      addMetric(metricDelta, 'security', 1);
      addMetric(metricDelta, 'throughput', 5);
    } else {
      securityIncident = pr.defects.some((defect) => defect.type === 'SECURITY');
      qualityIncident = pr.defects.some((defect) => defect.type !== 'SECURITY');

      for (const defect of pr.defects) {
        if (defect.type === 'SECURITY') {
          scoreDelta -= defect.severity === 'blocker' ? 240 : 140;
          addMetric(
            metricDelta,
            'security',
            defect.severity === 'blocker' ? -30 : -18,
          );
        } else {
          scoreDelta -= defect.severity === 'blocker' ? 150 : 80;
          addMetric(
            metricDelta,
            'quality',
            defect.severity === 'blocker' ? -20 : -10,
          );
        }
      }
      addMetric(metricDelta, 'throughput', -4);
    }
  } else {
    if (clean) {
      scoreDelta -= 100;
      addMetric(metricDelta, 'throughput', -10);
      addMetric(metricDelta, 'quality', -3);
    } else {
      scoreDelta += 70;
      for (const defect of caught) {
        scoreDelta += defectScore(defect);
        const metric = defectMetric(defect);
        addMetric(metricDelta, metric.key, metric.amount);
      }
      if (allDefectsCaught) {
        scoreDelta += 100;
      } else {
        scoreDelta -= missed.length * 15;
      }
      scoreDelta += speedBonus;
      addMetric(metricDelta, 'throughput', 3);
    }
  }

  if (falseFlags.length > 0) {
    scoreDelta -= falseFlags.length * 35;
    addMetric(metricDelta, 'quality', falseFlags.length * -2);
  }

  return {
    prId: pr.id,
    prNumber: pr.number,
    verdict,
    correctAction,
    clean,
    caught,
    missed,
    falseFlags,
    scoreDelta,
    metricDelta,
    remainingMs: Math.max(0, remainingMs),
    securityIncident,
    qualityIncident,
    allDefectsCaught,
  };
}

export function applyMetrics(base: Metrics, delta: MetricDelta): Metrics {
  return {
    quality: clamp(base.quality + (delta.quality ?? 0), 0, 100),
    security: clamp(base.security + (delta.security ?? 0), 0, 100),
    throughput: clamp(base.throughput + (delta.throughput ?? 0), 0, 100),
  };
}

export interface Rank {
  label: string;
  caption: string;
}

export function rankFor(score: number, metrics: Metrics): Rank {
  const average = (metrics.quality + metrics.security + metrics.throughput) / 3;

  if (score >= 850 && average >= 82 && metrics.security >= 78) {
    return {
      label: 'SENIOR REVIEWER',
      caption: 'The merge queue trusts you. Mostly.',
    };
  }

  if (score >= 450 && average >= 62) {
    return {
      label: 'RELIABLE',
      caption: 'No catastrophic incidents. Keep reading the diff.',
    };
  }

  return {
    label: 'PROBATIONARY',
    caption: 'Security would like a word about your approval history.',
  };
}
