// ADR-30 (2026-11-04): signed flick and scoop. The scene maps the signed sim
// pose through the stance signs of ADR-10, ADR-24 and ADR-25 (boardPose.ts)
// with no change of its own; this pins that a heelflip stays a heelflip and a
// frontside shove frontside in both stances, seen from the heel-side camera.
import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import type { Stance } from '../sim/feet';
import { computeFlight, PHASE, poseAt, rollAt, yawAt, type Pose } from '../sim/flight';
import { presetById, type PresetId } from '../sim/tricks';
import { setBoardRotation } from './boardPose';

const GRIP = new Vector3(0, 1, 0);
const NOSE = new Vector3(1, 0, 0);
const TAIL = new Vector3(-1, 0, 0);
const UP = new Vector3(0, 1, 0);

const apply = (pose: Pose, v: Vector3, stance: Stance) =>
  v.clone().applyQuaternion(new Quaternion().setFromEuler(setBoardRotation(new Euler(), pose, stance)));
/** The full pose, pop pitch included: since ADR-32 the flip is about the pitched long axis, so the pitch no longer swings the tail in Z. */
const level = (id: PresetId, u: number, v: Vector3, stance: Stance) => apply(poseAt(computeFlight(presetById(id).inputs), u), v, stance);
/**
 * The progress at which a preset's board has done `fraction` of its total on
 * one axis. Since ADR-36 (2026-11-05) the board no longer turns at a constant
 * rate, so "a quarter turn" is no longer at u = 0.25: this inverts the
 * phased profile (rollAt, yawAt) by bisection, before the catch, where it is
 * total * R(u) and rises monotonically.
 */
const progressAt = (id: PresetId, axis: 'roll' | 'yaw', fraction: number) => {
  const flight = computeFlight(presetById(id).inputs);
  const at = axis === 'roll' ? rollAt : yawAt;
  const want = Math.abs((axis === 'roll' ? flight.rollTotal : flight.yawTotal) * fraction);
  let lo = 0;
  let hi: number = PHASE.catch.start;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(at(flight, mid)) < want) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
const atRest = (v: Vector3, stance: Stance) => apply({ y: 0, roll: 0, yaw: 0, pitch: 0 }, v, stance);
/** +1 when the tail turns counterclockwise seen from above, -1 when clockwise. */
const turnSense = (stance: Stance, tail: Vector3) => Math.sign(new Vector3().crossVectors(atRest(TAIL, stance), tail).y);
/** Backside: goofy counterclockwise, regular clockwise (ADR-25). Frontside is the other way. */
const BACKSIDE: Record<Stance, number> = { goofy: 1, regular: -1 };

describe.each(['goofy', 'regular'] as const)('mirror tricks on the board (%s stance)', (stance) => {
  // The progress values below were 0.25, 0.5 and 0.1 while the board turned
  // at a constant rate; re-derived from R(u) for ADR-36 (2026-11-05), the
  // same fractions of each turn and the same thresholds.
  it('a heelflip rolls the grip toward the toe side (-Z, away from the camera) first, the opposite of a kickflip', () => {
    expect(level('heelflip', progressAt('heelflip', 'roll', 0.25), GRIP, stance).z).toBeLessThan(-0.9);
    expect(level('kickflip', progressAt('kickflip', 'roll', 0.25), GRIP, stance).z).toBeGreaterThan(0.9);
    expect(level('heelflip', progressAt('heelflip', 'roll', 0.5), GRIP, stance).y).toBeLessThan(-0.95);
    expect(level('heelflip', 1, GRIP, stance).y).toBeGreaterThan(0.95);
  });

  it('a frontside shove-it swings the tail in front of the toes (-Z) first and ends half round', () => {
    const tail = level('frontside-pop-shove-it', progressAt('frontside-pop-shove-it', 'yaw', 0.25), TAIL, stance);
    expect(tail.z).toBeLessThan(-0.5);
    expect(turnSense(stance, tail)).toBe(-BACKSIDE[stance]);
    expect(turnSense(stance, level('pop-shove-it', progressAt('pop-shove-it', 'yaw', 0.25), TAIL, stance))).toBe(BACKSIDE[stance]);
    expect(level('frontside-pop-shove-it', 1, TAIL, stance).dot(atRest(NOSE, stance))).toBeGreaterThan(0.95);
  });

  it('the varial heelflip and the hardflip compose a flip and a shove direction each', () => {
    const cases = [
      ['varial-heelflip', -1, -1],
      ['hardflip', 1, -1],
    ] as const;
    // Each axis where it has done a tenth of its turn (was both at u = 0.1, see above).
    const heelSide = (id: PresetId, u: number) =>
      new Vector3().crossVectors(level(id, u, NOSE, stance), UP).multiplyScalar(BACKSIDE[stance]).normalize();
    for (const [id, flip, shove] of cases) {
      const shoveAt = progressAt(id, 'yaw', 0.1);
      expect(turnSense(stance, level(id, shoveAt, TAIL, stance)), id).toBe(shove * BACKSIDE[stance]);
      expect(heelSide(id, shoveAt).z, id).toBeGreaterThan(0.7);
      // The flip axis follows the shove (YZX): measure the grip against the board's own heel side.
      const flipAt = progressAt(id, 'roll', 0.1);
      expect(Math.sign(level(id, flipAt, GRIP, stance).dot(heelSide(id, flipAt))), id).toBe(flip);
    }
  });
});
