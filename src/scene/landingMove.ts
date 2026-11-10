// The landing's motion in the scene (step 13, ADR-68): sim/settle.ts says
// where the landing has the board and the rider, in the goofy rest frame;
// this places two groups for it, one round the board and one round the
// shoes, legs and foot trails, mapped for the rider's stance (ADR-10, ADR-25).
// FlightDriver is the only caller, every frame; nothing here allocates.
import { MathUtils, Vector3, type Group, type Matrix4 } from 'three';
import type { Stance } from '../sim/feet';
import type { Settle } from '../sim/settle';
import { ART } from './artDirection';
import type { Footprint } from './groundShadow';

const D2R = MathUtils.DEG2RAD;
const REST_Y = ART.board.restY;

/** The landing's clock, shared by every mount of FlightDriver (a remount mid-landing goes on). Seconds since touchdown. */
export const landingClock = { t: 0, running: false };

/** The nose along world X for a stance: +1 goofy, -1 regular (its base yaw is half a turn). */
export const noseOf = (stance: Stance): 1 | -1 => (ART.stance[stance].baseYaw === 0 ? 1 : -1);

/**
 * Places a pair of groups, `outer` holding `inner` holding the moved
 * content, so the content makes the landing's rigid move: `pitch` (nose up)
 * about the pivot, `yaw` about the vertical through the deck centre... both
 * as the board's own rotation does them, in its stance's frame, then
 * `forward` along the nose and `side` along +Z. Writing it as
 * T(move) T(P) Ry(base + yaw) Rz(pitch) T(-p) Ry(-base), with p the pivot in
 * the board's frame and P where the stance puts it, makes no move exactly the
 * identity, whatever the stance. `still` puts both groups at the identity.
 */
export function placeMove(outer: Group | null, inner: Group | null, s: Settle | null, stance: Stance) {
  if (!outer || !inner) return;
  if (!s) {
    outer.position.set(0, 0, 0);
    outer.rotation.set(0, 0, 0);
    inner.position.set(0, 0, 0);
    inner.rotation.set(0, 0, 0);
    return;
  }
  const k = ART.stance[stance];
  const nose = noseOf(stance);
  const base = k.baseYaw * D2R;
  const py = REST_Y + s.pivotY;
  outer.position.set(s.forward * nose + s.pivotX * nose, py, s.side);
  outer.rotation.set(0, base + s.yaw * k.yawSign * D2R, s.pitch * D2R, 'YZX');
  inner.position.set(-s.pivotX, -py, 0);
  inner.rotation.set(0, -base, 0);
}

const at = new Vector3();

/** Carries a ground footprint by a placed group's world matrix and turn (ADR-38 shadows on Medium and Low). */
export function moveFootprint(f: Footprint, m: Matrix4, turn: number) {
  at.set(f.x, 0, f.z).applyMatrix4(m);
  f.x = at.x;
  f.z = at.z;
  f.yaw += turn;
}

/** The landing's turn about the vertical, radians in the world, for a stance. */
export const moveTurn = (s: Settle, stance: Stance) => s.yaw * ART.stance[stance].yawSign * D2R;
