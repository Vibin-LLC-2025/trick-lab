// Pins the sim's copy of the board (src/sim/boardVolume.ts, ADR-29) to the
// asset and the scene by behaviour: the deck top on a grid over the outline,
// every vertex of the built deck, trucks and wheels (both detail levels) and
// of the primitive board inside the sim's volume, the primitive's numbers
// against ART.board, and the deck top against the cue drape rule.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { buildDeck, halfWidth as assetHalfWidth, kickHeight as assetKick, midSurface as assetMid } from '../asset/deck';
import { buildTruck, buildWheels } from '../asset/hardware';
import { CONCAVE, DECK, HARDWARE_DETAIL, KICK, OUTLINE, REST_Y, TRUCK, WHEEL } from '../asset/spec';
import { ART } from '../scene/artDirection';
import { cueHeight } from '../scene/motionCueGeometry';
import { geo } from '../scene/resources';
import {
  BOARD,
  CLEARANCE,
  deckTiltDeg,
  deckTop,
  footLift,
  glbDeckTop,
  halfWidth,
  insideBoard,
  kickHeight,
  midSurface,
  primitiveDeckTop,
  SAMPLE_COUNTS,
  SOLE_HALF,
} from './boardVolume';
import { FOOT, PAD_Y } from './feet';
import type { Pose } from './flight';

const O = OUTLINE;
const vertices = (g: BufferGeometry, lift = 0) => {
  const p = g.getAttribute('position');
  const out: [number, number, number][] = [];
  for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i) + lift, p.getZ(i)]);
  return out;
};
/** Grid over the outline: x tail tip to nose tip, z across the half width there. */
const grid = (nx: number, nz: number) => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= nx; i++) {
    const x = O.tailTip + ((O.noseTip - O.tailTip) * i) / nx;
    const w = assetHalfWidth(x);
    for (let j = -nz; j <= nz; j++) pts.push([x, (w * j) / nz]);
  }
  return pts;
};

