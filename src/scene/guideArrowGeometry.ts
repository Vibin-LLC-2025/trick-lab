// The slider guides (2026-11-10, ADR-82, DESIGN.md 11.5): three arrows round
// the board at rest that show what the sliders will do. Pop is a straight
// arrow up, as tall as the jump; flick an arc round the board's long axis;
// scoop an arc on the ground round the board. Each is a tube with a cone for
// its head, merged into one geometry with a colour per arrow: one draw call.
// In world space at the board's rest pose (the board never leaves the origin:
// the roll moves the ground instead, ADR-67), built only when the sliders or
// the stance change; its owner (GuideArrows.tsx) disposes it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OUTLINE } from '../asset/spec';
import type { Stance } from '../sim/feet';
import type { TrickInputs } from '../sim/flight';
import { ART } from './artDirection';

const G = ART.guides;
const REST_Y = ART.board.restY;
const D2R = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** How far an arc for this rate goes round, in radians: more rate, more sweep, within the limits. */
export const sweepFor = (rate: number) => Math.min(G.sweep.max, Math.max(G.sweep.min, Math.abs(rate) * G.sweep.perRev)) * D2R;

/** A curve given as a function of t in [0, 1]. */
class FnCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly at: (t: number, out: THREE.Vector3) => THREE.Vector3) {
    super();
  }
  override getPoint(t: number, out = new THREE.Vector3()) {
    return this.at(t, out);
  }
}

/** A tube along the curve with a cone at its end, pointing on along the curve, in one colour. */
function arrow(curve: THREE.Curve<THREE.Vector3>, color: string): THREE.BufferGeometry[] {
  const shaft = new THREE.TubeGeometry(curve, G.tubularSegments, G.radius, G.radialSegments, false);
  const end = curve.getPoint(1);
  const dir = curve.getTangent(1).normalize();
  const head = new THREE.ConeGeometry(G.head.radius, G.head.length, G.radialSegments);
  head.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
  head.translate(end.x + (dir.x * G.head.length) / 2, end.y + (dir.y * G.head.length) / 2, end.z + (dir.z * G.head.length) / 2);
  const c = new THREE.Color(color);
  return [shaft, head].map((g) => {
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

/**
 * The guides for these inputs and this stance. The board's nose is at +X when
 * goofy and -X when regular (ADR-25); in the world, a positive flick always
 * rolls the grip toward the heel side (+Z), and a positive scoop always
 * swings the tail toward it (ADR-10, ADR-30), so only the nose's side and the
 * scoop's turn depend on the stance.
 */
export function buildGuideArrows(inputs: TrickInputs, stance: Stance): THREE.BufferGeometry {
  const S = ART.stance[stance];
  const nose = S.yawSign; // +1: nose at +X (goofy); -1: at -X (regular)
  const parts: THREE.BufferGeometry[] = [];

  // Pop: straight up past the tail, from the deck's height at rest to its height at the top of the jump.
  const px = -nose * (-OUTLINE.tailTip + G.pop.gap);
  const from = new THREE.Vector3(px, REST_Y, 0);
  const to = new THREE.Vector3(px, REST_Y + inputs.pop - G.head.length, 0);
  parts.push(...arrow(new THREE.LineCurve3(from, to), G.color.pop));

  // Flick: round the long axis past the nose, from the top, the way the grip rolls (toward +Z for a positive flick).
  if (Math.abs(inputs.flick) >= G.none) {
    const sweep = sweepFor(inputs.flick) * Math.sign(inputs.flick);
    const cx = nose * (OUTLINE.noseTip + G.flick.gap);
    const cy = REST_Y + G.flick.lift;
    parts.push(
      ...arrow(
        new FnCurve((t, out) => {
          const a = t * sweep;
          return out.set(cx, cy + G.flick.radius * Math.cos(a), G.flick.radius * Math.sin(a));
        }),
        G.color.flick,
      ),
    );
  }

  // Scoop: on the ground round the board, from the tail, the way the tail swings (a positive scoop toward +Z).
  if (Math.abs(inputs.scoop) >= G.none) {
    // The world's turn about +Y: the stance's yaw sign carries the board's own turn into it (ADR-25).
    const sweep = sweepFor(inputs.scoop) * Math.sign(inputs.scoop) * S.yawSign;
    const tail = nose > 0 ? Math.PI : 0; // the tail's angle from +X, about +Y
    const r = G.scoop.radius;
    parts.push(
      ...arrow(
        new FnCurve((t, out) => {
          // A turn of a about +Y takes (cos b, 0, -sin b) for angle b from +X.
          const b = tail + t * sweep;
          return out.set(r * Math.cos(b), G.scoop.y, -r * Math.sin(b));
        }),
        G.color.scoop,
      ),
    );
  }

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('mergeGeometries failed for the slider guides');
  merged.name = 'guides';
  return merged;
}
