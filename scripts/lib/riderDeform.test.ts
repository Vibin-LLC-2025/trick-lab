// Measure the fitted rider against the recorded bind mesh in both stances.
// Keep the tee intact and the three reviewed crotch seam edges below 1.7x rest length.
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

  it("keeps the three crotch seam edges below 1.7 times their rest length in both stances", () => {
    for (const { pose, stance, r } of rows.filter((x) => x.panel === 'named')) expect(r.stretchBaseline, `${pose} ${stance}`).toBeLessThan(1.7);
  });
});
