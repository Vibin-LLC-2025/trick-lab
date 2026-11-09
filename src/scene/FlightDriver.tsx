import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, MathUtils, Vector3, type Bone, type Vector2, type Vector4, type Group, type InstancedBufferAttribute, type InstancedMesh } from 'three';
import { newFeetPose, writeFeetPose, type FeetPose, type FootPose } from '../sim/feet';
import { writePose, type Pose } from '../sim/flight';
import { newLegsPose, writeLegsPose, type LegsPose, type Segment } from '../sim/legs';
import { previewAnimates, useTrickStore } from '../store';
import { ART } from './artDirection';
import { Board } from './Board';
import { setBoardRotation } from './boardPose';
import { Feet } from './Feet';
import { newGroundShadows, writeGroundShadows, type Footprint } from './groundShadow';
import { newFlightClock, noteStoreChange, tickFlightClock } from './flightClock';
import { FootPaths } from './FootPaths';
import { Legs, type LegRig } from './Legs';
import { MotionCues } from './MotionCues';
import { geo, mat, SHADOW_INSTANCES } from './resources';
import { newShowcaseClock, SHOWCASE_STILL, showcaseFlight, showcaseProgress, stepShowcase } from './showcase';

const S = ART.shadow;
const CUES = ART.motionCues;
const REST_Y = ART.board.restY;
const D2R = MathUtils.DEG2RAD;
/** The store's live playhead (store/playhead.ts): the one cursor the flight clock advances. */
const head = useTrickStore.playhead;
/** The foot paths' playhead, a shared uniform (resources.ts). */
const pathProgress = mat.footPath.uniforms.uProgress!;
/** The ground shadows' per-instance opacity (resources.ts, ADR-38). */
const shadowOpacity = geo.shadow.getAttribute('aOpacity') as InstancedBufferAttribute;

/** Reused for every ground shadow instance (no allocation). */
const footprintMatrix = new Matrix4();
const footprintScale = new Vector3();

/** Writes one footprint (groundShadow.ts) into instance `i`: the unit disc turned, stretched and placed on the pad. */
function applyFootprint(mesh: InstancedMesh, i: number, f: Footprint) {
  footprintMatrix.makeRotationY(f.yaw);
  footprintMatrix.scale(footprintScale.set(f.halfLength, 1, f.halfWidth));
  footprintMatrix.setPosition(f.x, S.y, f.z);
  mesh.setMatrixAt(i, footprintMatrix);
  shadowOpacity.setX(i, f.opacity);
}

/** The board's two footprints for the feet's union in the shadow shader (resources.ts); the uniform objects are mutated, never replaced. */
const shadowUniforms = mat.shadow.uniforms;
function applyBoardUniforms(board: Footprint, contact: Footprint) {
  (shadowUniforms.uBoard!.value as Vector4).set(board.x, board.z, Math.cos(board.yaw), Math.sin(board.yaw));
  (shadowUniforms.uBoardSize!.value as Vector4).set(board.halfLength, board.halfWidth, contact.halfLength, contact.halfWidth);
  (shadowUniforms.uBoardOpacity!.value as Vector2).set(board.opacity, contact.opacity);
}

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

/** A leg bone's own axis, and the segment direction written into a reused vector (no allocation). */
const BONE_AXIS = new Vector3(0, 1, 0);
const segmentDir = new Vector3();

/**
 * Applies a leg segment (board rest frame, src/sim/legs.ts) to its bone: the
 * proximal joint, and the bone's +Y turned onto the segment's direction. The
 * capsule is round, so the twist about its own axis is left to
 * setFromUnitVectors.
 */
function applySegment(b: Bone, s: Segment) {
  b.position.set(s.x, REST_Y + s.y, s.z);
  b.quaternion.setFromUnitVectors(BONE_AXIS, segmentDir.set(s.dx, s.dy, s.dz));
}

/**
 * The only per-frame writer of the board, feet and leg poses. While playing,
 * the flight clock (flightClock.ts) advances the store's live playhead by the
 * frame delta, every frame and without allocating; this callback writes the
 * poses into refs (no React state per frame), applies them to the Board
 * group, the two shoe groups, the four leg bones (ADR-37), the ground shadows (ADR-38),
 * the foot paths' playhead and the motion cues' fade, and commits progress
 * to the store at most 10 times a second for the timeline. When progress reaches 1 it calls `land()`, which
 * resolves the trick and sends the Canvas back to demand mode. When not
 * playing (idle, paused, done, scrubbing) it poses everything from the
 * store's progress on demand frames; the feet follow the live inputs while
 * idle, so moving a slider moves the stance. A remount (a tier change
 * rebuilds the Canvas) continues from the playhead, so the board never jumps
 * back to the last 10 Hz commit.
 *
 * On the welcome screen (ADR-45) the preview's own clock (showcase.ts) poses
 * the board, feet and legs from preset flights on a loop instead, and the
 * store's flight is left alone: nothing is logged or scored. Under reduced
 * motion, on the Low tier or with no 3D view it poses one still frame.
 */
