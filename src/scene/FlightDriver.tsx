import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group, type Mesh } from 'three';
import { newFeetPose, writeFeetPose, type FeetPose, type FootPose } from '../sim/feet';
import { writePose, type Pose } from '../sim/flight';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { Board } from './Board';
import { setBoardRotation } from './boardPose';
import { Feet } from './Feet';
import { newFlightClock, noteStoreChange, tickFlightClock } from './flightClock';
import { FootPaths } from './FootPaths';
import { MotionCues } from './MotionCues';
import { geo, mat } from './resources';

const S = ART.shadow;
const CUES = ART.motionCues;
const REST_Y = ART.board.restY;
const D2R = MathUtils.DEG2RAD;
/** The store's live playhead (store/playhead.ts): the one cursor the flight clock advances. */
const head = useTrickStore.playhead;
/** The foot paths' playhead, a shared uniform (resources.ts). */
const pathProgress = mat.footPath.uniforms.uProgress!;

/**
 * Applies a foot pose (board rest frame, src/sim/feet.ts) to a shoe group.
 * Euler 'YZX': yaw about world Y, then pitch about the shoe's own Z, then
 * roll about its own long axis. The shoe's outside edge is its +Z side for
 * the right shoe and its -Z side for the mirrored left one, so `edge` is +1
 * or -1 and a positive roll always banks onto the outside edge. Goofy
 * (ADR-24): the front shoe is the right one (+1), the back the left (-1).
 * Regular (ADR-25): the other way round. For the front shoe, toes at -Z,
 * that edge faces the nose.
 */
function applyFoot(g: Group | null, f: FootPose, edge: 1 | -1) {
  if (!g) return;
  g.position.set(f.x, REST_Y + f.y, f.z);
  g.rotation.set(f.roll * edge * D2R, f.yaw * D2R, f.pitch * D2R, 'YZX');
}

/**
 * The only per-frame writer of the board and feet poses. While playing, the
 * flight clock (flightClock.ts) advances the store's live playhead by the
 * frame delta, every frame and without allocating; this callback writes the
 * poses into refs (no React state per frame), applies them to the Board
 * group, the two shoe groups, the ground shadow, the foot paths' playhead and
 * the motion cues' fade, and commits progress to the store at most 10 times a
 * second for the timeline. When progress reaches 1 it calls `land()`, which
 * resolves the trick and sends the Canvas back to demand mode. When not
 * playing (idle, paused, done, scrubbing) it poses everything from the
 * store's progress on demand frames; the feet follow the live inputs while
 * idle, so moving a slider moves the stance. A remount (a tier change
 * rebuilds the Canvas) continues from the playhead, so the board never jumps
 * back to the last 10 Hz commit.
 */
export function FlightDriver({ shadows }: { shadows: boolean }) {
  const board = useRef<Group>(null);
  const front = useRef<Group>(null);
  const back = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const pose = useRef<Pose>({ y: 0, roll: 0, yaw: 0, pitch: 0 });
  const feet = useRef<FeetPose>(newFeetPose());
  const clock = useRef(newFlightClock());
  const feetVisible = useTrickStore((s) => s.feetVisible);
  const footPathsVisible = useTrickStore((s) => s.footPathsVisible);
  const motionCuesVisible = useTrickStore((s) => s.motionCuesVisible);

  // A pop or a resume starts a new run of the clock even when no paused
  // frame came in between, so the next frame advances by 0, not by the wait.
  useEffect(() => useTrickStore.subscribe((s, prev) => noteStoreChange(clock.current, s, prev)), []);

  useFrame((_state, delta) => {
    const s = useTrickStore.getState();
    const c = clock.current;
    // Advances the playhead while playing; lands or commits progress through the store's actions.
    tickFlightClock(c, head, s, delta);

    const p = writePose(pose.current, s.flight, c.progress);
    const g = board.current;
    if (g) {
      g.position.y = REST_Y + p.y;
      // 'YZX' and the stance signs (ADR-32, ADR-10, ADR-25) live in setBoardRotation.
      setBoardRotation(g.rotation, p, s.stance);
    }
    // Hidden feet cost nothing: the feet model and its clearance against the
    // board's volume run only while a shoe group is mounted. Turned on
    // mid-flight, the shoes are posed from the next frame.
    if (front.current || back.current) {
      // The store state carries pop, flick and scoop, so it is the inputs object: no allocation.
      const f = writeFeetPose(feet.current, s, s.flight, c.progress, s.stance);
      const regular = s.stance === 'regular';
      applyFoot(front.current, f.front, regular ? -1 : 1);
      applyFoot(back.current, f.back, regular ? 1 : -1);
    }
    // Before a pop the paths are a plan: nothing travelled yet.
    pathProgress.value = s.flight ? c.progress : 0;
    // Motion cues (ADR-26) are the plan: full before the pop, gone early in
    // the flight. They stay gone at the landing (the deck has turned, so an
    // arrow riding it would point the wrong way) and come back on Reset or
    // when the timeline is scrubbed back to the start.
    mat.motionCues.opacity = CUES.opacity * (s.flight ? 1 - MathUtils.smoothstep(c.progress, 0, CUES.fadeBy) : 1);
    // Fully faded, skip the draw call (three skips a mesh whose material is not visible).
    mat.motionCues.visible = mat.motionCues.opacity > 0;
    const disc = shadow.current;
    if (disc && g) {
      const k = Math.min(1, p.y / S.topHeight);
      const size = MathUtils.lerp(S.scale.ground, S.scale.top, k);
      // The footprint follows the board's yaw, shortens as the nose comes up
      // and narrows as the board rolls onto its edge (no allocation).
      disc.rotation.y = g.rotation.y;
      disc.scale.set(
        size * Math.abs(Math.cos(p.pitch * D2R)),
        1,
        size * MathUtils.lerp(S.edgeWidth, 1, Math.abs(Math.cos(p.roll * D2R))),
      );
      mat.shadow.opacity = MathUtils.lerp(S.opacity.ground, S.opacity.top, k);
    }
  });

  return (
    <>
      {/* The flat disc stands in for shadows on Medium and Low (DESIGN.md 2); High has real ones (ADR-19). */}
      {!shadows && <mesh ref={shadow} geometry={geo.shadow} material={mat.shadow} position={[0, S.y, 0]} renderOrder={1} />}
      <Board ref={board} shadows={shadows}>
        {motionCuesVisible && <MotionCues />}
      </Board>
      {feetVisible && <Feet front={front} back={back} shadows={shadows} />}
      {footPathsVisible && <FootPaths />}
    </>
  );
}
