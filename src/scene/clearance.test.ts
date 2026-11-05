// Acceptance test for the feet clearance (ADR-29, 2026-11-04): with the real
// scene transforms (setBoardRotation for the board, the applyFoot Euler for
// each shoe, the mirrored left shoe), no part of a sole is inside the board
// and no part of the board is inside a shoe, for every preset in both
// stances through the whole flight, and no sole goes below the pad. The board
// volume here is built from src/asset (deck.ts, spec.ts) and ART.board
// directly, independent of the sim's pinned copy in src/sim/boardVolume.ts.
import { describe, expect, it } from 'vitest';
import { Euler, Group, Matrix4, Object3D, Vector3 } from 'three';
import { halfWidth, midSurface } from '../asset/deck';
import { DECK, OUTLINE, REST_Y, TRUCK, WHEEL } from '../asset/spec';
import { FOOT, newFeetPose, writeFeetPose, type FootPose, type Stance } from '../sim/feet';
import { computeFlight, writePose, type Pose, type TrickInputs } from '../sim/flight';
import { PRESETS } from '../sim/tricks';
import { ART } from './artDirection';
import { setBoardRotation } from './boardPose';

const HT = DECK.thickness / 2;
const PB = ART.board;
const PD = PB.deck;

/** Hardware boxes [x0, x1, y0, y1, zHalf] for the nose truck, from spec.ts and ART.board (the tail mirrors x). */
const AX = TRUCK.axleHousing;
const BP = TRUCK.baseplate;
const nutR = Math.max(TRUCK.axleNuts.radius, TRUCK.speedWashers.radius);
const BOXES: [number, number, number, number, number][] = [
  // Hanger: baseplate length, down to the axle housing's bottom, across the housing (or the primitive hanger).
  [BP.center[0] - BP.size[0] / 2, BP.center[0] + BP.size[0] / 2, AX.center[1] - AX.size[1] / 2, TRUCK.deckBottom, Math.max(AX.size[2], PB.trucks.size[2]) / 2],
  // Wheels: either board's wheel radius about the axle, pad to top, out to the outer face.
  [
    WHEEL.centerX - Math.max(WHEEL.radius, PB.wheels.radius),
    WHEEL.centerX + Math.max(WHEEL.radius, PB.wheels.radius),
    -REST_Y,
    Math.max(WHEEL.centerY + WHEEL.radius, PB.wheels.y + PB.wheels.radius + PB.primitiveLift),
    WHEEL.centerZ + WHEEL.width / 2,
  ],
  // Axle ends with the nuts.
  [AX.center[0] - nutR, AX.center[0] + nutR, AX.center[1] - nutR, AX.center[1] + nutR, TRUCK.axle.length / 2],
];

/** The primitive deck's three boxes in the x-y plane: centre, tilt, half length, half thickness (core plus a skin). */
const PRIM = (() => {
  const half = PD.flatLength / 2;
  const k = PD.kick;
  const kx = half + (Math.cos(k.angle) * k.length) / 2;
  const ky = (Math.sin(k.angle) * k.length) / 2 + PB.primitiveLift;
  const ht = PD.thickness / 2 + PD.skin.thickness;
  return [
    { cx: 0, cy: PB.primitiveLift, a: 0, hl: half, ht },
    { cx: kx, cy: ky, a: k.angle, hl: k.length / 2, ht },
    { cx: -kx, cy: ky, a: -k.angle, hl: k.length / 2, ht },
  ];
})();

/** Inside the board (board frame), with a tolerance: points less than `tol` deep do not count. */
function insideBoard(x: number, y: number, z: number, tol: number): boolean {
  for (const [x0, x1, y0, y1, zh] of BOXES) {
    for (const s of [1, -1]) {
      const lo = s > 0 ? x0 : -x1;
      const hi = s > 0 ? x1 : -x0;
      if (x > lo + tol && x < hi - tol && y > y0 + tol && y < y1 - tol && Math.abs(z) < zh - tol) return true;
    }
  }
  if (Math.abs(z) < PD.width / 2 - tol) {
    for (const b of PRIM) {
      const dx = x - b.cx;
      const dy = y - b.cy;
      const u = dx * Math.cos(b.a) + dy * Math.sin(b.a);
      const v = -dx * Math.sin(b.a) + dy * Math.cos(b.a);
      if (Math.abs(u) < b.hl - tol && Math.abs(v) < b.ht - tol) return true;
    }
  }
  if (x <= OUTLINE.tailTip + tol || x >= OUTLINE.noseTip - tol) return false;
  if (Math.abs(z) >= halfWidth(x) - tol) return false;
  return Math.abs(y - midSurface(x, z)) < HT - tol;
}

