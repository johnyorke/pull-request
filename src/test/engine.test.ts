import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewGame } from '../game/engine';

describe('ReviewGame queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('starts with the first PR and reveals later PRs on schedule', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    expect(game.state.screen).toBe('shift');
    expect(game.state.activePrId).toBe('pr-1180');
    expect(game.state.prs['pr-1182'].status).toBe('waiting');
    expect(game.state.prs['pr-1184'].status).toBe('waiting');

    vi.advanceTimersByTime(18_200);

    expect(game.state.prs['pr-1182'].status).toBe('available');
    expect(game.state.prs['pr-1182'].deadlineAtMs).toBe(138_000);
    expect(game.state.activePrId).toBe('pr-1180');

    vi.advanceTimersByTime(12_000);

    expect(game.state.prs['pr-1184'].status).toBe('available');
    expect(game.state.prs['pr-1184'].deadlineAtMs).toBe(150_000);
    expect(game.state.activePrId).toBe('pr-1180');
    game.stopLoop();
  });

  it('reshuffles the queue every time a shift starts', () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 2 ** 32;
    };
    const game = new ReviewGame(random);

    game.startShift();
    const firstShift = game.pullRequests.map((pr) => pr.id);
    game.replay();
    game.startShift();
    const secondShift = game.pullRequests.map((pr) => pr.id);

    expect(secondShift).not.toEqual(firstShift);
    expect([...secondShift].sort()).toEqual([...firstShift].sort());
    game.stopLoop();
  });

  it('resolves a rejection with findings and resumes the queue', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    game.selectLine('pr1180-sum-2');
    game.toggleFlag('STYLE');
    game.reject();

    expect(game.state.modal?.type).toBe('verdict');
    expect(game.state.results[0].verdict).toBe('rejected');
    expect(game.state.results[0].caught).toHaveLength(1);
    expect(game.state.score).toBeGreaterThan(0);

    game.dismissModal();
    expect(game.state.screen).toBe('shift');
    expect(game.state.activePrId).toBeNull();

    vi.advanceTimersByTime(18_200);
    expect(game.state.activePrId).toBe('pr-1182');
    game.stopLoop();
  });

  it('approves a clean PR with no findings', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    vi.advanceTimersByTime(18_200);
    game.selectPR('pr-1182');
    game.approve();

    expect(game.state.modal?.type).toBe('verdict');
    expect(game.state.results[0].prId).toBe('pr-1182');
    expect(game.state.results[0].verdict).toBe('approved');
    expect(game.state.results[0].correctAction).toBe(true);
    expect(game.state.results[0].caught).toHaveLength(0);
    game.stopLoop();
  });

  it('auto-rejects expired PRs and ends the shift', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    for (let step = 0; step < 20 && game.state.screen === 'shift'; step += 1) {
      game.dismissModal();
      vi.advanceTimersByTime(60_000);
    }

    expect(game.state.results).toHaveLength(11);
    expect(game.state.results.every((result) => result.verdict === 'timeout')).toBe(
      true,
    );
    expect(game.state.screen).toBe('summary');
    expect(game.state.modal).toBeNull();
    expect(game.state.metrics.throughput).toBeLessThan(80);
  });
});
