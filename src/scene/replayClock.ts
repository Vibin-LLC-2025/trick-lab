// The instant replay's own clock (step 17, ADR-72): FlightDriver advances it
// while a replay plays and poses the flight from it. Separate from the
// store's playhead, which stays at the landing: scoring, records and the
// step-down's frames never see the replay. Pure apart from the one object.
import type { Flight } from '../sim/flight';
import { ART } from './artDirection';

/** Seconds into the replay, and whether the last frame was the replay's (a gap restarts at 0 advance). */
export const replayClock = { t: 0, running: false };

/** How far through the flight the replay is: the flight at ART.replay.rate of its own speed, 0 to 1. */
export const replayProgress = (t: number, flight: Pick<Flight, 'airtime'>) => Math.min(1, (t * ART.replay.rate) / flight.airtime);
