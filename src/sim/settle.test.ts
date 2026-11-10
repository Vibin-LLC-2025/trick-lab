import { Euler, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildBoard } from '../asset/board';
import { REST_Y } from '../asset/spec';
import { contactRise, restingRoll } from './boardSection';
import { footLift } from './boardVolume';
import { mirrorFoot, newFeetPose, PAD_Y, writeFeetIntent, writeFeetPose, type FeetPose, type FootPose } from './feet';
import { computeFlight, poseAt, rollAt, yawAt, type Flight } from './flight';
import { gradeOf } from './landing';
import { newSettle, restSide, SETTLE, settleSeconds, writeBailFeet, writeSettle, type Settle } from './settle';

const D2R = Math.PI / 180;

/** Every vertex of the built Medium board, in its rest frame (deck centre at the origin). */
const VERTS: Vector3[] = (() => {
  const out: Vector3[] = [];
  for (const g of Object.values(buildBoard('medium').parts)) {
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) out.push(new Vector3(a.getX(i), a.getY(i), a.getZ(i)));
  }
  return out;
})();

/**
 * The board's lowest point above the pad (metres) for a flight's end pose and
 * a landing, as the scene places it (goofy, ADR-10): the flight's rotation
 * (or the bail's roll), then the landing's rigid move.
 */
function lowest(flight: Flight, s: Settle): number {
  const end = poseAt(flight, 1);
  const roll = s.grade === 'bail' ? s.roll : end.roll;
  const rise = s.grade === 'bail' ? s.rise : end.y;
  const board = new Matrix4().makeRotationFromEuler(new Euler(roll * D2R, end.yaw * D2R, end.pitch * D2R, 'YZX'));
  board.setPosition(0, REST_Y + rise, 0);
  const pivot = new Vector3(s.pivotX, REST_Y + s.pivotY, 0);
  const move = new Matrix4()
    .makeTranslation(s.forward + pivot.x, pivot.y, s.side)
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(0, s.yaw * D2R, s.pitch * D2R, 'YZX')))
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, 0));
  const m = move.multiply(board);
  let low = Infinity;
  const v = new Vector3();
  for (const p of VERTS) low = Math.min(low, v.copy(p).applyMatrix4(m).y);
  return low;
}

/** Inputs that bail (a pop 0.35 m flight), sketchy and clean, both flick directions. */
const BAILS = [
  { pop: 0.35, flick: 1.1, scoop: 0 }, // a quarter flip short: onto a rail
  { pop: 0.35, flick: -1.1, scoop: 0 },
  { pop: 0.35, flick: 1.4, scoop: 0 }, // half a flip: upside down
  { pop: 0.35, flick: -1.5, scoop: 0 },
  { pop: 0.35, flick: 0.6, scoop: 0 }, // a third of a flip: back onto the wheels
  { pop: 0.35, flick: 0, scoop: 1.3 }, // the shove is off, the flip fine: wheels down, crooked
  { pop: 0.25, flick: 2.6, scoop: -1.6 },
  { pop: 0.5, flick: -2.2, scoop: 1.1 },
];
const SKETCHY = [
  { pop: 0.35, flick: 1.98, scoop: 0 },
  { pop: 0.35, flick: -1.98, scoop: 0 },
  { pop: 0.35, flick: 0, scoop: 1.02 },
];

const times = (end: number) => Array.from({ length: 41 }, (_, i) => (end * i) / 40);

