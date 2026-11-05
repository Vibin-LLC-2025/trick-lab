import { describe, expect, it } from 'vitest';
import { DirectionalLight, Euler, Vector3 } from 'three';
import { FOOT, newFeetPose, writeFeetPose } from '../sim/feet';
import { computeFlight, writePose, type Pose } from '../sim/flight';
import { PRESETS } from '../sim/tricks';
import { ART } from './artDirection';
import {
  alphaAt,
  boardAlphaAt,
  ellipseRadius,
  footDrawnAlpha,
  groundX,
  groundZ,
  newGroundShadows,
  writeGroundShadows,
} from './groundShadow';

const S = ART.shadow;
const L = ART.lights.directional;
const REST_Y = ART.board.restY;
const rest = (): Pose => ({ y: 0, roll: 0, yaw: 0, pitch: 0 });

/** three's own direction for the key light: from its position to its target. */
function lightDirection() {
  const light = new DirectionalLight();
  light.position.set(...L.position);
  light.target.position.set(...L.target);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  return new Vector3().setFromMatrixPosition(light.target.matrixWorld).sub(new Vector3().setFromMatrixPosition(light.matrixWorld)).normalize();
}


describe('ground shadows on Medium and Low (ADR-38)', () => {
  it('projects along the same ray as the High key light: a point and its ground spot lie on one light ray', () => {
    const d = lightDirection();
    expect(d.y).toBeLessThan(0);
    for (const p of [new Vector3(0, 0.6, 0), new Vector3(0.2, 0.3, -0.1), new Vector3(-0.3, 1.1, 0.25)]) {
      const ground = new Vector3(groundX(p.x, p.y), 0, groundZ(p.z, p.y));
      const along = ground.clone().sub(p).normalize();
      expect(along.angleTo(d)).toBeLessThan(1e-9);
    }
    // A point on the pad is its own shadow.
    expect(groundX(0.3, 0)).toBe(0.3);
    expect(groundZ(-0.2, 0)).toBe(-0.2);
  });

  it('moves the board footprint along the light as the board rises, instead of keeping it at x z 0', () => {
    const out = newGroundShadows();
    const atRest = { ...writeGroundShadows(out, rest(), 0, null).board };
    const high = { ...writeGroundShadows(out, { ...rest(), y: 0.6 }, 0, null).board };
    expect(atRest.x).toBeCloseTo(groundX(0, REST_Y), 12);
    expect(atRest.z).toBeCloseTo(groundZ(0, REST_Y), 12);
    expect(Math.hypot(high.x - atRest.x, high.z - atRest.z)).toBeGreaterThan(0.1);
    // Toward the viewer (+Z) and away from the light's +X, as the key light sits behind and to the right.
    expect(high.z).toBeGreaterThan(atRest.z);
    expect(high.x).toBeLessThan(atRest.x);
  });

  it('fades and broadens with height, and the contact shadow is only near the ground', () => {
    const out = newGroundShadows();
    const at = (y: number) => {
      writeGroundShadows(out, { ...rest(), y }, 0, null);
      return { board: { ...out.board }, contact: { ...out.contact } };
    };
    const r = at(0);
    const low = at(S.contact.height);
    const top = at(S.topHeight);
    expect(r.board.opacity).toBeCloseTo(S.opacity.ground, 12);
    expect(top.board.opacity).toBeCloseTo(S.opacity.top, 12);
    expect(top.board.halfLength).toBeGreaterThan(r.board.halfLength);
    expect(top.board.halfWidth).toBeGreaterThan(r.board.halfWidth);
    expect(r.contact.opacity).toBeCloseTo(S.contact.opacity, 12);
    expect(r.contact.halfLength).toBeLessThan(r.board.halfLength);
    expect(low.contact.opacity).toBe(0);
    expect(top.contact.opacity).toBe(0);
    // At rest the darkest point (both components at the core) is as dark as the old disc's core, 0.5.
    const darkest = 1 - (1 - r.board.opacity) * (1 - r.contact.opacity);
    expect(darkest).toBeGreaterThan(0.45);
    expect(darkest).toBeLessThan(0.55);
  });

  it('still turns with the yaw, shortens with pitch and narrows on edge', () => {
    const out = newGroundShadows();
    const flat = { ...writeGroundShadows(out, rest(), 0.7, null).board };
    expect(flat.yaw).toBe(0.7);
    const nose = { ...writeGroundShadows(out, { ...rest(), pitch: 60 }, 0, null).board };
    expect(nose.halfLength).toBeCloseTo(S.halfLength * 0.5, 9);
    const edge = { ...writeGroundShadows(out, { ...rest(), roll: 90 }, 0, null).board };
    expect(edge.halfWidth).toBeCloseTo(S.halfWidth * S.edgeWidth, 9);
  });

  it('gives each shoe a footprint from its sole centre, FOOT-sized and turned by its yaw, only with the feet', () => {
    const out = newGroundShadows();
    const feet = newFeetPose();
    const inputs = PRESETS.find((p) => p.id === 'kickflip')!.inputs;
    writeFeetPose(feet, inputs, null, 0);
    writeGroundShadows(out, rest(), 0, feet);
    for (const [fp, f] of [
      [out.front, feet.front],
      [out.back, feet.back],
    ] as const) {
      const h = REST_Y + f.y;
      expect(fp.x).toBeCloseTo(groundX(f.x, h), 12);
      expect(fp.z).toBeCloseTo(groundZ(f.z, h), 12);
      expect(fp.yaw).toBeCloseTo((f.yaw * Math.PI) / 180, 12);
      expect(fp.halfLength).toBeGreaterThanOrEqual(FOOT.length / 2);
      expect(fp.halfWidth).toBeGreaterThanOrEqual(FOOT.width / 2);
      expect(fp.halfLength).toBeGreaterThan(fp.halfWidth);
      expect(fp.opacity).toBeGreaterThan(0);
    }
    // The ellipse's long axis is the shoe's toe direction (three's Y rotation, as on the shoe group).
    const toe = new Vector3(1, 0, 0).applyEuler(new Euler(0, out.front.yaw, 0));
    const tip = { x: out.front.x + toe.x * out.front.halfLength, z: out.front.z + toe.z * out.front.halfLength };
    expect(ellipseRadius(out.front, tip.x, tip.z)).toBeCloseTo(1, 9);
    // Hidden feet: no footprints.
    writeGroundShadows(out, rest(), 0, null);
    expect(out.front.opacity).toBe(0);
    expect(out.back.opacity).toBe(0);
  });

  it('reads as one shadow: blended over the board, each foot gives max(board, foot), never the two stacked', () => {
    const out = newGroundShadows();
    const feet = newFeetPose();
    let overlapped = 0;
    for (const preset of PRESETS) {
      const flight = computeFlight(preset.inputs);
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        writeFeetPose(feet, preset.inputs, flight, u);
        writeGroundShadows(out, writePose(rest(), flight, u), 0, feet);
        for (let x = -0.7; x <= 0.7; x += 0.025)
          for (let z = -0.5; z <= 0.7; z += 0.025) {
            const board = boardAlphaAt(out, x, z);
            const front = alphaAt(out.front, x, z);
            const back = alphaAt(out.back, x, z);
            // What the pad shows: the board, then each foot's drawn alpha over it (normal blending).
            const shown = 1 - (1 - board) * (1 - footDrawnAlpha(out, out.front, x, z)) * (1 - footDrawnAlpha(out, out.back, x, z));
            // The two feet never overlap each other, so the union is exactly the darkest part.
            if (front > 0 && back > 0) throw new Error('feet overlap');
            expect(shown).toBeCloseTo(Math.max(board, front, back), 9);
            expect(shown).toBeLessThanOrEqual(0.55);
            if (board > 0.05 && Math.max(front, back) > 0.05) overlapped++;
          }
      }
    }
    // The case it exists for does happen (the shoes stand over the board's shadow).
    expect(overlapped).toBeGreaterThan(1000);
  });

  it('writes into the same objects every time (no allocation in the frame loop)', () => {
    const out = newGroundShadows();
    const parts = [out.board, out.contact, out.front, out.back];
    const feet = newFeetPose();
    expect(writeGroundShadows(out, { ...rest(), y: 0.3 }, 1, feet)).toBe(out);
    expect([out.board, out.contact, out.front, out.back]).toEqual(parts);
    parts.forEach((p, i) => expect([out.board, out.contact, out.front, out.back][i]).toBe(p));
  });
});
