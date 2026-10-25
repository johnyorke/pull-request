import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SLA_MS } from '../data/levels';
import { remainingFor, ReviewGame } from '../game/engine';

describe('ReviewGame queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('starts with the whole queue ready and the first PR active', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    expect(game.state.screen).toBe('shift');
    expect(game.state.activePrId).toBe('pr-1180');
    expect(
      game.pullRequests.every(
        (pr) => game.state.prs[pr.id].status === 'available',
      ),
    ).toBe(true);
    expect(game.state.prs['pr-1180'].deadlineAtMs).toBe(MAX_SLA_MS);
    expect(game.state.prs['pr-1182'].deadlineAtMs).toBeNull();
    expect(game.state.prs['pr-1182'].remainingMs).toBe(MAX_SLA_MS);
    game.stopLoop();
  });

  it('advances to the next PR immediately after a review resolves', () => {
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
    expect(game.state.activePrId).toBe('pr-1182');
    expect(game.state.prs['pr-1182'].deadlineAtMs).toBe(MAX_SLA_MS);
    game.stopLoop();
  });

  it('does not drain queued PRs while the active review is running', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    vi.advanceTimersByTime(29_800);

    expect(game.state.prs['pr-1180'].status).toBe('available');
    expect(game.state.prs['pr-1182'].status).toBe('available');
    expect(game.state.prs['pr-1182'].deadlineAtMs).toBeNull();
    expect(remainingFor(game.state, game.pullRequests[1])).toBe(MAX_SLA_MS);
    game.stopLoop();
  });

  it('auto-rejects the active PR at 30 seconds and promotes the next one', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    vi.advanceTimersByTime(MAX_SLA_MS + 200);

    expect(game.state.results).toHaveLength(1);
    expect(game.state.results[0].verdict).toBe('timeout');
    expect(game.state.prs['pr-1180'].status).toBe('resolved');
    expect(game.state.activePrId).toBe('pr-1182');
    expect(game.state.modal?.type).toBe('verdict');

    const promotedDeadline = game.state.prs['pr-1182'].deadlineAtMs;
    expect(promotedDeadline).not.toBeNull();

    vi.advanceTimersByTime(10_000);
    game.dismissModal();

    expect(game.state.screen).toBe('shift');
    expect(game.state.prs['pr-1182'].deadlineAtMs).toBe(promotedDeadline);
    expect(remainingFor(game.state, game.pullRequests[1])).toBe(MAX_SLA_MS);
    game.stopLoop();
  });

  it('pauses the outgoing SLA when the reviewer switches PRs', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    const [first, second] = game.pullRequests;

    vi.advanceTimersByTime(10_000);
    game.selectPR(second.id);

    expect(game.state.activePrId).toBe(second.id);
    expect(remainingFor(game.state, first)).toBe(20_000);
    expect(game.state.prs[second.id].deadlineAtMs).toBe(40_000);

    vi.advanceTimersByTime(5_000);
    game.selectPR(first.id);

    expect(game.state.activePrId).toBe(first.id);
    expect(remainingFor(game.state, first)).toBe(20_000);
    expect(game.state.prs[first.id].deadlineAtMs).toBe(35_000);
    game.stopLoop();
  });

  it('approves a clean PR with no findings', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    game.selectPR('pr-1182');
    game.approve();

    expect(game.state.modal?.type).toBe('verdict');
    expect(game.state.results[0].prId).toBe('pr-1182');
    expect(game.state.results[0].verdict).toBe('approved');
    expect(game.state.results[0].correctAction).toBe(true);
    expect(game.state.results[0].caught).toHaveLength(0);
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

  it('auto-rejects every PR and ends the shift', () => {
    const game = new ReviewGame(() => 0.999_999);
    game.startShift();

    for (let step = 0; step < 20 && game.state.screen === 'shift'; step += 1) {
      game.dismissModal();
      vi.advanceTimersByTime(MAX_SLA_MS + 200);
    }

    expect(game.state.results).toHaveLength(game.pullRequests.length);
    expect(game.state.results.every((result) => result.verdict === 'timeout')).toBe(
      true,
    );
    expect(game.state.screen).toBe('summary');
    expect(game.state.modal).toBeNull();
    expect(game.state.metrics.throughput).toBeLessThan(80);
  });
});