/** Board surface points (board frame): the deck's top and bottom faces and rails, every box's faces, the primitive deck's faces. */
const BOARD_POINTS: Vector3[] = (() => {
  const pts: Vector3[] = [];
  for (let x = OUTLINE.tailTip; x <= OUTLINE.noseTip; x += 0.005) {
    const w = halfWidth(x);
    for (let j = -8; j <= 8; j++) {
      const z = (w * j) / 8;
      pts.push(new Vector3(x, midSurface(x, z) + HT, z), new Vector3(x, midSurface(x, z) - HT, z));
    }
  }
  const boxFaces = (corner: (u: number, v: number, w: number) => Vector3, n: [number, number, number]) => {
    // Grid points on the six faces: one coordinate at 0 or 1, the others stepped.
    for (let a = 0; a <= n[0]; a++)
      for (let b = 0; b <= n[1]; b++)
        for (let c = 0; c <= n[2]; c++) {
          const on = [a === 0 || a === n[0], b === 0 || b === n[1], c === 0 || c === n[2]].filter(Boolean).length;
          if (on > 0) pts.push(corner(a / n[0], b / n[1], c / n[2]));
        }
  };
  const steps = (l: number) => Math.max(2, Math.ceil(l / 0.01));
  for (const [x0, x1, y0, y1, zh] of BOXES) {
    for (const s of [1, -1]) {
      const lo = s > 0 ? x0 : -x1;
      const hi = s > 0 ? x1 : -x0;
      boxFaces((u, v, w) => new Vector3(lo + (hi - lo) * u, y0 + (y1 - y0) * v, -zh + 2 * zh * w), [steps(hi - lo), steps(y1 - y0), steps(2 * zh)]);
    }
  }
  for (const b of PRIM) {
    boxFaces(
      (u, v, w) => {
        const lu = (2 * u - 1) * b.hl;
        const lv = (2 * v - 1) * b.ht;
        return new Vector3(b.cx + lu * Math.cos(b.a) - lv * Math.sin(b.a), b.cy + lu * Math.sin(b.a) + lv * Math.cos(b.a), (w - 0.5) * PD.width);
      },
      [steps(2 * b.hl), 2, steps(PD.width)],
    );
  }
  return pts;
})();

/**
 * The shoe as the scene draws either model: the whole footprint up to the
 * GLB upper's height at the toe cap (sole 0.024 plus 0.034 at t = 0.8,
 * shoeSpec.ts), and the primitive's upper box above it.
 */
const SOLE = { a: FOOT.length / 2, w: FOOT.width / 2, h: FOOT.soleHeight + 0.034 };
const UPPER = {
  u0: -FOOT.length / 2,
  u1: FOOT.length / 2 - 2 * ART.feet.upper.lengthInset,
  w: FOOT.width / 2 - ART.feet.upper.widthInset,
  h: FOOT.soleHeight + ART.feet.upper.height,
};
const insideShoe = (p: Vector3, tol: number) =>
  (Math.abs(p.x) < SOLE.a - tol && Math.abs(p.z) < SOLE.w - tol && p.y > tol && p.y < SOLE.h - tol) ||
  (p.x > UPPER.u0 + tol && p.x < UPPER.u1 - tol && Math.abs(p.z) < UPPER.w - tol && p.y > tol && p.y < UPPER.h - tol);

/** Sole bottom points in the shoe frame: a 21 by 7 grid over the footprint rectangle. */
const SOLE_POINTS: Vector3[] = [];
for (let i = 0; i <= 20; i++) for (let j = 0; j <= 6; j++) SOLE_POINTS.push(new Vector3(-SOLE.a + (2 * SOLE.a * i) / 20, 0, -SOLE.w + (2 * SOLE.w * j) / 6));

const D2R = Math.PI / 180;

/** The board group as FlightDriver poses it. */
function boardObject(pose: Pose, stance: Stance, o: Object3D) {
  o.position.set(0, REST_Y + pose.y, 0);
  setBoardRotation(o.rotation, pose, stance);
  o.updateMatrixWorld(true);
}