describe('the pinned board', () => {
  it('copies the outline, kicks, concave, thickness and rest height of src/asset/spec.ts', () => {
    const B = BOARD.outline;
    expect([B.tailTip, B.noseTip]).toEqual([O.tailTip, O.noseTip]);
    expect(B.middle).toEqual({ halfWidth: O.middle.halfWidth, drop: O.middle.drop, dropAt: O.middle.dropAt });
    expect(B.tail).toEqual(O.tail);
    expect(B.nose).toEqual(O.nose);
    expect(BOARD.kick).toEqual({
      start: KICK.start,
      nose: { length: KICK.nose.length, a: KICK.nose.a, b: KICK.nose.b },
      tail: { length: KICK.tail.length, a: KICK.tail.a, b: KICK.tail.b },
    });
    expect(BOARD.concave).toEqual(CONCAVE);
    expect(BOARD.thickness).toBe(DECK.thickness);
    expect(BOARD.restY).toBeCloseTo(REST_Y, 12);
    expect(-BOARD.restY).toBe(PAD_Y);
  });

  it('has the realistic deck top of src/asset/deck.ts everywhere over the outline (1e-9)', () => {
    for (const [x, z] of grid(400, 20)) {
      expect(Math.abs(glbDeckTop(x, z) - (assetMid(x, z) + DECK.thickness / 2))).toBeLessThan(1e-9);
      expect(Math.abs(midSurface(x, z) - assetMid(x, z))).toBeLessThan(1e-12);
      expect(Math.abs(halfWidth(x) - assetHalfWidth(x))).toBeLessThan(1e-12);
      expect(Math.abs(kickHeight(x) - assetKick(x))).toBeLessThan(1e-12);
    }
    expect(halfWidth(O.tailTip - 0.01)).toBe(0);
    expect(halfWidth(O.noseTip + 0.01)).toBe(0);
  });

  it('holds every vertex of the built deck, both detail levels, to within the 2 mm margin', () => {
    // The build offsets the faces along the surface normal, the sim along Y.
    // Heights differ by under 0.4 mm (the 20 degree kicks). Along the deck the
    // bottom rim at the rounded tips leans up to 2 mm past the sim's outline,
    // where the outline's half width falls steeply: pulled 2.5 mm toward the
    // centre, every vertex is inside it. Both are inside CLEARANCE.margin.
    expect(CLEARANCE.margin).toBeGreaterThanOrEqual(0.002);
    for (const level of ['medium', 'high'] as const) {
      const deck = buildDeck(level);
      for (const g of Object.values(deck.groups)) {
        for (const [x, y, z] of vertices(g)) {
          const xc = Math.min(O.noseTip, Math.max(O.tailTip, x));
          expect(Math.abs(y - midSurface(xc, z))).toBeLessThan(DECK.thickness / 2 + 4e-4);
          const xin = x - Math.sign(x) * 0.0025;
          // Across, the lower half of the side wall leans out up to 0.4 mm (its
          // normal tilts with the concave at the rail).
          expect(Math.abs(z)).toBeLessThanOrEqual(halfWidth(xin) + 5e-4);
        }
      }
    }
  });

  it('holds every vertex of the built trucks and wheels in the hardware boxes, both detail levels', () => {
    for (const level of ['medium', 'high'] as const) {
      const det = HARDWARE_DETAIL[level];
      const parts: BufferGeometry[] = [buildWheels(det)];
      for (const side of [1, -1] as const) {
        const t = buildTruck(side, det);
        parts.push(...t.aluminium, ...t.steel, ...t.bushing);
      }
      for (const g of parts) for (const [x, y, z] of vertices(g)) expect(insideBoard(x, y, z, 1e-6)).toBe(true);
    }
    // And the boxes are tight: the wheel box reaches the pad and the wheel's outer face, the axle box the axle's end.
    expect(BOARD.hardware.wheels.y[0]).toBeCloseTo(-REST_Y, 9);
    expect(BOARD.hardware.wheels.z).toBeCloseTo(WHEEL.centerZ + WHEEL.width / 2, 9);
    expect(BOARD.hardware.axle.z).toBeCloseTo(TRUCK.axle.length / 2, 9);
    expect(BOARD.hardware.hanger.y[1]).toBe(TRUCK.deckBottom);
  });

  it('holds every vertex of the scene primitive board (Low and the fallback, ADR-54)', () => {
    // Since ADR-54 the drawn primitive is the real deck mesh with the trucks and wheels as
    // the GLB's envelopes, at the GLB's coordinates (no lift); the legacy primitive deck
    // stays in BOARD, pinned, so the feet keep their poses.
    for (const [x, y, z] of vertices(geo.boardHardware, 0)) expect(insideBoard(x, y, z, 1e-5)).toBe(true);
    // The deck is the Medium GLB's own mesh: its facets stand up to 0.4 mm off this analytic
    // volume, inside half the feet's clearance margin; its nose and tail caps run past the
    // outline tips (|x| over 0.39 m), where the volume narrows to nothing and no sole reaches.
    for (const [x, y, z] of vertices(geo.boardDeck, 0)) if (Math.abs(x) < 0.39) expect(insideBoard(x, y, z, CLEARANCE.margin / 2)).toBe(true);
  });

  it('takes the deck top of whichever board is higher, as the motion cues drape (cueHeight)', () => {
    for (const [x, z] of grid(200, 10)) {
      // Past the primitive's kick ends (|x| 0.398) cueHeight runs the kick on; the sim stops it.
      if (Math.abs(x) > 0.39) continue;
      expect(Math.abs(deckTop(x, z) - (cueHeight(x, z) - ART.motionCues.lift))).toBeLessThan(1e-9);
    }
    expect(primitiveDeckTop(0)).toBeCloseTo(BOARD.primitive.halfThickness + BOARD.primitive.lift, 12);
  });

  it('measures the deck tilt under a sole: level in the middle, nose down on the tail, nose up on the nose', () => {
    expect(deckTiltDeg(0, 0, FOOT.width)).toBeCloseTo(0, 9);
    expect(deckTiltDeg(-0.31, 0.1, FOOT.width)).toBeLessThan(-10);
    expect(deckTiltDeg(0.31, 0.1, FOOT.width)).toBeGreaterThan(10);
  });

  it('uses the shoe footprint rectangle FOOT (the primitive shoe, which holds the GLB shoe outline)', () => {
    expect(SOLE_HALF.length * 2).toBeCloseTo(FOOT.length, 12);
    expect(SOLE_HALF.width * 2).toBeCloseTo(FOOT.width, 12);
  });
});

