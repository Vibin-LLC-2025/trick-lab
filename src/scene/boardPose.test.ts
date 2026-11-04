import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { computeFlight, poseAt } from '../sim/flight';
import { presetById, type PresetId } from '../sim/tricks';
import { setBoardRotation } from './boardPose';

// Regular stance (ADR-10): nose +X, toe side +Z, heel side -Z, Y up.
const GRIP = new Vector3(0, 1, 0);
const TAIL = new Vector3(-1, 0, 0);

function rotated(id: PresetId, u: number, v: Vector3) {
  const pose = poseAt(computeFlight(presetById(id).inputs), u);
  const q = new Quaternion().setFromEuler(setBoardRotation(new Euler(), pose));
  return v.clone().applyQuaternion(q);
}

describe('trick rotation direction (regular stance)', () => {
  it('a kickflip rolls the grip toward the heel side first', () => {
    const grip = rotated('kickflip', 0.25, GRIP);
    expect(grip.z).toBeLessThan(-0.9);
  });

  it('a kickflip has the graphic up at half the flight and the grip up at landing', () => {
    expect(rotated('kickflip', 0.5, GRIP).y).toBeLessThan(-0.95);
    expect(rotated('kickflip', 1, GRIP).y).toBeGreaterThan(0.95);
  });

  it('a pop shove-it swings the tail toward the heel side (clockwise from above)', () => {
    const tail = rotated('pop-shove-it', 0.25, TAIL);
    expect(tail.z).toBeLessThan(-0.5);
    // Clockwise from above: the cross product of rest and current tail points down.
    expect(new Vector3().crossVectors(TAIL, tail).y).toBeLessThan(0);
    expect(rotated('pop-shove-it', 1, TAIL).x).toBeGreaterThan(0.95);
  });

  it('varial and 360 flips use the same flip and shove directions as the base tricks', () => {
    for (const id of ['varial-flip', '360-flip'] as const) {
      const tail = rotated(id, 0.1, TAIL);
      expect(new Vector3().crossVectors(TAIL, tail).y, id).toBeLessThan(0);
      // The flip axis follows the shove (YXZ), so measure the grip against the board's yawed heel side.
      const pose = poseAt(computeFlight(presetById(id).inputs), 0.1);
      const heel = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), (pose.yaw * Math.PI) / 180);
      expect(rotated(id, 0.1, GRIP).dot(heel), id).toBeGreaterThan(0.3);
    }
  });
});
