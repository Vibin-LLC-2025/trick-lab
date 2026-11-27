// The first-person eye (ADR-111, reworked 2026-11-27): where the rider's eyes
// are this frame and where they look, in world space. FlightDriver writes it
// once a frame from the posed head (its useFrame runs first); the first-person
// camera reads it. Module scope (one rider, one scene), no allocation.
import type { Matrix4 } from 'three';
import type { BoneFrame } from '../sim/body';
import type { Stance } from '../sim/feet';
import { ART } from './artDirection';
import { noseOf } from './landingMove';

const FP = ART.camera.firstPerson;
const REST_Y = ART.board.restY;
const D2R = Math.PI / 180;

/** `posed` false: no head this frame (no feet shown), so the camera holds the calm eye. */
export const eye = { posed: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 };

/** The pitch below the horizon, degrees, for the wind-up's readiness (0 riding tall, 1 the crouch and the flight). */
export const eyePitch = (ready: number) => FP.pitch.ride + (FP.pitch.ready - FP.pitch.ride) * ready;

/** The view's direction in the rider's frame: turned `yaw` from the toes (-Z) toward the nose, `pitch` down, into `eye`. */
function writeDirection(stance: Stance, ready: number) {
  const yaw = FP.yaw * D2R;
  const pitch = eyePitch(ready) * D2R;
  const flat = Math.cos(pitch);
  eye.dx = noseOf(stance) * Math.sin(yaw) * flat;
  eye.dy = -Math.sin(pitch);
  eye.dz = -Math.cos(yaw) * flat;
}

/**
 * The eye from the posed head (body.ts's frame: Y up the skull, Z its back),
 * pulled `back` toward the heels, then carried by `world`, the rider groups'
 * world matrix (the landing's move turns and slides the rider, ADR-68).
 */
export function writeEye(head: BoneFrame, stance: Stance, ready: number, world: Matrix4) {
  const { up, forward } = FP.eye;
  const lx = head.o.x + head.y.x * up - head.z.x * forward;
  const ly = REST_Y + head.o.y + head.y.y * up - head.z.y * forward;
  const lz = head.o.z + head.y.z * up - head.z.z * forward + FP.back;
  writeDirection(stance, ready);
  const m = world.elements;
  eye.x = m[0]! * lx + m[4]! * ly + m[8]! * lz + m[12]!;
  eye.y = m[1]! * lx + m[5]! * ly + m[9]! * lz + m[13]!;
  eye.z = m[2]! * lx + m[6]! * ly + m[10]! * lz + m[14]!;
  const dx = eye.dx;
  const dy = eye.dy;
  const dz = eye.dz;
  eye.dx = m[0]! * dx + m[4]! * dy + m[8]! * dz;
  eye.dy = m[1]! * dx + m[5]! * dy + m[9]! * dz;
  eye.dz = m[2]! * dx + m[6]! * dy + m[10]! * dz;
  eye.posed = true;
}

/** The still eye: reduced motion, or no head posed. Above the head's highest point in a jump, looking as in the crouch. */
export function writeCalmEye(stance: Stance) {
  const [x, y, z] = FP.calm;
  eye.x = noseOf(stance) * x;
  eye.y = y;
  eye.z = z;
  writeDirection(stance, 1);
  eye.posed = false;
}

/**
 * The lens for the clear part of the stage (ADR-86): the vertical field of view
 * over the whole canvas that gives the clear area at least `fov.v` degrees of
 * height and `fov.h` of width, capped at `fov.max`.
 */
export function firstPersonFov(aspect: number, clear: { top: number; bottom: number; left: number; right: number }): number {
  const spanY = Math.max(0.1, clear.bottom - clear.top);
  const spanX = Math.max(0.1, (clear.right - clear.left) * aspect);
  const t = Math.max(Math.tan((FP.fov.v * D2R) / 2) / spanY, Math.tan((FP.fov.h * D2R) / 2) / spanX);
  return Math.min(FP.fov.max, (2 * Math.atan(t)) / D2R);
}
