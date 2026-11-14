// The instant replay's own clock (step 17, ADR-72): FlightDriver advances it
// while a replay plays and poses the flight from it. Separate from the
// store's playhead, which stays at the landing: scoring, records and the
// step-down's frames never see the replay. Pure apart from the one object.
//
// Since ADR-96 (2026-11-13) the replay is the whole go, not the flight
// alone: it starts `ART.replay.pre` seconds before the pop, with the rider
// sinking into the crouch, and runs on until the landing and the rider's
// recovery have played out again (`landingSeconds`, then `post`), its pace
// rising from the slow motion up to real time as the rider rides away. The ground
// rolls under it as it did. Before, it started in the air and cut away the
// moment the wheels touched, which read as a skip.
import type { Flight } from '../sim/flight';
import { landingSeconds } from '../sim/settle';
import { ART } from './artDirection';

const P = ART.replay;
const R = ART.roll;

/**
 * Seconds into the replay, and whether the last frame was the replay's (a gap
 * restarts at 0 advance); and the roll at the pop (FlightDriver notes it as a
 * flight starts): its speed and how far the ground had rolled, and the
 * riding clock (windUp.ts `wind.t`), so the replay sways as the go did.
 */
export const replayClock = { t: 0, running: false, speed: 0, from: 0, windT: 0 };

/** The real seconds from the replay's start to touchdown: the lead-in and the flight, both at `rate`. */
const touchdownAt = (flight: Pick<Flight, 'airtime'>) => (P.pre + flight.airtime) / P.rate;

/** The real seconds the run-out's pace takes to rise from `rate` to `cap`. */
const rampS = (P.cap - P.rate) / P.ramp;

/**
 * The flight's own seconds since the pop at replay time `t` (real seconds):
 * negative in the lead-in, past the airtime in the run-out. At `rate` up to
 * touchdown, then speeding up by `ramp` per second until it reaches `cap`
 * (never past it), and steady there.
 */
export function replayTime(t: number, flight: Pick<Flight, 'airtime'>): number {
  const at = touchdownAt(flight);
  if (t <= at) return t * P.rate - P.pre;
  const u = t - at;
  if (u <= rampS) return flight.airtime + P.rate * u + 0.5 * P.ramp * u * u;
  return flight.airtime + P.rate * rampS + 0.5 * P.ramp * rampS * rampS + P.cap * (u - rampS);
}

/** How far through the flight the replay is, 0 to 1: 0 through the lead-in, 1 through the run-out. */
export const replayProgress = (t: number, flight: Pick<Flight, 'airtime'>) => Math.min(1, Math.max(0, replayTime(t, flight) / flight.airtime));

/** Whether the replay has played out: the landing and the rider's recovery over (`landingSeconds`), and `post` more. */
export const replayOver = (t: number, flight: Flight) => replayTime(t, flight) >= flight.airtime + landingSeconds(flight) + P.post;

/** The wind-up's readiness in the lead-in (0 riding, 1 crouched): sinking from `ready` into the crouch by the pop. */
export function replayReady(time: number): number {
  if (time >= 0) return 1;
  const s = Math.min(1, Math.max(0, (time + P.pre) / P.pre));
  return P.ready + (1 - P.ready) * s * s * (3 - 2 * s);
}

/** How far a board pushed from `speed` rolls in `t` seconds, speeding up as the game's push does (scene/roll.ts) to cruise. */
function pushed(speed: number, t: number): number {
  const a = R.cruise / R.pushS;
  const up = Math.max(0, Math.min(t, (R.cruise - speed) / a));
  return speed * up + 0.5 * a * up * up + Math.max(speed, Math.min(R.cruise, speed + a * up)) * (t - up);
}

/**
 * How far the ground has rolled at the flight's own `time` (replayTime), from
 * where it stood at the pop: the board still pushed through the flight, as
 * the game's roll is (from the pop's speed, toward cruise: 2026-11-13, it was
 * held at the pop's speed, so a pop from rest showed the ground still), then
 * slowing from its speed at touchdown as the game's does (ART.roll), or
 * stopped dead by a bail, whose rider has stepped off (ADR-67).
 *
 * `rest`, when given, is how far the game's roll went from the pop before it
 * came to rest (FlightDriver passes it once the live roll is still). The
 * replay ends before a landed board has stopped (`replayOver`), so the run-out
 * then brings the ground to rest exactly there by the replay's end, its speed
 * falling from touchdown's to nothing: the live view takes over with no jump
 * forward and no sudden stop (A10, 2026-11-13, the review's C-06).
 */
export function replayRolled(time: number, flight: Flight, speed: number, rest?: number): number {
  // The lead-in before the pop, at the pop's speed.
  if (time <= 0) return speed * time;
  if (time <= flight.airtime) return pushed(speed, time);
  const flown = pushed(speed, flight.airtime);
  const touch = flight.landed ? Math.min(R.cruise, speed + (R.cruise / R.pushS) * flight.airtime) : 0;
  if (rest !== undefined) {
    const span = landingSeconds(flight) + P.post;
    const run = rest - flown;
    if (Math.abs(run) < 1e-6) return flown;
    // A cubic from touchdown's speed to none, covering `run` in `span` (Hermite); the start's slope kept at most three
    // times the mean, so the ground never rolls back.
    const m = Math.min(touch * span, 3 * Math.max(0, run));
    const u = Math.min(1, (time - flight.airtime) / span);
    return flown + m * (u * u * u - 2 * u * u + u) + run * (3 * u * u - 2 * u * u * u);
  }
  if (!flight.landed) return flown;
  const decel = R.cruise / R.slowS;
  const u = Math.min(time - flight.airtime, touch / decel);
  return flown + touch * u - 0.5 * decel * u * u;
}