describe('footLift', () => {
  const rest: Pose = { y: 0, roll: 0, yaw: 0, pitch: 0 };
  const foot = (x: number, y: number, z: number, yaw = 90, pitch = 0, roll = 0) => ({ x, y, z, yaw, pitch, roll });
  const railTop = glbDeckTop(0.1, 1);

  it('sets a level shoe across the flat 2 mm above the rails, and leaves one already clear alone', () => {
    expect(footLift(foot(0.1, 0, 0), 1, rest)).toBeCloseTo(railTop + CLEARANCE.margin, 4);
    expect(footLift(foot(0.1, railTop + 0.05, 0), 1, rest)).toBe(0);
  });

  it('ramps a shoe beside the board with the shoulder, and narrows it to nothing for a bail', () => {
    // A shoe on the pad across z, its toe 5.6 cm from the heel-side rail, the
    // deck top 10 cm above its sole: the gentle shoulder (1.5 per metre) still
    // asks for a lift; narrowed (feet.ts does it over a bail) it asks nothing.
    const beside = foot(0, PAD_Y, O.middle.halfWidth + FOOT.length / 2 + 0.056);
    const height = railTop + REST_Y;
    expect(footLift(beside, 1, rest)).toBeCloseTo(height + CLEARANCE.margin - CLEARANCE.shoulder.near * 0.056, 3);
    expect(footLift(beside, 1, rest, 1)).toBe(0);
    // 1.6 cm from the rail (the bail's front toe): still nothing once narrowed.
    expect(footLift(foot(0, PAD_Y, O.middle.halfWidth + FOOT.length / 2 + 0.016), 1, rest, 1)).toBe(0);
  });

  it('never leaves a sole corner below the pad', () => {
    const tilted = foot(0, PAD_Y, 0.4, 90, 0, 20);
    expect(footLift(tilted, 1, rest)).toBeCloseTo((FOOT.width / 2) * Math.sin((20 * Math.PI) / 180), 6);
  });

  it('clears an edge-on deck over its rail and an upside-down board over its wheels', () => {
    // On its edge the top is the wider of the two decks' rails: the primitive's, 0.1025.
    const edge: Pose = { y: 0, roll: 90, yaw: 0, pitch: 0 };
    const rail = Math.max(O.middle.halfWidth, BOARD.primitive.halfWidth);
    expect(footLift(foot(0, 0.05, 0), 1, edge)).toBeCloseTo(rail + CLEARANCE.margin - 0.05, 4);
    const flipped: Pose = { y: 0, roll: 180, yaw: 0, pitch: 0 };
    expect(footLift(foot(TRUCK.centerX, 0.03, 0), 1, flipped)).toBeCloseTo(REST_Y + CLEARANCE.margin - 0.03, 4);
  });

  it('catches a thin rail between the sole samples (the edges are exact, not sampled)', () => {
    // Edge-on deck, shoe along it: the 11.5 mm plate passes under the sole
    // between its centreline and its edge samples, about 1 cm off centre.
    const edge: Pose = { y: 0, roll: 90, yaw: 0, pitch: 0 };
    const rail = Math.max(O.middle.halfWidth, BOARD.primitive.halfWidth);
    expect(footLift(foot(0, 0.05, 0, 0), 1, edge)).toBeCloseTo(rail + CLEARANCE.margin - 0.05, 4);
  });

  it('is cheap: well under 0.1 ms a call (measured about 0.01 ms on a desktop)', () => {
    const pose: Pose = { y: 0.2, roll: 200, yaw: 120, pitch: 5 };
    const f = foot(0.15, 0.25, 0.02, 60, 3, 10);
    let sink = 0;
    for (let i = 0; i < 200; i++) sink += footLift(f, 1, pose);
    const n = 4000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      pose.roll = (i * 0.37) % 360;
      sink += footLift(f, 1, pose);
    }
    const ms = (performance.now() - t0) / n;
    expect(sink).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(0.1);
    expect(SAMPLE_COUNTS.sole).toBe(19);
  });
});
