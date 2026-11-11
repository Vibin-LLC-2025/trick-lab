import { describe, expect, it } from 'vitest';
import { computeFlight } from '../sim/flight';
import { BOLTS_X, feetPoseAt } from '../sim/feet';
import { presetById } from '../sim/tricks';
import { ART } from './artDirection';
import { buildFootPaths, sampleFootPath, sampleFootPaths } from './footPathGeometry';

const P = ART.footPaths;
const kickflip = presetById('kickflip').inputs;
const shove = presetById('pop-shove-it').inputs;

/** Highest z (furthest toward the heel side, +Z for the goofy rider, ADR-24) up to a fraction of the flight. */
const maxZ = (pts: Float32Array, upTo = 1) => {
  let m = -Infinity;
  const n = Math.round((pts.length / 3 - 1) * upTo);
  for (let i = 0; i <= n; i++) m = Math.max(m, pts[i * 3 + 2]!);
  return m;
};

describe('foot paths (DESIGN.md 8.5)', () => {
  it('start at the stance and, for a landed kickflip, end over the bolts', () => {
    const flight = computeFlight(kickflip);
    const front = sampleFootPath(kickflip, flight, 'front');
    expect(front.length).toBe((P.samples + 1) * 3);
    const stance = feetPoseAt(kickflip, flight, 0).front;
    expect(front[0]).toBeCloseTo(stance.x, 6);
    expect(front[1]).toBeCloseTo(stance.y + P.lift, 6);
    expect(front[2]).toBeCloseTo(stance.z, 6);
    const end = front.length - 3;
    expect(front[end]).toBeCloseTo(BOLTS_X, 3);
    const back = sampleFootPath(kickflip, flight, 'back');
    expect(back[back.length - 3]).toBeCloseTo(-BOLTS_X, 3);
  });

  it('sample both feet in one pass, each point the feet model at its progress', () => {
    const flight = computeFlight(shove);
    for (const stance of ['goofy', 'regular'] as const) {
      const paths = sampleFootPaths(shove, flight, stance, 8);
      for (let i = 0; i <= 8; i++) {
        const pose = feetPoseAt(shove, flight, i / 8, stance);
        for (const foot of ['front', 'back'] as const) {
          expect(paths[foot][i * 3]).toBe(Math.fround(pose[foot].x));
          expect(paths[foot][i * 3 + 1]).toBe(Math.fround(pose[foot].y + P.lift));
          expect(paths[foot][i * 3 + 2]).toBe(Math.fround(pose[foot].z));
        }
      }
    }
  });

  it('show the input: a hard flick takes the front foot further off the heel-side edge than a weak one', () => {
    const weak = { ...kickflip, flick: 0.4 };
    const hard = sampleFootPath(kickflip, computeFlight(kickflip), 'front');
    const soft = sampleFootPath(weak, computeFlight(weak), 'front');
    // Through the flick only: the weak one does not land, so later both feet bail to the heel side.
    expect(maxZ(hard, 0.4)).toBeGreaterThan(maxZ(soft, 0.4) + 0.05);
  });

  it('is one geometry for both feet, with a progress attribute from 0 to 1 and arrowheads where a foot moves', () => {
    const g = buildFootPaths(shove, computeFlight(shove));
    const u = g.getAttribute('aU');
    const color = g.getAttribute('color');
    expect(u).toBeDefined();
    expect(color.count).toBe(u.count);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < u.count; i++) {
      lo = Math.min(lo, u.getX(i));
      hi = Math.max(hi, u.getX(i));
    }
    expect(lo).toBe(0);
    expect(hi).toBe(1);
    const tubeVerts = 2 * (P.samples + 1) * P.tube.radialSegments;
    expect(u.count).toBeGreaterThan(tubeVerts); // the arrowheads add vertices
    const triangles = g.index!.count / 3;
    expect(triangles).toBeLessThan(4000);
    g.dispose();
  });

  it('mirror x for a regular rider (ADR-25): same y and z, the front foot ends over the nose-side bolts at -X', () => {
    const flight = computeFlight(kickflip);
    for (const foot of ['front', 'back'] as const) {
      const g = sampleFootPath(kickflip, flight, foot);
      const r = sampleFootPath(kickflip, flight, foot, 'regular');
      expect(r.length).toBe(g.length);
      for (let i = 0; i < g.length; i += 3) {
        expect(r[i]).toBeCloseTo(-g[i]!, 6);
        expect(r[i + 1]).toBe(g[i + 1]);
        expect(r[i + 2]).toBe(g[i + 2]);
      }
    }
    const front = sampleFootPath(kickflip, flight, 'front', 'regular');
    expect(front[front.length - 3]).toBeCloseTo(-BOLTS_X, 3);
    const gb = buildFootPaths(kickflip, flight);
    const rb = buildFootPaths(kickflip, flight, 'regular');
    expect(rb.getAttribute('position').count).toBe(gb.getAttribute('position').count);
    gb.dispose();
    rb.dispose();
  });

  it('colours the two feet differently', () => {
    const g = buildFootPaths(kickflip, computeFlight(kickflip));
    const c = g.getAttribute('color');
    const first = [c.getX(0), c.getY(0), c.getZ(0)];
    const last = [c.getX(c.count - 1), c.getY(c.count - 1), c.getZ(c.count - 1)];
    expect(first).not.toEqual(last);
    g.dispose();
  });
});
