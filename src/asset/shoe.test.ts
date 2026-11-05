import { describe, expect, it } from 'vitest';
import { Box3, type BufferGeometry, Vector3 } from 'three';
import { FOOT } from '../sim/feet';
import {
  OPENING_FROM,
  OPENING_TO,
  SOLE_RING_POINTS,
  archPoint,
  buildBumper,
  buildCollar,
  buildEyelets,
  buildLaces,
  buildLining,
  buildShell,
  buildShoe,
  buildSole,
  buildTongue,
  bumperHeight,
  eyeletTs,
  eyelets,
  footHalfWidth,
  openingC,
  openingHalfGap,
  laceGround,
  ribbon,
  rimRadius,
  shoeTriangles,
  toeSpring,
  tongueHalfWidth,
  tonguePoint,
  triangleCount,
  upperFrame,
  upperStations,
} from './shoe';
import { BUMPER, FOOTPRINT, LACES, SHOE, SHOE_MATERIALS, SHOE_PARTS, SOLE, SOLE_ATLAS, SHOE_TEXTURES, TOE_SPRING, TONGUE, UPPER, UPPER_ATLAS } from './shoeSpec';
import { BUDGETS } from './spec';

const shoe = buildShoe();
const box = (g: BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!.clone();
};
const L = SHOE.length;
const tOf = (x: number) => (x + L / 2) / L;

describe('shoe spec', () => {
  it('matches FOOT in src/sim/feet.ts, which places the feet from these numbers', () => {
    expect(SHOE.length).toBe(FOOT.length);
    expect(SHOE.width).toBe(FOOT.width);
    expect(SHOE.soleHeight).toBe(FOOT.soleHeight);
  });

  it('is widest at the ball, where the two sides add up to the shoe width', () => {
    expect(FOOTPRINT.toe.lateral + FOOTPRINT.toe.medial).toBeCloseTo(SHOE.width, 9);
    const xBall = -SHOE.length / 2 + FOOTPRINT.toe.join * SHOE.length;
    expect(footHalfWidth(xBall, 'lateral') + footHalfWidth(xBall, 'medial')).toBeCloseTo(SHOE.width, 6);
  });

  it('has an arch: the medial side dips more than the lateral side in the middle', () => {
    const x = -SHOE.length / 2 + FOOTPRINT.arch.at * SHOE.length;
    const straightMedial = footHalfWidth(x - 0.05, 'medial');
    expect(footHalfWidth(x, 'medial')).toBeLessThan(straightMedial);
    expect(FOOTPRINT.arch.medial).toBeGreaterThan(FOOTPRINT.arch.lateral);
  });
});

