import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { midSurface } from '../asset/deck';
import { DECK } from '../asset/spec';
import { motionCues } from '../sim/feet';
import { presetById } from '../sim/tricks';
import { ART } from './artDirection';
import { buildMotionCues, cueHeight, pressOutline } from './motionCueGeometry';

const C = ART.motionCues;
const kickflip = presetById('kickflip').inputs;
const shove = presetById('pop-shove-it').inputs;
const tre = presetById('360-flip').inputs;
const ollie = { pop: 0.35, flick: 0, scoop: 0 };

/** Colours present in a geometry, as hex. */
const colours = (g: ReturnType<typeof buildMotionCues>) => {
  const c = g.getAttribute('color');
  const out = new Set<string>();
  for (let i = 0; i < c.count; i++) out.add(new Color(c.getX(i), c.getY(i), c.getZ(i)).getHexString());
  return out;
};

describe('motion cue geometry (DESIGN.md 8.7)', () => {
  it('is one indexed geometry in the trail colours, front and back', () => {
    const g = buildMotionCues(tre);
    expect(g.index).not.toBeNull();
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    const hex = colours(g);
    expect(hex).toEqual(new Set([C.color.front.slice(1), C.color.back.slice(1)]));
    // The same colours as the foot trails, so the Foot motion legend matches both.
    expect(C.color).toEqual(ART.footPaths.color);
    expect(g.index!.count / 3).toBeLessThan(600);
    g.dispose();
  });

  it('lies on the grip, a few millimetres up, never under it', () => {
    for (const inputs of [ollie, kickflip, shove, tre]) {
      const g = buildMotionCues(inputs);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        expect(Number.isFinite(y)).toBe(true);
        expect(y).toBeCloseTo(cueHeight(x, z), 6);
        // Over the realistic deck (inside its outline) the cue is at least `lift` above the grip.
        if (Math.abs(z) < 0.08 && Math.abs(x) < 0.38) {
          expect(y - (midSurface(x, z) + DECK.thickness / 2)).toBeGreaterThanOrEqual(C.lift - 1e-6); // float32 positions
        }
        // And above the primitive board's flat grip.
        expect(y).toBeGreaterThan(ART.board.deck.thickness / 2 + ART.board.deck.skin.thickness + ART.board.primitiveLift);
        // Flat: no cue is more than 6 cm up, even on the kicks.
        expect(y).toBeLessThan(0.06);
      }
      g.dispose();
    }
  });

  it('has the front arrow tip where the feet model says the shoe leaves', () => {
    const g = buildMotionCues(kickflip);
    const p = g.getAttribute('position');
    const tip = motionCues(kickflip).front.at(-1)!;
    let found = false;
    for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - tip.x, p.getZ(i) - tip.z) < 1e-6) found = true;
    expect(found).toBe(true);
    g.dispose();
  });

  it('draws the press outline outside the back sole', () => {
    const spec = motionCues(shove).press;
    const ring = pressOutline(spec);
    const yaw = (spec.yaw * Math.PI) / 180;
    for (const q of ring) {
      // In the shoe's own frame (u along the toe, v across), every point is outside the sole.
      const dx = q.x - spec.x;
      const dz = q.z - spec.z;
      const u = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const v = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      expect(Math.abs(u) > spec.length / 2 || Math.abs(v) > spec.width / 2).toBe(true);
      expect(Math.abs(u)).toBeLessThanOrEqual(spec.length / 2 + C.press.margin + 1e-9);
      expect(Math.abs(v)).toBeLessThanOrEqual(spec.width / 2 + C.press.margin + 1e-9);
    }
  });

  it('mirrors across the board for a regular rider (ADR-25)', () => {
    const g = buildMotionCues(tre);
    const r = buildMotionCues(tre, 'regular');
    const gp = g.getAttribute('position');
    const rp = r.getAttribute('position');
    expect(rp.count).toBe(gp.count);
    // The same vertices with z negated (a ribbon's two edges swap, so compare as sets).
    const r6 = (n: number) => Math.round(n * 1e6) + 0;
    const key = (x: number, y: number, z: number) => `${r6(x)},${r6(y)},${r6(z)}`;
    const mirrored = new Set<string>();
    for (let i = 0; i < gp.count; i++) mirrored.add(key(gp.getX(i), gp.getY(i), -gp.getZ(i)));
    for (let i = 0; i < rp.count; i++) expect(mirrored.has(key(rp.getX(i), rp.getY(i), rp.getZ(i)))).toBe(true);
    g.dispose();
    r.dispose();
  });

  it('draws no scoop for an ollie or a kickflip: only the front arrow and the press outline', () => {
    /** Vertices in the back foot's colour. */
    const backCount = (inputs: typeof ollie) => {
      const c = buildMotionCues(inputs).getAttribute('color');
      const back = new Color(C.color.back);
      let n = 0;
      for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - back.r) < 1e-6 && Math.abs(c.getZ(i) - back.b) < 1e-6) n++;
      return n;
    };
    const outline = 2 * pressOutline(motionCues(ollie).press).length;
    expect(backCount(ollie)).toBe(outline);
    expect(backCount(kickflip)).toBe(outline);
    expect(backCount(shove)).toBeGreaterThan(outline);
  });
});
