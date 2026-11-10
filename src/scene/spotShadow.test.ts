import { describe, expect, it } from 'vitest';
import { SPOT_FOOTPRINTS } from '../asset/spotSpec';
import { ART } from './artDirection';
import { geo, mat } from './resources';

// The skate spot's soft shadows (step 14, ADR-69): one draw call for every
// piece, dark at the core, fading to nothing round it, lying on the ground.
describe('the skate spot shadows', () => {
  const g = geo.spotShadow;
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const idx = g.getIndex()!;

  it('is one quad and a soft ring of four per piece, all faced up, just above the ground', () => {
    expect(pos.count).toBe(SPOT_FOOTPRINTS.length * 8);
    expect(idx.count).toBe(SPOT_FOOTPRINTS.length * (2 + 8) * 3);
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(ART.spot.shadow.lift, 9);
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      // y of (b - a) x (c - a): positive faces +Y.
      const ux = pos.getX(b) - pos.getX(a), uz = pos.getZ(b) - pos.getZ(a);
      const vx = pos.getX(c) - pos.getX(a), vz = pos.getZ(c) - pos.getZ(a);
      expect(uz * vx - ux * vz, `triangle ${t / 3}`).toBeGreaterThan(0);
    }
  });

  it('covers each footprint at the core opacity and fades to none at its edge', () => {
    SPOT_FOOTPRINTS.forEach((f, k) => {
      const core = [0, 1, 2, 3].map((i) => k * 8 + i);
      const xs = core.map((i) => pos.getX(i)), zs = core.map((i) => pos.getZ(i));
      expect(Math.min(...xs)).toBeLessThanOrEqual(f.x[0] + 1e-6);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(f.x[1] - 1e-6);
      expect(Math.min(...zs)).toBeLessThanOrEqual(f.z[0] + 1e-6);
      expect(Math.max(...zs)).toBeGreaterThanOrEqual(f.z[1] - 1e-6);
      for (const i of core) expect(col.getW(i)).toBeCloseTo(ART.spot.shadow.opacity, 6);
      for (let i = 4; i < 8; i++) expect(col.getW(k * 8 + i)).toBe(0);
    });
  });

  it('blends over the ground without hiding it, fogged like it', () => {
    expect(mat.spotShadow.transparent).toBe(true);
    expect(mat.spotShadow.depthWrite).toBe(false);
    expect(mat.spotShadow.vertexColors).toBe(true);
    expect(mat.spotShadow.fog).toBe(true);
  });
});