describe('shoe geometry (right foot, toe +X, lateral +Z)', () => {
  it('is 285 x 105 mm, rests on y = 0 and the collar and tongue reach 80 to 95 mm', () => {
    const all = new Box3();
    for (const p of SHOE_PARTS) all.union(box(shoe.parts[p.node]));
    expect(all.max.x - all.min.x).toBeCloseTo(SHOE.length, 4);
    expect(all.max.z - all.min.z).toBeCloseTo(SHOE.width, 4);
    expect(all.min.y).toBeCloseTo(0, 6);
    expect(all.max.y).toBeGreaterThan(0.08);
    expect(all.max.y).toBeLessThan(0.095);
    // Bounding box centred on the origin in x.
    expect(all.max.x + all.min.x).toBeCloseTo(0, 6);
  });

  it('puts the medial (wider) side at -Z: the toe joint is wider than the little-toe side', () => {
    const b = box(shoe.parts.Shoe_Sole);
    expect(-b.min.z).toBeGreaterThan(b.max.z);
  });

  it('is one geometry per material, within the shoe budget', () => {
    expect(SHOE_PARTS.length).toBe(BUDGETS.shoes.drawCalls);
    const tris = shoeTriangles(shoe);
    const total = Object.values(tris).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(BUDGETS.shoes.triangles);
    expect(total).toBeGreaterThan(12000);
    // 72 outline points per side (24 per region), so the rounded toe and heel read (was 48 before ADR-39).
    expect(SOLE_RING_POINTS).toBe(144);
    const sole = buildSole();
    const bumper = buildBumper();
    const ringDropped = sole.dropped - bumper.dropped;
    expect(tris.Shoe_Sole).toBe((SOLE.rings.length - 1) * 2 * SOLE_RING_POINTS - ringDropped + triangleCount(bumper.geometry));
  });

  it('has no NaN in any attribute', () => {
    for (const p of SHOE_PARTS) {
      const g = shoe.parts[p.node];
      for (const name of Object.keys(g.attributes))
        expect(Array.from(g.getAttribute(name).array).every(Number.isFinite), `${p.node}.${name}`).toBe(true);
    }
  });

  it('faces outward: sole top normals +Y, sole bottom -Y, shell top +Y, lateral wall +Z', () => {
    const sole = shoe.parts.Shoe_Sole;
    const sp = sole.getAttribute('position'), sn = sole.getAttribute('normal');
    for (let i = 0; i < sp.count; i++) {
      // Behind the toe bumper (from t 0.8), and off the bevel round the heel tip, which faces back.
      if (sp.getX(i) > 0.08 || sp.getX(i) < -L / 2 + 0.015) continue;
      if (sp.getY(i) > SHOE.soleHeight - 1e-6 && Math.abs(sp.getZ(i)) < 0.02) expect(sn.getY(i)).toBeGreaterThan(0.9);
      if (sp.getY(i) < 1e-6 && Math.abs(sp.getZ(i)) < 0.02) expect(sn.getY(i)).toBeLessThan(-0.9);
    }
    const up = buildShell().geometry;
    const p = up.getAttribute('position'), n = up.getAttribute('normal');
    const b = box(up);
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > b.max.y - 0.002) expect(n.getY(i)).toBeGreaterThan(0);
      if (p.getZ(i) > b.max.z - 0.001) expect(n.getZ(i)).toBeGreaterThan(0);
      if (p.getZ(i) < b.min.z + 0.001) expect(n.getZ(i)).toBeLessThan(0);
    }
  });

  it('winds every triangle with its smooth normal (face normal agrees with the vertex normal)', () => {
    const a = new Vector3(), bb = new Vector3(), c = new Vector3(), nn = new Vector3();
    for (const part of SHOE_PARTS.map((p) => p.node)) {
      let agree = 0, total = 0;
      const g = shoe.parts[part];
      const p = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const idx = g.index!.array;
      for (let i = 0; i < idx.length; i += 3) {
        a.fromBufferAttribute(p, idx[i]!);
        bb.fromBufferAttribute(p, idx[i + 1]!).sub(a);
        c.fromBufferAttribute(p, idx[i + 2]!).sub(a);
        nn.fromBufferAttribute(nor, idx[i]!);
        total++;
        if (bb.cross(c).dot(nn) > 0) agree++;
      }
      // The tip slivers can disagree with an averaged normal; everything else must agree.
      expect(agree / total, part).toBeGreaterThan(0.99);
    }
  });

  it('keeps the underside flat on y = 0 and lifts only the upper and the foxing at the toe (toe spring)', () => {
    expect(toeSpring(TOE_SPRING.from)).toBe(0);
    expect(toeSpring(1)).toBeGreaterThanOrEqual(0.003);
    expect(toeSpring(1)).toBeLessThanOrEqual(0.006);
    const p = shoe.parts.Shoe_Sole.getAttribute('position');
    let toeTop = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.001) expect(Math.abs(p.getY(i))).toBeLessThan(1e-9);
      if (p.getX(i) > 0.13 && p.getY(i) < SHOE.soleHeight + 0.005) toeTop = Math.max(toeTop, p.getY(i));
    }
    // The foxing wall at the toe rises above the 24 mm envelope height, by the spring.
    expect(toeTop).toBeGreaterThan(SHOE.soleHeight + 0.002);
    expect(upperFrame(1).base - upperFrame(0.5).base).toBeCloseTo(toeSpring(1), 9);
  });

  it('stays under the toe cap height the clearance test assumes, forward of its upper box (clearance.test.ts)', () => {
    // The clearance test's shoe: the whole footprint up to sole + 0.034, the upper box only back from 40 mm short of the toe.
    for (const part of SHOE_PARTS.map((q) => q.node)) {
      const p = shoe.parts[part].getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getX(i) > L / 2 - 0.04) expect(p.getY(i), part).toBeLessThan(SHOE.soleHeight + 0.034);
    }
  });

  it('opens the shell over the ankle and the lace gap: no shell inside the rim, closed at the heel and over the vamp', () => {
    expect(openingC(0.25)).toBeGreaterThan(0.75);
    expect(openingHalfGap(OPENING_FROM)).toBe(0);
    expect(openingHalfGap(OPENING_TO)).toBe(0);
    const stations = upperStations();
    const shell = buildShell(stations).geometry;
    const p = shell.getAttribute('position');
    let crown = 0;
    for (let i = 0; i < p.count; i++) {
      // The vertex's station (its x went through float32).
      const t = stations.reduce((best, s) => (Math.abs(s - tOf(p.getX(i))) < Math.abs(best - tOf(p.getX(i))) ? s : best));
      const f = upperFrame(t);
      const c = f.a > 0 ? (p.getZ(i) - f.zc) / f.a : 1;
      expect(Math.abs(c)).toBeGreaterThanOrEqual(openingC(t) - 1e-3);
      if (Math.abs(c) < 0.01 && (t < OPENING_FROM - 0.01 || t > OPENING_TO + 0.01)) crown++;
    }
    expect(crown).toBeGreaterThan(20);
    // The rim is lower at the sides of the ankle than at the back of the heel.
    expect(archPoint(0.25, openingC(0.25))[1]).toBeLessThan(archPoint(OPENING_FROM, 0)[1] - 0.005);
  });

  it('finishes the rim with a padded collar round the ankle and a thin bead along the lace gap', () => {
    expect(rimRadius(0.2)).toBeCloseTo(UPPER.rim.collar, 9);
    expect(rimRadius(0.55)).toBeCloseTo(UPPER.rim.bead, 9);
    const collar = box(buildCollar().geometry);
    // The roll stands above the rim at the back of the heel.
    expect(collar.max.y).toBeGreaterThan(archPoint(OPENING_FROM, 0)[1]);
  });

  it('closes the inside with a lining down to an insole above the sole top, facing into the opening', () => {
    const lining = buildLining().geometry;
    const b = box(lining);
    expect(b.min.y).toBeCloseTo(SHOE.soleHeight + UPPER.lining.insole, 6);
    // Insole vertices face up.
    const p = lining.getAttribute('position'), n = lining.getAttribute('normal');
    let insole = 0;
    for (let i = 0; i < p.count; i++)
      if (Math.abs(p.getY(i) - b.min.y) < 1e-6 && n.getY(i) > 0.5) insole++;
    expect(insole).toBeGreaterThan(10);
  });

  it('makes the tongue its own shape, under the eyestays by 2 to 4 mm each side, rising above the collar in front of the ankle', () => {
    for (const t of [0.5, 0.55, 0.6]) {
      const overlap = tongueHalfWidth(t) - openingHalfGap(t);
      expect(overlap).toBeGreaterThanOrEqual(0.002);
      expect(overlap).toBeLessThanOrEqual(0.004);
      // Below the eyestay where they overlap.
      const f = upperFrame(t);
      const c = (openingHalfGap(t) + overlap / 2) / f.a;
      expect(archPoint(t, c)[1] - tonguePoint(t, c / (tongueHalfWidth(t) / f.a))[1]).toBeGreaterThan(0.002);
    }
    expect(tonguePoint(TONGUE.top, 0)[1]).toBeGreaterThan(archPoint(0.36, openingC(0.36))[1] + 0.008);
    const tongue = box(buildTongue().geometry);
    expect(tongue.max.x).toBeCloseTo(-L / 2 + TONGUE.root * L, 6);
    expect(tongue.min.x).toBeCloseTo(-L / 2 + TONGUE.top * L, 3);
  });

  it('puts a raised rim round each of the twelve eyelets', () => {
    const list = eyelets();
    expect(list).toHaveLength(2 * UPPER.eyelets.count);
    const g = buildEyelets().geometry;
    expect(triangleCount(g)).toBe(list.length * 3 * UPPER.eyelets.segments * 2);
    for (const e of list) expect(Math.abs(Math.abs(e.c) - openingC(e.t) - UPPER.eyelets.edge / upperFrame(e.t).a)).toBeLessThan(1e-9);
  });

  it('adds a toe bumper in the sole rubber, proud of the upper, up to its height at the front', () => {
    expect(bumperHeight(BUMPER.from)).toBe(0);
    expect(bumperHeight(1)).toBeCloseTo(BUMPER.height, 9);
    const b = box(buildBumper().geometry);
    expect(b.min.x).toBeGreaterThan(-L / 2 + BUMPER.from * L - 0.001);
    expect(b.max.y).toBeGreaterThan(SHOE.soleHeight + BUMPER.height - 0.002);
    expect(b.max.x).toBeLessThanOrEqual(L / 2 + 1e-9);
  });

  it('makes the laces flat ribbons, 10 x 1.5 mm', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [0.01, 0, 0],
      [0.02, 0, 0],
    ];
    const up: [number, number, number] = [0, 1, 0];
    const g = ribbon(path, [up, up, up], [LACES.width / 2, LACES.width / 2, LACES.width / 2], [LACES.thickness / 2, LACES.thickness / 2, LACES.thickness / 2]).geometry;
    const b = box(g);
    expect(b.max.z - b.min.z).toBeCloseTo(0.01, 6);
    expect(b.max.y - b.min.y).toBeCloseTo(0.0015, 6);
  });

  it('laces from the bottom pair to the top pair, with a knot and two ends falling to both sides', () => {
    const ts = eyeletTs();
    expect(ts).toHaveLength(UPPER.eyelets.count);
    expect(ts[0]).toBe(UPPER.eyelets.from);
    expect(ts[ts.length - 1]).toBeCloseTo(UPPER.eyelets.to, 9);
    const laces = box(buildLaces());
    expect(laces.min.x).toBeLessThan(-L / 2 + ts[0]! * L);
    expect(laces.max.x).toBeGreaterThan(-L / 2 + ts[ts.length - 1]! * L);
    // The ends fall past the lateral and medial eyelets.
    const lat = eyelets().filter((e) => e.side === 'lateral').map((e) => e.at[2]);
    const med = eyelets().filter((e) => e.side === 'medial').map((e) => e.at[2]);
    expect(laces.max.z).toBeGreaterThan(Math.max(...lat) + 0.01);
    expect(laces.min.z).toBeLessThan(Math.min(...med) - 0.01);
    // On whatever they cross, never sunk into it: only the dives into the eyelet holes (1.5 mm plus half a lace) go below.
    const g = buildLaces();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeGreaterThan(laceGround(p.getX(i), p.getZ(i)) - 0.0036);
  });

  it('maps the shell with u along the length and v across the section, in its band of the upper map', () => {
    const up = buildShell().geometry;
    const p = up.getAttribute('position');
    const uv = up.getAttribute('uv');
    const H = SHOE_TEXTURES.upper.height;
    for (let i = 0; i < p.count; i++) {
      expect(Math.abs(uv.getX(i) - tOf(p.getX(i)))).toBeLessThan(1e-5);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(UPPER_ATLAS.shell[0] / H);
      expect(uv.getY(i)).toBeLessThanOrEqual((UPPER_ATLAS.shell[1] + 1) / H);
      if (p.getZ(i) > 0.045) expect(uv.getY(i)).toBeGreaterThan(0.85 * (UPPER_ATLAS.shell[1] / H));
      if (p.getZ(i) < -0.05) expect(uv.getY(i)).toBeLessThan(0.15 * (UPPER_ATLAS.shell[1] / H));
    }
  });

  it('maps the underside to the tread and the wall to the wall strip of the sole map', () => {
    const g = buildSole().geometry;
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const H = SHOE_TEXTURES.sole.height;
    let under = 0;
    for (let i = 0; i < p.count; i++) {
      const v = uv.getY(i) * H;
      if (p.getY(i) === 0 && Math.abs(p.getZ(i)) < 0.02 && Math.abs(p.getX(i)) < 0.06) {
        under++;
        expect(v).toBeGreaterThanOrEqual(SOLE_ATLAS.tread[0]);
        expect(v).toBeLessThanOrEqual(SOLE_ATLAS.tread[1] + 1);
      }
      if (p.getX(i) < 0.08 && p.getY(i) > 0.004 && p.getY(i) < SHOE.soleHeight - 0.004) {
        expect(v).toBeGreaterThanOrEqual(SOLE_ATLAS.wall[0]);
        expect(v).toBeLessThanOrEqual(SOLE_ATLAS.wall[1] + 1);
      }
    }
    expect(under).toBeGreaterThan(50);
  });

  it('renders the upper double sided, so the inside of the shell shows through the opening', () => {
    expect(SHOE_MATERIALS.upper.doubleSided).toBe(true);
  });
});
