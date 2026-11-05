import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import type { Stance } from '../sim/feet';
import { computeFlight, poseAt, type Pose } from '../sim/flight';
import { presetById, type PresetId } from '../sim/tricks';
import { boardMatrix } from '../sim/boardVolume';
import { setBoardRotation } from './boardPose';

// The board's own axes: nose +X, grip +Y. World: heel side +Z (toward the
// camera in both stances), toe side -Z, Y up (ADR-10, ADR-24, ADR-25).
const GRIP = new Vector3(0, 1, 0);
const NOSE = new Vector3(1, 0, 0);
const TAIL = new Vector3(-1, 0, 0);
const UP = new Vector3(0, 1, 0);

const apply = (pose: Pose, v: Vector3, stance: Stance) =>
  v.clone().applyQuaternion(new Quaternion().setFromEuler(setBoardRotation(new Euler(), pose, stance)));
const rotated = (id: PresetId, u: number, v: Vector3, stance: Stance) =>
  apply(poseAt(computeFlight(presetById(id).inputs), u), v, stance);
/** A board vector on the pad, before any trick. */
const atRest = (v: Vector3, stance: Stance) => apply({ y: 0, roll: 0, yaw: 0, pitch: 0 }, v, stance);

/** Where the tail sits at rest in this stance. */
const restTail = (stance: Stance) => atRest(TAIL, stance);
/** +1 when the tail turns counterclockwise seen from above, -1 when clockwise. */
const turnSense = (stance: Stance, tail: Vector3) => Math.sign(new Vector3().crossVectors(restTail(stance), tail).y);
/** Goofy shoves counterclockwise seen from above, regular clockwise. */
const SENSE: Record<Stance, number> = { goofy: 1, regular: -1 };

describe('stance at rest', () => {
  it('puts the nose at +X in goofy and at -X in regular, grip up in both', () => {
    expect(atRest(NOSE, 'goofy').x).toBeCloseTo(1, 6);
    expect(atRest(NOSE, 'regular').x).toBeCloseTo(-1, 6);
    expect(atRest(GRIP, 'goofy').y).toBeCloseTo(1, 6);
    expect(atRest(GRIP, 'regular').y).toBeCloseTo(1, 6);
  });
});

describe.each(['goofy', 'regular'] as const)('trick rotation direction (%s stance)', (stance) => {
  it('a kickflip rolls the grip toward the heel side (+Z) first', () => {
    const grip = rotated('kickflip', 0.25, GRIP, stance);
    expect(grip.z).toBeGreaterThan(0.9);
  });

  it('a kickflip has the graphic up at half the flight and the grip up at landing', () => {
    expect(rotated('kickflip', 0.5, GRIP, stance).y).toBeLessThan(-0.95);
    expect(rotated('kickflip', 1, GRIP, stance).y).toBeGreaterThan(0.95);
  });

  it('a pop shove-it swings the tail toward the heels (+Z) first and ends turned half round, where the nose was', () => {
    const tail = rotated('pop-shove-it', 0.25, TAIL, stance);
    expect(tail.z).toBeGreaterThan(0.5);
    expect(turnSense(stance, tail)).toBe(SENSE[stance]);
    const noseAtRest = atRest(NOSE, stance);
    expect(rotated('pop-shove-it', 1, TAIL, stance).dot(noseAtRest)).toBeGreaterThan(0.95);
    expect(rotated('pop-shove-it', 1, GRIP, stance).y).toBeGreaterThan(0.95);
  });

  it('varial and 360 flips use the same flip and shove directions as the base tricks', () => {
    // The full pose at 10 percent, pop pitch included (ADR-32, 2026-11-04):
    // the flip is about the pitched long axis, so the raised nose no longer
    // swings the tail in Z and the directions read straight off the pose.
    const level = (id: PresetId, v: Vector3) => rotated(id, 0.1, v, stance);
    for (const id of ['varial-flip', '360-flip'] as const) {
      const tail = level(id, TAIL);
      expect(turnSense(stance, tail), id).toBe(SENSE[stance]);
      // The flip axis follows the shove (YZX), so measure the grip against the board's yawed heel side.
      const nose = level(id, NOSE);
      const heel = new Vector3().crossVectors(nose, UP).multiplyScalar(SENSE[stance]).normalize();
      expect(heel.z, id).toBeGreaterThan(0.7);
      expect(level(id, GRIP).dot(heel), id).toBeGreaterThan(0.3);
    }
  });
});

// ADR-32 (2026-11-04): yaw, then the pop pitch, then the flip about the pitched long axis.
describe.each(['goofy', 'regular'] as const)('the nose stays on the pitched long axis while the board flips (%s stance)', (stance) => {
  it('keeps the nose in the board\'s vertical plane through the pop of a kickflip and a heelflip', () => {
    for (const id of ['kickflip', 'heelflip'] as const) {
      const flight = computeFlight(presetById(id).inputs);
      for (const u of [0.03, 0.08, 0.14, 0.22, 0.3]) {
        const pose = poseAt(flight, u);
        const nose = apply(pose, NOSE, stance);
        // No shove: the long axis is in the X-Y plane, nose up by the pitch, whatever the roll.
        expect(nose.z, `${id} at ${u}`).toBeCloseTo(0, 9);
        expect(nose.y, `${id} at ${u}`).toBeCloseTo(Math.sin((pose.pitch * Math.PI) / 180), 9);
      }
    }
  });
});

it('the scene board rotation matches the matrix the clearance solver builds (boardMatrix in boardVolume.ts) for a mixed pose', () => {
  const pose: Pose = { y: 0.2, roll: 51, yaw: 17, pitch: 25.5 };
  const m = boardMatrix(new Float64Array(9), pose);
  for (const v of [NOSE, GRIP, new Vector3(0, 0, 1)]) {
    const scene = apply(pose, v, 'goofy');
    const solver = new Vector3(
      m[0]! * v.x + m[1]! * v.y + m[2]! * v.z,
      m[3]! * v.x + m[4]! * v.y + m[5]! * v.z,
      m[6]! * v.x + m[7]! * v.y + m[8]! * v.z,
    );
    expect(scene.distanceTo(solver)).toBeLessThan(1e-9);
  }
});
