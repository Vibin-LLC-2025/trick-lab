// The slider guides (ADR-82): their shape follows the sliders, and each
// arrow points the way the board will go, for both stances.
import { describe, expect, it } from 'vitest';
import tokens from '../styles/tokens.css?raw';
import { Color, type BufferGeometry } from 'three';
import { OUTLINE } from '../asset/spec';
import { createTrickStore, guidesShown } from '../store';
import { ART } from './artDirection';
import { buildGuideArrows, sweepFor } from './guideArrowGeometry';

const G = ART.guides;
const REST_Y = ART.board.restY;

/** The vertices of one arrow, picked out by its colour. */
function pointsOf(geo: BufferGeometry, color: string) {
  const c = new Color(color);
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const out: [number, number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(col.getX(i) - c.r) < 1e-6 && Math.abs(col.getY(i) - c.g) < 1e-6 && Math.abs(col.getZ(i) - c.b) < 1e-6) out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
}

const max = (pts: [number, number, number][], i: 0 | 1 | 2) => Math.max(...pts.map((p) => p[i]));
const min = (pts: [number, number, number][], i: 0 | 1 | 2) => Math.min(...pts.map((p) => p[i]));

describe('the slider guides (ADR-82)', () => {
  it('are one geometry with a colour per arrow, and no arrow for a flick or a scoop of nothing', () => {
    const all = buildGuideArrows({ pop: 0.35, flick: 1.9, scoop: 1.0 }, 'goofy');
    expect(all.getAttribute('color')).toBeDefined();
    expect(all.getAttribute('uv')).toBeUndefined();
    for (const c of Object.values(G.color)) expect(pointsOf(all, c).length).toBeGreaterThan(0);
    const popOnly = buildGuideArrows({ pop: 0.35, flick: 0, scoop: 0 }, 'goofy');
    expect(pointsOf(popOnly, G.color.flick)).toHaveLength(0);
    expect(pointsOf(popOnly, G.color.scoop)).toHaveLength(0);
    expect(pointsOf(popOnly, G.color.pop).length).toBeGreaterThan(0);
  });

  it('draw pop past the tail, from the deck at rest to its height at the top of the jump', () => {
    for (const pop of [0.15, 0.35, 0.6]) {
      const pts = pointsOf(buildGuideArrows({ pop, flick: 0, scoop: 0 }, 'goofy'), G.color.pop);
      expect(max(pts, 1)).toBeCloseTo(REST_Y + pop, 6);
      expect(min(pts, 1)).toBeLessThan(REST_Y + 0.001);
      // Past the tail: -X when goofy, +X when regular (ADR-25).
      expect(max(pts, 0)).toBeLessThan(OUTLINE.tailTip);
      expect(min(pointsOf(buildGuideArrows({ pop, flick: 0, scoop: 0 }, 'regular'), G.color.pop), 0)).toBeGreaterThan(-OUTLINE.tailTip);
    }
  });

  it('turn the flick arc the way the grip rolls: toward the heel side (+Z) for a kickflip, the toe side for a heelflip, in either stance', () => {
    for (const stance of ['goofy', 'regular'] as const) {
      const kick = pointsOf(buildGuideArrows({ pop: 0.35, flick: 0.5, scoop: 0 }, stance), G.color.flick);
      const heel = pointsOf(buildGuideArrows({ pop: 0.35, flick: -0.5, scoop: 0 }, stance), G.color.flick);
      // A short arc from the top: it leans one way only.
      expect(min(kick, 2)).toBeGreaterThan(-2 * G.radius);
      expect(max(kick, 2)).toBeGreaterThan(0.03);
      expect(max(heel, 2)).toBeLessThan(2 * G.radius);
      expect(min(heel, 2)).toBeLessThan(-0.03);
      // Past the nose.
      const x = kick[0]![0];
      expect(stance === 'goofy' ? x : -x).toBeGreaterThan(OUTLINE.noseTip);
    }
  });

  it('swing the scoop arc from the tail the way the tail goes: toward the heel side (+Z) for backside, the toe side for frontside, in either stance', () => {
    for (const stance of ['goofy', 'regular'] as const) {
      const back = pointsOf(buildGuideArrows({ pop: 0.35, flick: 0, scoop: 0.5 }, stance), G.color.scoop);
      const front = pointsOf(buildGuideArrows({ pop: 0.35, flick: 0, scoop: -0.5 }, stance), G.color.scoop);
      expect(min(back, 2)).toBeGreaterThan(-2 * G.radius);
      expect(max(back, 2)).toBeGreaterThan(0.05);
      expect(max(front, 2)).toBeLessThan(2 * G.radius);
      expect(min(front, 2)).toBeLessThan(-0.05);
      // On the ground, outside the board.
      expect(max(back, 1)).toBeLessThan(G.scoop.y + G.head.radius + 1e-6);
      expect(G.scoop.radius - G.radius).toBeGreaterThan(OUTLINE.noseTip);
    }
  });

  it('sweep further the faster the rate, within their limits', () => {
    expect(sweepFor(0.1)).toBeCloseTo((G.sweep.min * Math.PI) / 180, 9);
    expect(sweepFor(1)).toBeLessThan(sweepFor(2));
    expect(sweepFor(-2)).toBe(sweepFor(2));
    expect(sweepFor(3)).toBeCloseTo((Math.min(G.sweep.max, 3 * G.sweep.perRev) * Math.PI) / 180, 9);
    expect(sweepFor(4.2)).toBeLessThanOrEqual((G.sweep.max * Math.PI) / 180);
  });

  it('match the swatches by the sliders: each colour equals its --guide-* token', () => {
    const token = (name: string) => new RegExp(`--guide-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1]?.toLowerCase();
    expect(token('pop')).toBe(G.color.pop);
    expect(token('flick')).toBe(G.color.flick);
    expect(token('scoop')).toBe(G.color.scoop);
  });

  it("show on the player's turn in a game, before the pop, on Medium and High only", () => {
    const s = createTrickStore(
      () => 0,
      () => 0.25,
      () => '2026-11-10',
    );
    s.setState({ skateTaught: true, quality: 'high' });
    expect(guidesShown(s.getState())).toBe(false);
    s.getState().setScreen('skate');
    expect(guidesShown(s.getState())).toBe(false);
    s.getState().setPopMode('exact');
    s.getState().startSkate();
    expect(guidesShown(s.getState())).toBe(true);
    s.setState({ quality: 'low' });
    expect(guidesShown(s.getState())).toBe(false);
    s.setState({ quality: 'medium' });
    expect(guidesShown(s.getState())).toBe(true);
    s.getState().continueSkate();
    s.getState().callSkateTrick('kickflip');
    s.getState().setInput('flick', 1.9);
    s.getState().pressPop();
    // In the air, and after it until Continue clears the stage: the flight shows, not the plan.
    expect(guidesShown(s.getState())).toBe(false);
    s.getState().land();
    expect(guidesShown(s.getState())).toBe(false);
    // The computer copies next: its turn has none.
    s.getState().rollRested();
    s.getState().landingDone();
    s.getState().endReplay();
    s.getState().continueSkate();
    expect(s.getState().skate.phase).toBe('computer-copy');
    expect(guidesShown(s.getState())).toBe(false);
  });
});