export function FlightDriver({ shadows }: { shadows: boolean }) {
  const board = useRef<Group>(null);
  const front = useRef<Group>(null);
  const back = useRef<Group>(null);
  const shadow = useRef<InstancedMesh>(null);
  const ground = useRef(newGroundShadows());
  const pose = useRef<Pose>({ y: 0, roll: 0, yaw: 0, pitch: 0 });
  const feet = useRef<FeetPose>(newFeetPose());
  const legs = useRef<LegRig>(null);
  const legsPose = useRef<LegsPose>(newLegsPose());
  const clock = useRef(newFlightClock());
  const show = useRef(newShowcaseClock());
  const home = useTrickStore((s) => s.screen === 'home');
  const feetVisible = useTrickStore((s) => s.feetVisible);
  const legsVisible = useTrickStore((s) => s.legsVisible);
  const footPathsVisible = useTrickStore((s) => s.footPathsVisible);
  const motionCuesVisible = useTrickStore((s) => s.motionCuesVisible);

  // A pop or a resume starts a new run of the clock even when no paused
  // frame came in between, so the next frame advances by 0, not by the wait.
  useEffect(() => useTrickStore.subscribe((s, prev) => noteStoreChange(clock.current, s, prev)), []);

  useFrame((_state, delta) => {
    const s = useTrickStore.getState();
    const c = clock.current;
    // The flight on screen and how far through it: the preview's on the welcome screen, the store's elsewhere.
    let flight = s.flight;
    let progress: number;
    if (s.screen === 'home') {
      const sc = show.current;
      if (previewAnimates(s)) {
        stepShowcase(sc, delta);
        flight = showcaseFlight(sc);
        progress = showcaseProgress(sc);
      } else {
        flight = SHOWCASE_STILL.flight;
        progress = SHOWCASE_STILL.progress;
      }
    } else {
      // Advances the playhead while playing; lands or commits progress through the store's actions.
      tickFlightClock(c, head, s, delta);
      progress = c.progress;
    }
    // The preview's flight carries its own inputs; elsewhere the store state is the inputs object. No allocation either way.
    const inputs = s.screen === 'home' && flight ? flight.inputs : s;

    const p = writePose(pose.current, flight, progress);
    const g = board.current;
    if (g) {
      g.position.y = REST_Y + p.y;
      // 'YZX' and the stance signs (ADR-32, ADR-10, ADR-25) live in setBoardRotation.
      setBoardRotation(g.rotation, p, s.stance);
    }
    // Hidden feet cost nothing: the feet model and its clearance against the
    // board's volume run only while a shoe group is mounted. Turned on
    // mid-flight, the shoes are posed from the next frame.
    const feetShown = front.current !== null || back.current !== null;
    if (feetShown) {
      // The store state carries pop, flick and scoop, so it is the inputs object: no allocation.
      const f = writeFeetPose(feet.current, inputs, flight, progress, s.stance);
      const regular = s.stance === 'regular';
      applyFoot(front.current, f.front, regular ? -1 : 1);
      applyFoot(back.current, f.back, regular ? 1 : -1);
      // The legs (ADR-37) reach the shoes just posed; mounted only with the feet.
      const rig = legs.current;
      if (rig) {
        const l = writeLegsPose(legsPose.current, f, flight, progress, inputs, s.stance);
        applySegment(rig.frontThigh, l.front.thigh);
        applySegment(rig.frontShank, l.front.shank);
        applySegment(rig.backThigh, l.back.thigh);
        applySegment(rig.backShank, l.back.shank);
      }
    }
    // Before a pop the paths are a plan: nothing travelled yet.
    pathProgress.value = flight ? progress : 0;
    // Motion cues (ADR-26) are the plan: full before the pop, gone early in
    // the flight. They stay gone at the landing (the deck has turned, so an
    // arrow riding it would point the wrong way) and come back on Reset or
    // when the timeline is scrubbed back to the start.
    mat.motionCues.opacity = CUES.opacity * (flight ? 1 - MathUtils.smoothstep(progress, 0, CUES.fadeBy) : 1);
    // Fully faded, skip the draw call (three skips a mesh whose material is not visible).
    mat.motionCues.visible = mat.motionCues.opacity > 0;
    // Medium and Low (ADR-38): the board's soft and contact shadows and,
    // with the feet shown, one footprint per shoe, projected along the key
    // light. Four instances of one mesh, one draw call; written on every
    // rendered frame, so a scrub moves them too.
    const sh = shadow.current;
    if (sh && g) {
      const gs = writeGroundShadows(ground.current, p, g.rotation.y, feetShown ? feet.current : null);
      applyFootprint(sh, 0, gs.board);
      applyFootprint(sh, 1, gs.contact);
      applyFootprint(sh, 2, gs.front);
      applyFootprint(sh, 3, gs.back);
      applyBoardUniforms(gs.board, gs.contact);
      sh.count = feetShown ? SHADOW_INSTANCES : 2;
      sh.instanceMatrix.needsUpdate = true;
      shadowOpacity.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Projected footprints stand in for shadows on Medium and Low (ADR-38); High has real ones (ADR-19). */}
      {/* Not frustum culled: the instances move, and three would keep the bounds of the first frame. */}
      {!shadows && (
        <instancedMesh ref={shadow} args={[geo.shadow, mat.shadow, SHADOW_INSTANCES]} renderOrder={1} frustumCulled={false} />
      )}
      {/* The cues and trails are a plan for the student's inputs, so the welcome screen's preview has neither. */}
      <Board ref={board} shadows={shadows}>
        {motionCuesVisible && !home && <MotionCues />}
      </Board>
      {feetVisible && <Feet front={front} back={back} shadows={shadows} />}
      {feetVisible && legsVisible && <Legs rig={legs} shadows={shadows} />}
      {footPathsVisible && !home && <FootPaths />}
    </>
  );
}
