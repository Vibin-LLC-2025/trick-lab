// The deformation probe (riderDeform.ts, ADR-101). Not acceptance: today's crotch numbers are a bad baseline
// (docs/research/2026-11-13-rider-deform.md). These checks keep the probe honest (it measures the real source in the
// real poses, against the fixed baseline of the source as reviewed) and keep what was fixed fixed: the tee's hem stays
// whole in every pose, and the crotch's named edges get no worse than the baseline recorded on 2026-11-13.
import { beforeAll, describe, expect, it } from 'vitest';
import { fitSource, measure, NAMED_EDGES, probePoses, readBaseline } from './riderDeform';

type Rows = ReturnType<typeof measure>;

describe('the High rider deformation probe (ADR-101)', () => {
  let rows: Rows;
  beforeAll(async () => {
    rows = measure(await fitSource(), readBaseline(), probePoses());
  });

  it('measures every pose in both stances against the reviewed source', () => {
    const base = readBaseline();
    expect(base.source).toContain('9d4d2eaf995f23e7eeac5dd51369bf4bad473b6b587312bf7f8ad4ef6f541466');
    for (const [a, b] of NAMED_EDGES) {
      expect(base.positions[String(a)]).toBeDefined();
      expect(base.positions[String(b)]).toBeDefined();
    }
    expect(new Set(rows.map((r) => `${r.pose} ${r.stance}`)).size).toBe(14);
    for (const r of rows) expect(r.r.edges).toBeGreaterThan(0);
  });

  it("keeps the tee's hem whole in every pose: no edge stretched past 1.5 or squashed under 0.5, no triangle collapsed", () => {
    // Before ADR-101 (the band inside out): up to 3.04 and 0.12, triangles down to 3 percent of their area.
    for (const { pose, stance, r } of rows.filter((x) => x.panel === 'hem')) {
      expect(r.stretch, `${pose} ${stance}`).toBeLessThan(1.5);
      expect(r.compress, `${pose} ${stance}`).toBeGreaterThan(0.5);
      expect(r.collapse, `${pose} ${stance}`).toBeGreaterThan(0.45);
      // A rough count (nearest trouser point, outward from the pelvis): up to 41 before, up to 21 now.
      expect(r.inside, `${pose} ${stance}`).toBeLessThanOrEqual(25);
    }
  });

  it("gets the crotch's three named edges no worse than the bad baseline (3.79 at the tuck, 2026-11-13)", () => {
    for (const { pose, stance, r } of rows.filter((x) => x.panel === 'named')) expect(r.stretchBaseline, `${pose} ${stance}`).toBeLessThan(3.8);
  });
});
