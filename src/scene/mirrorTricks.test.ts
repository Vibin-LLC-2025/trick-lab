// ADR-30 (2026-11-04): signed flick and scoop. The scene maps the signed sim
// pose through the stance signs of ADR-10, ADR-24 and ADR-25 (boardPose.ts)
// with no change of its own; this pins that a heelflip stays a heelflip and a
// frontside shove frontside in both stances, seen from the heel-side camera.
import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import type { Stance } from '../sim/feet';
import { computeFlight, poseAt, type Pose } from '../sim/flight';
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
const atRest = (v: Vector3, stance: Stance) => apply({ y: 0, roll: 0, yaw: 0, pitch: 0 }, v, stance);
/** +1 when the tail turns counterclockwise seen from above, -1 when clockwise. */
const turnSense = (stance: Stance, tail: Vector3) => Math.sign(new Vector3().crossVectors(atRest(TAIL, stance), tail).y);
/** Backside: goofy counterclockwise, regular clockwise (ADR-25). Frontside is the other way. */
const BACKSIDE: Record<Stance, number> = { goofy: 1, regular: -1 };

describe.each(['goofy', 'regular'] as const)('mirror tricks on the board (%s stance)', (stance) => {
  it('a heelflip rolls the grip toward the toe side (-Z, away from the camera) first, the opposite of a kickflip', () => {
    expect(level('heelflip', 0.25, GRIP, stance).z).toBeLessThan(-0.9);
    expect(level('kickflip', 0.25, GRIP, stance).z).toBeGreaterThan(0.9);
    expect(level('heelflip', 0.5, GRIP, stance).y).toBeLessThan(-0.95);
    expect(level('heelflip', 1, GRIP, stance).y).toBeGreaterThan(0.95);
  });

  it('a frontside shove-it swings the tail in front of the toes (-Z) first and ends half round', () => {
    const tail = level('frontside-pop-shove-it', 0.25, TAIL, stance);
    expect(tail.z).toBeLessThan(-0.5);
    expect(turnSense(stance, tail)).toBe(-BACKSIDE[stance]);
    expect(turnSense(stance, level('pop-shove-it', 0.25, TAIL, stance))).toBe(BACKSIDE[stance]);
    expect(level('frontside-pop-shove-it', 1, TAIL, stance).dot(atRest(NOSE, stance))).toBeGreaterThan(0.95);
  });

  it('the varial heelflip and the hardflip compose a flip and a shove direction each', () => {
    const cases = [
      ['varial-heelflip', -1, -1],
      ['hardflip', 1, -1],
    ] as const;
    for (const [id, flip, shove] of cases) {
      const tail = level(id, 0.1, TAIL, stance);
      expect(turnSense(stance, tail), id).toBe(shove * BACKSIDE[stance]);
      // The flip axis follows the shove (YZX): measure the grip against the board's own heel side.
      const nose = level(id, 0.1, NOSE, stance);
      const heel = new Vector3().crossVectors(nose, UP).multiplyScalar(BACKSIDE[stance]).normalize();
      expect(heel.z, id).toBeGreaterThan(0.7);
      expect(Math.sign(level(id, 0.1, GRIP, stance).dot(heel)), id).toBe(flip);
    }
  });
});
