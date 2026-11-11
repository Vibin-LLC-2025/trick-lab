// The whole rider's wind-up in a game (ADR-86, 2026-11-11): the readiness,
// 0 riding along to 1 crouched for the pop, eased per frame from the store's
// `windUp`. FlightDriver steps it once a frame, before anything else draws
// (its useFrame runs first), and poses the rider with it; the game's camera
// reads the value it left (`wind.ready`) for its riding lift. No React, no
// allocation.
import { MathUtils } from 'three';
import { COMPUTER_DELAY_MS, rollMoves, windUp, type TrickState } from '../store';
import { ART } from './artDirection';
import { frameStep } from './flightClock';

const WIND = ART.windUp;
/** When in its wait the computer's rider starts to sink, seconds. */
const SINK_AT = COMPUTER_DELAY_MS / 1000 - WIND.lead;

/**
 * The wind-up's state, module scope (one rider, one scene): `w` 0 riding to
 * 1 crouched, linear; `wait` the seconds the computer's wait has drawn;
 * `ready` this frame's readiness, `w` smoothed (1 wherever there is no
 * wind-up: off the game screen, without the whole rider, with a flight).
 */
export const wind = { w: 1, wait: 0, ready: 1 };

/** No wind-up this frame (the lab, the welcome screen, Low, the legs alone): the crouch, as before ADR-86. */
export function noWindUp(): number {
  wind.w = 1;
  wind.wait = 0;
  wind.ready = 1;
  return 1;
}

/**
 * Steps the readiness for this frame and returns it: toward the store's
 * wind-up, eased (`ART.windUp`: down into the crouch over `sink`, back up
 * over `rise`) while the roll draws frames, at once otherwise, so a picture
 * that stops never holds half a wind-up. The computer's rider rides through
 * its wait and sinks `lead` before its pop. A flight leaves from the crouch:
 * with one the readiness is 1 at once (the pose ignores it then anyway).
 */
export function stepWindUp(s: TrickState, delta: number): number {
  const want = windUp(s);
  const dt = frameStep(delta);
  wind.wait = want === 'wait' ? wind.wait + dt : 0;
  const target = want === 'ride' || (want === 'wait' && wind.wait < SINK_AT && !s.reducedMotion) ? 0 : 1;
  if (s.flight) wind.w = 1;
  else if (target !== wind.w) {
    if (rollMoves(s) && !s.reducedMotion) wind.w = target > wind.w ? Math.min(target, wind.w + dt / WIND.sink) : Math.max(target, wind.w - dt / WIND.rise);
    else wind.w = target;
  }
  wind.ready = MathUtils.smootherstep(wind.w, 0, 1);
  return wind.ready;
}