describe('landings with weight (step 13, ADR-68)', () => {
  it('the cases are what they say', () => {
    for (const i of BAILS) expect(gradeOf(computeFlight(i).rollTotal, computeFlight(i).yawTotal)).toBe('bail');
    for (const i of SKETCHY) expect(gradeOf(computeFlight(i).rollTotal, computeFlight(i).yawTotal)).toBe('sketchy');
    const sides = BAILS.map((i) => restSide(computeFlight(i)));
    expect(new Set(sides)).toEqual(new Set(['rail', 'grip', 'wheels']));
  });

  it('a clean landing has nothing of its own: the flight end pose, no time', () => {
    const f = computeFlight({ pop: 0.35, flick: 1.9, scoop: 0 });
    expect(settleSeconds(f)).toBe(0);
    const s = writeSettle(newSettle(), f, 0.3);
    expect([s.forward, s.side, s.yaw, s.pitch, s.rise]).toEqual([0, 0, 0, 0, 0]);
    expect(s.riding).toBe(true);
  });

  it('keeps the board on the pad the whole way, within 1 mm, from the flight end to rest', () => {
    for (const inputs of [...BAILS, ...SKETCHY]) {
      const f = computeFlight(inputs);
      for (const t of times(settleSeconds(f) + 0.2)) {
        const low = lowest(f, writeSettle(newSettle(), f, t));
        expect(Math.abs(low), `${JSON.stringify(inputs)} at ${t.toFixed(3)} s`).toBeLessThan(0.001);
      }
    }
  });

  it('a bail starts exactly where the flight ended, and ends resting on a side', () => {
    for (const inputs of BAILS) {
      const f = computeFlight(inputs);
      const start = writeSettle(newSettle(), f, 0);
      const end = poseAt(f, 1);
      expect(start.roll).toBeCloseTo(end.roll, 9);
      expect(start.rise).toBeCloseTo(end.y, 9);
      expect([start.forward, start.side]).toEqual([0, 0]);
      const rest = writeSettle(newSettle(), f, Infinity);
      expect(rest.roll).toBe(restingRoll(rollAt(f, 1)));
      expect(rest.rise).toBeCloseTo(contactRise(rest.roll), 12);
      expect(rest.forward).toBe(SETTLE.bail.forwardM);
      expect(rest.side).toBe(-SETTLE.bail.sideM);
      expect(rest.riding).toBe(false);
    }
  });

  it('a sketchy landing rocks once and swerves, then holds still; the rider rides it', () => {
    for (const inputs of SKETCHY) {
      const f = computeFlight(inputs);
      const top = writeSettle(newSettle(), f, SETTLE.sketchy.rockS / 2);
      expect(top.pitch).toBeCloseTo(SETTLE.sketchy.rockDeg, 9);
      expect(top.riding).toBe(true);
      const end = writeSettle(newSettle(), f, settleSeconds(f));
      expect(end.pitch).toBeCloseTo(0, 9);
      expect(end.yaw).toBeCloseTo(0, 9);
      expect(Math.abs(end.side)).toBeCloseTo(SETTLE.sketchy.sideM, 9);
      const later = writeSettle(newSettle(), f, Infinity);
      expect(later.side).toBe(end.side);
    }
    // The two flick directions swerve opposite ways.
    const kick = writeSettle(newSettle(), computeFlight(SKETCHY[0]!), 0.3);
    const heel = writeSettle(newSettle(), computeFlight(SKETCHY[1]!), 0.3);
    expect(Math.sign(kick.yaw)).toBe(-Math.sign(heel.yaw));
  });

  /** A foot moved into the board's frame of a bail at time t: the slide taken off (goofy frame). */
  const relative = (f: FootPose, s: Settle): FootPose => ({ ...f, x: f.x - s.forward, z: f.z - s.side });
  const unmirror = (f: FootPose): FootPose => {
    const m = { ...f };
    mirrorFoot(m);
    return m;
  };

  it('a sliding board never passes through a shoe, and a shoe it slid out from under comes down to the pad: both stances, both directions', () => {
    for (const stance of ['goofy', 'regular'] as const) {
      for (const inputs of BAILS) {
        const f = computeFlight(inputs);
        const aim = writeFeetIntent(newFeetPose(), inputs, f, 1, stance);
        for (const t of [...times(settleSeconds(f)), Infinity]) {
          const s = writeSettle(newSettle(), f, t);
          const feet: FeetPose = writeBailFeet(newFeetPose(), inputs, f, s, stance);
          // Mirrored back for a regular rider: the board's own frame is goofy.
          const front = stance === 'regular' ? unmirror(feet.front) : feet.front;
          const back = stance === 'regular' ? unmirror(feet.back) : feet.back;
          const board = { y: s.rise, roll: s.roll, yaw: yawAt(f, 1), pitch: 0 };
          const label = `${stance} ${JSON.stringify(inputs)} at ${t} s`;
          expect(footLift(relative(front, s), 1, board, 1), label).toBeLessThanOrEqual(1e-9);
          expect(footLift(relative(back, s), -1, board, 1), label).toBeLessThanOrEqual(1e-9);
          // Never below where the model stepped them: on the pad, or on the board.
          expect(feet.front.y, label).toBeGreaterThanOrEqual(aim.front.y - 1e-12);
          expect(feet.back.y, label).toBeGreaterThanOrEqual(aim.back.y - 1e-12);
        }
        // At rest both feet are on the pad: the board has slid clear of them.
        const rest = writeBailFeet(newFeetPose(), inputs, f, writeSettle(newSettle(), f, Infinity), stance);
        expect(rest.front.y, JSON.stringify(inputs)).toBeCloseTo(PAD_Y, 9);
        expect(rest.back.y, JSON.stringify(inputs)).toBeCloseTo(PAD_Y, 9);
      }
    }
  });

  it('at the landing the bail feet are the flight feet: no jump', () => {
    for (const stance of ['goofy', 'regular'] as const)
      for (const inputs of BAILS) {
        const f = computeFlight(inputs);
        const flight = writeFeetPose(newFeetPose(), inputs, f, 1, stance);
        const bail = writeBailFeet(newFeetPose(), inputs, f, writeSettle(newSettle(), f, 0), stance);
        expect(bail.front.y).toBeCloseTo(flight.front.y, 9);
        expect(bail.back.y).toBeCloseTo(flight.back.y, 9);
        expect(bail.front.x).toBeCloseTo(flight.front.x, 12);
      }
  });

  it('every landing is over inside the computer’s wait, with the push to come after it', () => {
    for (const inputs of [...BAILS, ...SKETCHY]) expect(settleSeconds(computeFlight(inputs))).toBeLessThanOrEqual(1.3);
  });
});
