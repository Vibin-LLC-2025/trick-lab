// Motion cues (2026-11-04, ADR-26, DESIGN.md 8.7): flat arrows on the grip
// that show how each shoe will move against the deck for the current inputs.
// The description (which way, how far) is pure and lives in the feet model
// (motionCues in src/sim/feet.ts); this file turns it into one three.js
// geometry draped on the deck: a ribbon with an arrowhead for the front shoe's
// slide and flick, an outline around the back shoe for the pop press, and a
// swept ribbon with an arrowhead for the scoop.
//
// One geometry, one draw call: per-vertex colour says which foot. It lives in
// the board group's own frame (origin at the deck centre, nose +X), so the
// cues ride with the deck. Built only when the inputs, the flight or the
// stance change; its owner (MotionCues.tsx) disposes it.
import * as THREE from 'three';
import { halfWidth, midSurface } from '../asset/deck';
import { DECK, OUTLINE } from '../asset/spec';
import { primitiveDeckTop } from '../sim/boardVolume';
import { motionCues, type CuePoint, type MotionCueSpec, type Stance } from '../sim/feet';
import type { TrickInputs } from '../sim/flight';
import { ART } from './artDirection';

const C = ART.motionCues;

/** Grip top of the realistic board at (x, z); off the outline it keeps the edge's height. */
function glbGripTop(x: number, z: number) {
  const xc = Math.min(OUTLINE.noseTip, Math.max(OUTLINE.tailTip, x));
  const w = halfWidth(xc);
  const zc = Math.min(w, Math.max(-w, z));
  return midSurface(xc, zc) + DECK.thickness / 2;
}

/**
 * Height of a cue point: the deck top the feet stand on, plus `lift`. That is
 * the sim's rule (src/sim/boardVolume.ts deckTop): the higher of the real
 * deck's grip and the legacy primitive deck it keeps pinned, so the cues meet
 * the soles. Since ADR-54 the drawn primitive is the real deck, at most 1 cm
 * under that, which the shoes already stand above.
 */
export const cueHeight = (x: number, z: number) => Math.max(glbGripTop(x, z), primitiveDeckTop(x)) + C.lift;

/** Collected triangles: positions, colours, index. */
class Builder {
  pos: number[] = [];
  col: number[] = [];
  index: number[] = [];

  vertex(x: number, z: number, c: THREE.Color) {
    this.pos.push(x, cueHeight(x, z), z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }

  /** A flat ribbon along the points, `width` wide; closed joins the last point back to the first. */
  ribbon(pts: readonly CuePoint[], width: number, c: THREE.Color, closed = false) {
    const n = pts.length;
    if (n < 2) return;
    const first = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
      const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      // Left of the direction of travel, seen from above (+Y): (tz, -tx).
      const p = pts[i]!;
      this.vertex(p.x + (tz * width) / 2, p.z - (tx * width) / 2, c);
      this.vertex(p.x - (tz * width) / 2, p.z + (tx * width) / 2, c);
    }
    const segments = closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const a = first + i * 2;
      const b = first + ((i + 1) % n) * 2;
      this.index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  /** An arrowhead, base centred at `from`, tip `length` along the unit direction (dx, dz). */
  head(from: CuePoint, dx: number, dz: number, c: THREE.Color) {
    const L = C.head.length;
    const W = C.head.width / 2;
    const a = this.vertex(from.x + dz * W, from.z - dx * W, c);
    const b = this.vertex(from.x - dz * W, from.z + dx * W, c);
    const tip = this.vertex(from.x + dx * L, from.z + dz * L, c);
    this.index.push(a, b, tip);
  }

  /** A ribbon that ends in an arrowhead whose tip is the path's last point. */
  arrow(pts: readonly CuePoint[], c: THREE.Color) {
    const n = pts.length;
    if (n < 2) return;
    const tip = pts[n - 1]!;
    // Walk back from the tip until the head's length is used up.
    let i = n - 2;
    while (i > 0 && Math.hypot(pts[i]!.x - tip.x, pts[i]!.z - tip.z) < C.head.length) i--;
    const back = pts[i]!;
    const span = Math.hypot(tip.x - back.x, tip.z - back.z);
    if (span < 1e-6) return;
    const dx = (tip.x - back.x) / span;
    const dz = (tip.z - back.z) / span;
    const base = { x: tip.x - dx * C.head.length, z: tip.z - dz * C.head.length };
    // The shaft runs to the head's base (a short path is a head alone).
    if (i > 0 || span > C.head.length) this.ribbon([...pts.slice(0, i + 1), base], C.width, c);
    this.head(base, dx, dz, c);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.index);
    return g;
  }
}

/**
 * The outline around a sole footprint: a rounded rectangle `margin` outside
 * the sole, as a closed loop of points in the board's frame. Toe direction
 * (cos yaw, -sin yaw), as in FootPose.
 */
export function pressOutline(press: MotionCueSpec['press']): CuePoint[] {
  const hl = press.length / 2 + C.press.margin;
  const hw = press.width / 2 + C.press.margin;
  const r = hw * C.press.corner;
  const yaw = (press.yaw * Math.PI) / 180;
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);
  const pts: CuePoint[] = [];
  const corners: readonly (readonly [number, number])[] = [
    [hl - r, hw - r],
    [-(hl - r), hw - r],
    [-(hl - r), -(hw - r)],
    [hl - r, -(hw - r)],
  ];
  corners.forEach(([cu, cv], k) => {
    for (let j = 0; j <= C.cornerSegments; j++) {
      const a = ((k + j / C.cornerSegments) * Math.PI) / 2;
      const u = cu + Math.cos(a) * r;
      const v = cv + Math.sin(a) * r;
      // v is across the shoe: (sin yaw, cos yaw), a quarter turn from the toe.
      pts.push({ x: press.x + u * ux - v * uz, z: press.z + u * uz + v * ux });
    }
  });
  return pts;
}

/**
 * The cues for these inputs as one geometry in the board's own frame:
 * the front arrow (front colour), then the press outline and the scoop
 * arrow (back colour). `stance` mirrors them for a regular rider (ADR-25).
 */
export function buildMotionCues(inputs: TrickInputs, stance: Stance = 'goofy'): THREE.BufferGeometry {
  const spec = motionCues(inputs, stance, C.samples);
  const front = new THREE.Color(C.color.front);
  const back = new THREE.Color(C.color.back);
  const b = new Builder();
  b.arrow(spec.front, front);
  b.ribbon(pressOutline(spec.press), C.press.width, back, true);
  b.arrow(spec.scoop, back);
  return b.geometry();
}
