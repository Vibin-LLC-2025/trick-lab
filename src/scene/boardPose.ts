import { MathUtils, type Euler } from 'three';
import type { Stance } from '../sim/feet';
import type { Pose } from '../sim/flight';
import { ART } from './artDirection';

const D2R = MathUtils.DEG2RAD;
const signs = (s: Stance) => {
  const k = ART.stance[s];
  return { roll: k.rollSign * D2R, yaw: k.yawSign * D2R, base: k.baseYaw * D2R };
};
/** Per-stance factors, radians, built once so the render loop only looks one up. */
const K: Record<Stance, { roll: number; yaw: number; base: number }> = { goofy: signs('goofy'), regular: signs('regular') };

/**
 * Writes a sim pose (unsigned degrees) into the board group's rotation, in
 * the stance convention from artDirection.ts (ADR-10, ADR-24, ADR-25). Order
 * 'YZX' (ADR-32, 2026-11-04, was 'YXZ' in ADR-2): yaw about world Y first
 * (the stance's base yaw plus the signed shove), then the nose-up pitch of
 * the pop about the yawed transverse axis, then the roll about the pitched
 * long axis. The flip axis still follows the shove, and the raised nose stays
 * on that axis while the board flips (with the pitch last, the nose swung
 * sideways by x sin(pitch) sin(roll), up to 14 cm in the first third of a
 * kickflip). Mutates `out`, allocation-free, so FlightDriver can call it
 * every frame.
 */
export function setBoardRotation(out: Euler, pose: Pose, stance: Stance): Euler {
  const k = K[stance];
  return out.set(pose.roll * k.roll, k.base + pose.yaw * k.yaw, pose.pitch * D2R, 'YZX');
}