/** A shoe as FlightDriver's applyFoot poses it, with the Feet component's mirror for the left shoe. */
function shoeObject(f: FootPose, edge: 1 | -1, mirror: boolean, outer: Group, inner: Group) {
  outer.position.set(f.x, REST_Y + f.y, f.z);
  outer.rotation.copy(new Euler(f.roll * edge * D2R, f.yaw * D2R, f.pitch * D2R, 'YZX'));
  inner.scale.set(1, 1, mirror ? -1 : 1);
  outer.updateMatrixWorld(true);
}

const TOL = 1e-4;

interface Hit {
  what: string;
  depth: number;
}

function check(inputs: TrickInputs, stance: Stance): { hits: Hit[]; belowPad: number } {
  const flight = computeFlight(inputs);
  const pose: Pose = { y: 0, roll: 0, yaw: 0, pitch: 0 };
  const feet = newFeetPose();
  const board = new Object3D();
  const outer = new Group();
  const inner = new Group();
  outer.add(inner);
  const toBoard = new Matrix4();
  const toShoe = new Matrix4();
  const shoeToBoard = new Matrix4();
  const boardToShoe = new Matrix4();
  const p = new Vector3();
  const hits: Hit[] = [];
  let belowPad = 0;
  const regular = stance === 'regular';
  for (let k = 0; k <= 200; k++) {
    const u = k / 200;
    writePose(pose, flight, u);
    writeFeetPose(feet, inputs, flight, u, stance);
    boardObject(pose, stance, board);
    toBoard.copy(board.matrixWorld).invert();
    // Goofy: front is the right shoe (edge +1, unmirrored); regular the other way round (FlightDriver, Feet).
    for (const [name, f, edge, mirror] of [
      ['front', feet.front, regular ? -1 : 1, regular],
      ['back', feet.back, regular ? 1 : -1, !regular],
    ] as const) {
      shoeObject(f, edge, mirror, outer, inner);
      inner.updateMatrixWorld(true);
      shoeToBoard.multiplyMatrices(toBoard, inner.matrixWorld);
      toShoe.copy(inner.matrixWorld).invert();
      boardToShoe.multiplyMatrices(toShoe, board.matrixWorld);
      for (const s of SOLE_POINTS) {
        p.copy(s).applyMatrix4(inner.matrixWorld);
        belowPad = Math.max(belowPad, -p.y);
        p.copy(s).applyMatrix4(shoeToBoard);
        if (insideBoard(p.x, p.y, p.z, TOL)) hits.push({ what: `${name} sole in board at u=${u}`, depth: 0 });
      }
      for (const b of BOARD_POINTS) {
        p.copy(b).applyMatrix4(boardToShoe);
        if (insideShoe(p, TOL)) hits.push({ what: `board in ${name} shoe at u=${u} (${b.x.toFixed(3)}, ${b.y.toFixed(3)}, ${b.z.toFixed(3)})`, depth: p.y });
      }
    }
  }
  return { hits, belowPad };
}

describe('feet clear the board (ADR-29)', () => {
  const cases = PRESETS.flatMap((preset) => (['goofy', 'regular'] as const).map((stance) => ({ id: preset.id, inputs: preset.inputs, stance })));
  it.each(cases)('$id, $stance: no sole point inside the board, no board point inside a shoe, never below the pad', ({ inputs, stance }) => {
    const { hits, belowPad } = check(inputs, stance);
    expect(hits.slice(0, 5)).toEqual([]);
    expect(belowPad).toBeLessThan(1e-6);
  });

  it('holds for an ollie, a low failed 360 flip (a bail) and the hardest inputs, both signs (ADR-30)', () => {
    for (const inputs of [
      { pop: 0.35, flick: 0, scoop: 0 },
      { pop: 0.15, flick: 1.9, scoop: 1.9 },
      { pop: 0.5, flick: 3, scoop: 3 },
      { pop: 0.5, flick: -3, scoop: -3 },
      { pop: 0.5, flick: -3, scoop: 3 },
      { pop: 0.5, flick: 3, scoop: -3 },
      { pop: 0.15, flick: -1.9, scoop: -0.9 },
    ]) {
      for (const stance of ['goofy', 'regular'] as const) {
        const { hits, belowPad } = check(inputs, stance);
        expect(hits.slice(0, 5)).toEqual([]);
        expect(belowPad).toBeLessThan(1e-6);
      }
    }
  });
});
