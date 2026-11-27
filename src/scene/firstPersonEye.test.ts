import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { BONE, newBodyPose, writeBodyPose } from '../sim/body';
import { newFeetPose, writeFeetPose, type Stance } from '../sim/feet';
import { computeFlight, writePose, type Flight } from '../sim/flight';
import { newLegsPose, writeLegsPose } from '../sim/legs';
import { PRESETS } from '../sim/tricks';
import { FULL_STAGE } from '../store';
import { ART } from './artDirection';
import { eye, firstPersonFov, writeCalmEye, writeEye } from './firstPersonEye';

const REST_Y = ART.board.restY;
const feet = newFeetPose();
const legs = newLegsPose();
const body = newBodyPose();
const pose = { y: 0, roll: 0, yaw: 0, pitch: 0 };
const identity = new Matrix4();

/** Poses the rider as FlightDriver does and leaves the eye in `eye`; returns the board's height. */
function posed(inputs: { pop: number; flick: number; scoop: number }, flight: Flight | null, u: number, stance: Stance, ready: number) {
  writeFeetPose(feet, inputs, flight, u, stance);
  writeLegsPose(legs, feet, flight, u, inputs, stance, ready, 0);
  writeBodyPose(body, legs, feet, flight, u, inputs, stance, ready, 0);
  writeEye(body.bones[BONE.head]!, stance, ready, identity);
  return writePose(pose, flight, u).y;
}

function cameraAt(aspect: number) {
  const camera = new PerspectiveCamera(firstPersonFov(aspect, FULL_STAGE), aspect, 0.05, 30);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(eye.x + eye.dx, eye.y + eye.dy, eye.z + eye.dz);
  camera.updateMatrixWorld();
  return camera;
}

const inFrame = (camera: PerspectiveCamera, x: number, y: number, z: number) => {
  const p = new Vector3(x, y, z).project(camera);
  return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
};

describe('the first-person eye (ADR-111, 2026-11-27)', () => {
  it('rides in the head: at a standing eye height, over the board, never out in front of the toes', () => {
    for (const stance of ['goofy', 'regular'] as const) {
      for (const ready of [0, 1]) {
        posed(PRESETS[0]!.inputs, null, 0, stance, ready);
        expect(eye.y - REST_Y).toBeGreaterThan(1.05);
        expect(eye.y - REST_Y).toBeLessThan(1.75);
        // The toe-side rail is about 0.1 m out; Astra's eye sat 0.78 m out, looking back at the shins.
        expect(eye.z).toBeGreaterThan(-0.25);
        expect(eye.z).toBeLessThan(0.1);
        expect(Math.abs(eye.x)).toBeLessThan(0.2);
      }
    }
  });

  it('looks out toward the toes and the nose and down, never back at the rider', () => {
    for (const stance of ['goofy', 'regular'] as const) {
      const nose = stance === 'goofy' ? 1 : -1;
      posed(PRESETS[0]!.inputs, null, 0, stance, 0);
      expect(eye.dz).toBeLessThan(0);
      expect(eye.dx * nose).toBeGreaterThan(0);
      const ride = Math.asin(-eye.dy);
      posed(PRESETS[0]!.inputs, null, 0, stance, 1);
      const crouch = Math.asin(-eye.dy);
      // Riding tall looks further ahead than the crouch does; neither looks straight down.
      expect(ride).toBeLessThan(crouch);
      expect(crouch).toBeLessThan((80 * Math.PI) / 180);
    }
  });

  it('keeps the board and both shoes in frame through every preset, on a wide stage and a phone', () => {
    for (const preset of PRESETS) {
      const flight = computeFlight(preset.inputs);
      for (const [f, u, ready] of [[null, 0, 0], [null, 0, 1], [flight, 0.2, 1], [flight, 0.45, 1], [flight, 0.7, 1], [flight, 1, 1]] as const) {
        const y = posed(preset.inputs, f, u, 'goofy', ready);
        for (const aspect of [1.6, 390 / 700]) {
          const camera = cameraAt(aspect);
          expect(inFrame(camera, 0, REST_Y + y, 0), `${preset.id} u ${u} board, aspect ${aspect}`).toBe(true);
          for (const foot of [feet.front, feet.back]) {
            expect(inFrame(camera, foot.x, REST_Y + foot.y, foot.z), `${preset.id} u ${u} shoe, aspect ${aspect}`).toBe(true);
          }
        }
      }
    }
  });

  it('holds still with reduced motion, above the head in a jump, looking as in the crouch', () => {
    writeCalmEye('goofy');
    const first = { ...eye };
    writeCalmEye('goofy');
    expect(eye).toEqual(first);
    expect(eye.posed).toBe(false);
    const flight = computeFlight(PRESETS[0]!.inputs);
    let highest = 0;
    for (let u = 0; u <= 1; u += 0.05) {
      posed(PRESETS[0]!.inputs, flight, u, 'goofy', 1);
      highest = Math.max(highest, body.bones[BONE.head]!.o.y + REST_Y);
    }
    expect(first.y).toBeGreaterThan(highest);
    writeCalmEye('regular');
    expect(eye.x).toBeCloseTo(-first.x);
    expect(eye.dx).toBeCloseTo(-first.dx);
  });

  it('widens the lens so a narrow clear area still sees the board', () => {
    expect(firstPersonFov(1.6, FULL_STAGE)).toBeCloseTo(ART.camera.firstPerson.fov.v);
    expect(firstPersonFov(0.5, FULL_STAGE)).toBeGreaterThan(firstPersonFov(1.6, FULL_STAGE));
    expect(firstPersonFov(0.2, { top: 0.4, bottom: 0.5, left: 0, right: 0.3 })).toBe(ART.camera.firstPerson.fov.max);
  });
});
