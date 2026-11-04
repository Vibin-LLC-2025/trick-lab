import { MathUtils, type Euler } from 'three';
import type { Pose } from '../sim/flight';
import { ART } from './artDirection';

const D2R = MathUtils.DEG2RAD;
const ROLL = ART.stance.rollSign * D2R;
const YAW = ART.stance.yawSign * D2R;

/**
 * Writes a sim pose (unsigned degrees) into the board group's rotation, in
 * the stance convention from artDirection.ts. Order 'YXZ': yaw about world Y
 * first, then roll about the board's own long axis (so the flip axis follows
 * the shove), then the cosmetic nose-up pitch about its own Z. Mutates `out`,
 * allocation-free, so FlightDriver can call it every frame.
 */
export function setBoardRotation(out: Euler, pose: Pose): Euler {
  return out.set(pose.roll * ROLL, pose.yaw * YAW, pose.pitch * D2R, 'YXZ');
}
