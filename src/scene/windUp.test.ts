// The wind-up's readiness per frame (ADR-86): eased while the roll draws
// frames, at once otherwise, timed to the computer's pop, never held half way.
import { beforeEach, describe, expect, it } from 'vitest';
import { COMPUTER_DELAY_MS, createTrickStore } from '../store';
import { ART } from './artDirection';
import { noWindUp, stepWindUp, wind } from './windUp';

const FRAME = 1 / 60;

function makeStore(first: number) {
  const queue = [first];
  const store = createTrickStore(
    () => 1000,
    () => queue.shift() ?? 0.25,
    () => '2026-11-11',
  );
  store.setState({ skateTaught: true, screen: 'skate', popMode: 'timed' });
  return store;
}
type Store = ReturnType<typeof makeStore>;
/** Steps n frames of 1/60 s and returns the readiness after each. */
const frames = (s: Store, n: number) => Array.from({ length: n }, () => stepWindUp(s.getState(), FRAME));

beforeEach(() => {
  localStorage.clear();
  noWindUp();
});

describe('the wind-up readiness (ADR-86)', () => {
  it("sinks smoothly over ART.windUp.sink once the bar starts (the roll draws the frames), from the riding stance it switched to at once", () => {
    const s = makeStore(0.25);
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    // The board is still: the riding stance at once, no half pose left on a picture that stops.
    expect(s.getState().roll).toBe('still');
    expect(stepWindUp(s.getState(), FRAME)).toBe(0);
    s.getState().pressPop();
    expect(s.getState().roll).toBe('push');
    const r = frames(s, Math.ceil(ART.windUp.sink / FRAME) + 2);
    // Monotonic, small steps, flat at both ends, and fully crouched by the sink's end.
    for (let i = 1; i < r.length; i++) {
      expect(r[i]!).toBeGreaterThanOrEqual(r[i - 1]!);
      expect(r[i]! - r[i - 1]!).toBeLessThan(0.12);
    }
    expect(r[0]!).toBeLessThan(0.01);
    expect(r[Math.floor(ART.windUp.sink / FRAME) - 3]!).toBeLessThan(1);
    expect(r[r.length - 1]).toBe(1);
    // The pop: a flight is the crouch at once.
    s.getState().cancelPop();
    expect(stepWindUp(s.getState(), FRAME)).toBeLessThan(1);
    s.getState().pressPop();
    s.getState().pressPop();
    expect(s.getState().flight).not.toBeNull();
    expect(stepWindUp(s.getState(), FRAME)).toBe(1);
  });

  it('switches at once under reduced motion, where the board does not roll', () => {
    const s = makeStore(0.25);
    s.setState({ reducedMotion: true });
    s.getState().startSkate();
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    expect(stepWindUp(s.getState(), FRAME)).toBe(0);
    s.getState().pressPop();
    expect(stepWindUp(s.getState(), FRAME)).toBe(1);
  });

  it("rides through the computer's wait and is crouched by its pop, sinking ART.windUp.lead before it", () => {
    const s = makeStore(0.75);
    s.setState({ skateAuto: true });
    s.getState().startSkate();
    s.getState().continueSkate();
    expect(s.getState().roll).toBe('push');
    const r = frames(s, Math.round(COMPUTER_DELAY_MS / 1000 / FRAME));
    const sinkAt = COMPUTER_DELAY_MS / 1000 - ART.windUp.lead;
    expect(r[Math.floor(sinkAt / FRAME) - 2]).toBe(0);
    expect(r[Math.floor((sinkAt + ART.windUp.sink) / FRAME) + 2]).toBe(1);
    expect(r[r.length - 1]).toBe(1);
    expect(wind.ready).toBe(1);
  });

  it('is the crouch where there is no wind-up', () => {
    wind.w = 0;
    expect(noWindUp()).toBe(1);
    expect(wind.ready).toBe(1);
  });
});
