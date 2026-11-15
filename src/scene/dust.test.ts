import { describe, expect, it } from 'vitest';
import { WHEEL } from '../asset/spec';
import { SETTLE } from '../sim/settle';
import { ART } from './artDirection';
import { DUST_PUFFS, PUFF_VERTICES, TOUCHDOWN_PUFFS, dustNoise, newDust, puffAge, puffOpacity, puffRadius, spawnDust, stepDust, writeDust } from './dust';
import { geo, mat } from './resources';
import { dustShown } from './sceneTier';

const D = ART.dust;
/** A camera looking down -Z with no turn: right is +X, up is +Y. */
const CAMERA = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const arrays = () => ({ pos: new Float32Array(DUST_PUFFS * PUFF_VERTICES * 3), col: new Float32Array(DUST_PUFFS * PUFF_VERTICES * 4) });
/** The centre of puff `i` in a positions array. */
const centre = (pos: Float32Array, i: number) => [pos[i * PUFF_VERTICES * 3]!, pos[i * PUFF_VERTICES * 3 + 1]!, pos[i * PUFF_VERTICES * 3 + 2]!] as const;
const alpha = (col: Float32Array, i: number) => col[i * PUFF_VERTICES * 4 + 3]!;

describe('dust (step 19, ADR-74)', () => {
  it('is one geometry and one material: a fan per puff, the alpha in the vertex colour', () => {
    const position = geo.dust.getAttribute('position');
    const color = geo.dust.getAttribute('color');
    expect(position.count).toBe(DUST_PUFFS * PUFF_VERTICES);
    expect(color.itemSize).toBe(4);
    expect(geo.dust.getIndex()!.count).toBe(DUST_PUFFS * D.segments * 3);
    expect(geo.dust.groups).toHaveLength(0);
    expect(mat.dust.transparent).toBe(true);
    expect(mat.dust.depthWrite).toBe(false);
    expect(mat.dust.vertexColors).toBe(true);
    // Nothing is in the air until a landing: every vertex is written see-through.
    for (let i = 0; i < color.count; i++) expect(color.getW(i)).toBe(0);
  });

  it('starts a clean landing as puffs at the four wheels, whichever way the board landed', () => {
    for (const yaw of [0, Math.PI, Math.PI / 2, 0.3]) {
      const d = newDust();
      spawnDust(d, yaw, 'clean', 7);
      expect(d.live).toBe(true);
      expect(d.pending).toBe(false);
      expect(d.slides).toBe(false);
      for (let i = 0; i < TOUCHDOWN_PUFFS; i++) {
        // Every puff starts at a wheel: the axle's distance from the centre, turned with the board.
        expect(Math.hypot(d.x[i]!, d.z[i]!)).toBeCloseTo(Math.hypot(WHEEL.centerX, WHEEL.centerZ), 6);
        const along = d.x[i]! * Math.cos(yaw) - d.z[i]! * Math.sin(yaw);
        expect(Math.abs(along)).toBeCloseTo(WHEEL.centerX, 6);
        // And drifts out to its own side of the board.
        const across = d.x[i]! * Math.sin(yaw) + d.z[i]! * Math.cos(yaw);
        const drift = d.vx[i]! * Math.sin(yaw) + d.vz[i]! * Math.cos(yaw);
        expect(Math.sign(drift)).toBe(Math.sign(across));
      }
    }
  });

  it('kicks up more for a sketchy landing and a bail than for a clean one', () => {
    const size = (grade: 'clean' | 'sketchy' | 'bail') => {
      const d = newDust();
      spawnDust(d, 0, grade, 0);
      return d.size[0]!;
    };
    expect(size('sketchy')).toBeCloseTo(size('clean') * D.touchdown.sketchy, 6);
    expect(size('bail')).toBeCloseTo(size('clean') * D.touchdown.bail, 6);
  });

  it('is gone within the puffs\' life, and says so', () => {
    const d = newDust();
    spawnDust(d, 0, 'clean', 0);
    const { pos, col } = arrays();
    let t = 0;
    let alive = true;
    while (alive && t < 5) {
      alive = stepDust(d, 1 / 60, 0, 0, 1, 0);
      t += 1 / 60;
    }
    expect(alive).toBe(false);
    expect(d.live).toBe(false);
    expect(t).toBeLessThanOrEqual(D.touchdown.life + 1 / 30);
    // Shorter than the shortest roll-out that follows a pop (a flight's airtime of pushing, slowed at the roll's rate), so the frames outlast it.
    expect(D.touchdown.life).toBeLessThan(0.8);
    writeDust(d, pos, col, CAMERA, 0, 1);
    for (let i = 0; i < DUST_PUFFS; i++) expect(alpha(col, i)).toBe(0);
  });

  it('draws each puff as a soft disc facing the camera, resting on the ground', () => {
    const d = newDust();
    spawnDust(d, 0, 'clean', 0);
    stepDust(d, 0.2, 0, 0, 1, 0);
    const { pos, col } = arrays();
    // A camera turned a quarter about Y: right is -Z, up is +Y.
    const turned = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
    writeDust(d, pos, col, turned, 0, 1);
    for (let i = 0; i < TOUCHDOWN_PUFFS; i++) {
      const [cx, cy, cz] = centre(pos, i);
      const r = puffRadius(puffAge(d, i), D.touchdown.radius) * d.size[i]!;
      expect(alpha(col, i)).toBeGreaterThan(0);
      expect(alpha(col, i)).toBeLessThanOrEqual(D.opacity);
      expect(cy).toBeGreaterThan(0);
      for (let j = 1; j < PUFF_VERTICES; j++) {
        const p = (i * PUFF_VERTICES + j) * 3;
        // In the camera's plane (no depth along its view, the world's X here), r from the centre, see-through at the rim.
        expect(pos[p]!).toBeCloseTo(cx, 6);
        expect(Math.hypot(pos[p + 1]! - cy, pos[p + 2]! - cz)).toBeCloseTo(r, 6);
        expect(col[(i * PUFF_VERTICES + j) * 4 + 3]).toBe(0);
        // Never under the ground by more than the part of the disc below its centre.
        expect(pos[p + 1]!).toBeGreaterThanOrEqual(cy - r - 1e-6);
      }
    }
    // The slide's puffs are not used by a clean landing.
    for (let i = TOUCHDOWN_PUFFS; i < DUST_PUFFS; i++) expect(alpha(col, i)).toBe(0);
  });

  it('falls behind as the ground rolls on, the way the nose points', () => {
    const { pos, col } = arrays();
    const still = arrays();
    for (const nose of [1, -1] as const) {
      const d = newDust();
      spawnDust(d, 0, 'clean', 10);
      stepDust(d, 0.1, 0, 0, nose, 10.2);
      writeDust(d, still.pos, still.col, CAMERA, 10, nose);
      writeDust(d, pos, col, CAMERA, 10.2, nose);
      for (let i = 0; i < TOUCHDOWN_PUFFS; i++) expect(centre(pos, i)[0]).toBeCloseTo(centre(still.pos, i)[0] - nose * 0.2, 5);
    }
  });

  it('trails a bailed board while it slides: each puff is born behind the board where it is then, and stays there', () => {
    const d = newDust();
    spawnDust(d, 0, 'bail', 0);
    expect(d.slides).toBe(true);
    const { pos, col } = arrays();
    const first = TOUCHDOWN_PUFFS;
    const last = DUST_PUFFS - 1;
    // Nothing of the slide at touchdown.
    writeDust(d, pos, col, CAMERA, 0, 1);
    expect(alpha(col, first)).toBe(0);
    // Step through the slide with the board moving along +X.
    const where: number[] = [];
    let t = 0;
    let seen = 0;
    while (stepDust(d, 1 / 60, t * 0.5, 0, 1, 0)) {
      t += 1 / 60;
      for (let i = first; i <= last; i++) if (d.placed[i] && where[i] === undefined) where[i] = t * 0.5;
      writeDust(d, pos, col, CAMERA, 0, 1);
      for (let i = first; i <= last; i++) if (alpha(col, i) > 0) seen++;
    }
    expect(seen).toBeGreaterThan(0);
    for (let i = first; i <= last; i++) {
      expect(d.placed[i]).toBe(1);
      // At the trailing end of the board where it was when the puff was born (within a frame's travel).
      const behind = where[i]! - d.x[i]!;
      expect(behind).toBeGreaterThanOrEqual(D.slide.behind[0] - 0.01);
      expect(behind).toBeLessThanOrEqual(D.slide.behind[1] + 0.01);
      expect(Math.abs(d.z[i]!)).toBeLessThanOrEqual(D.slide.across + 1e-6);
    }
    // A regular rider's board slides the other way, and its trail is behind it that way.
    const other = newDust();
    spawnDust(other, 0, 'bail', 0);
    stepDust(other, 0.1, -0.05, 0, -1, 0);
    expect(other.placed[first]).toBe(1);
    expect(other.x[first]! + 0.05).toBeGreaterThanOrEqual(D.slide.behind[0]);
    // A crooked board is kicked along its own length, away from the feet (ADR-92): its trail is behind it that way too.
    const crooked = newDust();
    spawnDust(crooked, 0, 'bail', 0);
    const [bx, bz] = [0.06, -0.08];
    stepDust(crooked, 0.1, bx, bz, 1, 0);
    expect(crooked.placed[first]).toBe(1);
    const [ux, uz] = [0.6, -0.8];
    const back = (bx - crooked.x[first]!) * ux + (bz - crooked.z[first]!) * uz;
    const side = (crooked.x[first]! - bx) * -uz + (crooked.z[first]! - bz) * ux;
    expect(back).toBeGreaterThanOrEqual(D.slide.behind[0] - 1e-9);
    expect(back).toBeLessThanOrEqual(D.slide.behind[1] + 1e-9);
    expect(Math.abs(side)).toBeLessThanOrEqual(D.slide.across + 1e-9);
    // Later puffs are born further along.
    expect(where[last]!).toBeGreaterThan(where[first]!);
    // All of it is over before the landing has played out, so its frames cover the dust.
    expect(D.slide.until * SETTLE.bail.slideS + D.slide.life).toBeLessThanOrEqual(SETTLE.bail.slideS);
    expect(t).toBeLessThanOrEqual(SETTLE.bail.slideS + 1 / 30);
  });

  it('fades in, thins out and swells, and is the same every time', () => {
    expect(puffOpacity(0)).toBe(0);
    expect(puffOpacity(1)).toBe(0);
    expect(puffOpacity(D.fadeIn)).toBeGreaterThan(puffOpacity(0.6));
    expect(puffRadius(0, [1, 3])).toBe(1);
    expect(puffRadius(1, [1, 3])).toBe(3);
    expect(puffRadius(0.5, [1, 3])).toBeGreaterThan(2);
    for (let i = 0; i < 40; i++) {
      const n = dustNoise(i, 2);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(dustNoise(i, 2)).toBe(n);
    }
    const a = newDust();
    const b = newDust();
    spawnDust(a, 0.4, 'sketchy', 3);
    spawnDust(b, 0.4, 'sketchy', 3);
    expect(Array.from(a.vx)).toEqual(Array.from(b.vx));
  });

  it('keeps its arrays: a second landing writes into the same ones', () => {
    const d = newDust();
    const { x, born, placed } = d;
    spawnDust(d, 0, 'bail', 0);
    stepDust(d, 0.5, 0.2, 0, 1, 0);
    spawnDust(d, 1, 'clean', 4);
    expect(d.x).toBe(x);
    expect(d.born).toBe(born);
    expect(d.placed).toBe(placed);
    expect(d.t).toBe(0);
    expect(d.slides).toBe(false);
  });

  it('shows on the game screen on Medium and High, whatever the lab Motion cues switch (ADR-86), never under reduced motion', () => {
    const on = { screen: 'skate', quality: 'high', boardAssetFailed: false, reducedMotion: false } as const;
    expect(dustShown(on)).toBe(true);
    expect(dustShown({ ...on, quality: 'medium' })).toBe(true);
    expect(dustShown({ ...on, quality: 'low' })).toBe(false);
    // A model that failed sends the scene to Low (ADR-16).
    expect(dustShown({ ...on, boardAssetFailed: true })).toBe(false);
    expect(dustShown({ ...on, screen: 'lab' })).toBe(false);
    expect(dustShown({ ...on, screen: 'home' })).toBe(false);
    // The switch is the lab's; the game screen has no control for it.
    expect(dustShown({ ...on, motionCuesVisible: false } as typeof on)).toBe(true);
    expect(dustShown({ ...on, reducedMotion: true })).toBe(false);
  });
});
