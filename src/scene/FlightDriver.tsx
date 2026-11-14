import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Matrix4, MathUtils, Vector3, type Bone, type BufferAttribute, type Group, type InstancedBufferAttribute, type InstancedMesh, type Mesh } from 'three';
import { newFeetPose, writeFeetPose, type FeetPose, type FootPose } from '../sim/feet';
import { writePose, type Pose } from '../sim/flight';
import { newBodyPose, writeBodyPose, type BodyPose } from '../sim/body';
import { newLegsPose, writeLegsPose, type LegsPose, type Segment } from '../sim/legs';
import { newSettle, settleSeconds, writeBailFeet, writeSettle, type Settle } from '../sim/settle';
import { landingMoves, playRate, previewAnimates, replayMoves, riderShown, rollMoves, useTrickStore } from '../store';
import { ART } from './artDirection';
import { Board } from './Board';
import { dust, spawnDust, stepDust, writeDust } from './dust';
import { setBoardRotation } from './boardPose';
import { Feet } from './Feet';
import { newGroundShadows, writeGroundShadows, type Footprint } from './groundShadow';
import { frameStep, newFlightClock, noteStoreChange, tickFlightClock } from './flightClock';
import { FootPaths } from './FootPaths';
import { Legs, type LegRig } from './Legs';
import { MotionCues } from './MotionCues';
import { Rider } from './Rider';
import type { RiderRig } from './RiderModel';
import { applyBody } from './riderPose';
import { geo, mat, SHADOW_INSTANCES, shaderMat, uniforms } from './resources';
import { isNodeRenderer } from './rendererKind';
import { dustShown } from './sceneTier';
import { landingClock, moveFootprint, moveTurn, noseOf, placeMove } from './landingMove';
import { replayClock, replayProgress } from './replayClock';
import { haltRoll, resetRoll, rollMotion, rollScenery, sceneryX, stepRoll, writeSlides } from './roll';
import { noWindUp, stepWindUp } from './windUp';
import { newShowcaseClock, SHOWCASE_STILL, showcaseFlight, showcaseProgress, stepShowcase } from './showcase';

const S = ART.shadow;
const CUES = ART.motionCues;
const REST_Y = ART.board.restY;
const D2R = MathUtils.DEG2RAD;
/** The store's live playhead (store/playhead.ts): the one cursor the flight clock advances. */
const head = useTrickStore.playhead;
/** The foot paths' playhead, a shared uniform value (resources.ts) both renderers' materials read. */
const pathProgress = uniforms.pathProgress;
/** The ground shadows' per-instance opacity (resources.ts, ADR-38). */
const shadowOpacity = geo.shadow.getAttribute('aOpacity') as InstancedBufferAttribute;
/** The dust's two arrays (resources.ts, ADR-74), written while dust is in the air. */
const dustPosition = geo.dust.getAttribute('position') as BufferAttribute;
const dustColor = geo.dust.getAttribute('color') as BufferAttribute;

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
function applyBoardUniforms(board: Footprint, contact: Footprint) {
  uniforms.board.set(board.x, board.z, Math.cos(board.yaw), Math.sin(board.yaw));
  uniforms.boardSize.set(board.halfLength, board.halfWidth, contact.halfLength, contact.halfWidth);
  uniforms.boardOpacity.set(board.opacity, contact.opacity);
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
 * to the store at most 10 times a second for the timeline. It also writes the dust (ADR-74, dust.ts) on those frames. When progress reaches 1 it calls `land()`, which
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
  const rider = useRef<RiderRig>(null);
  const bodyPose = useRef<BodyPose>(newBodyPose());
  const clock = useRef(newFlightClock());
  const show = useRef(newShowcaseClock());
  // The landing's move (ADR-68): one pair of groups round the board, one round the rider.
  const boardOuter = useRef<Group>(null);
  const boardInner = useRef<Group>(null);
  const riderOuter = useRef<Group>(null);
  const riderInner = useRef<Group>(null);
  const settle = useRef<Settle>(newSettle());
  const dustMesh = useRef<Mesh>(null);
  /** The dust mesh that has been drawn once, empty, so the graphics card has its program before the first landing (step 20). */
  const dustPrimed = useRef<Mesh | null>(null);
  const dusty = useTrickStore(dustShown);
  const home = useTrickStore((s) => s.screen === 'home');
  // The motion cues are the lab's (ADR-26): never on the game screen (ADR-84), nor the welcome screen's preview.
  const lab = useTrickStore((s) => s.screen === 'lab');
  const feetVisible = useTrickStore((s) => s.feetVisible);
  const legsVisible = useTrickStore((s) => s.legsVisible);
  // The whole rider on the game and welcome screens (ADR-85); the lab keeps the fading legs.
  const wholeRider = useTrickStore(riderShown);
  const footPathsVisible = useTrickStore((s) => s.footPathsVisible);
  const motionCuesVisible = useTrickStore((s) => s.motionCuesVisible);
  // The shadow footprints' material for the renderer in use (ADR-50).
  const nodeRenderer = useThree((s) => isNodeRenderer(s.gl));

  // A pop or a resume starts a new run of the clock even when no paused
  // frame came in between, so the next frame advances by 0, not by the wait.
  useEffect(() => useTrickStore.subscribe((s, prev) => noteStoreChange(clock.current, s, prev)), []);
  // The roll's frames start again after a gap (a dialog, a pause): the first one advances by 0 (ADR-67).
  useEffect(
    () =>
      useTrickStore.subscribe((s, prev) => {
        if (rollMoves(s) && !rollMoves(prev)) rollMotion.running = false;
        // A landing starts its clock at touchdown, and after a gap goes on from where it was (ADR-68).
        if (s.landing === 'plays' && prev.landing !== 'plays') landingClock.t = 0;
        if (landingMoves(s) && !landingMoves(prev)) landingClock.running = false;
        // A game's landing kicks up dust (ADR-74): placed on the next frame, at the wheels where they are then.
        if (s.landing !== 'none' && prev.landing === 'none') dust.pending = true;
        else if (s.landing === 'none' && prev.landing !== 'none') dust.pending = dust.live = false;
        // The instant replay starts from the pop (ADR-72).
        if (replayMoves(s) && !replayMoves(prev)) {
          replayClock.t = 0;
          replayClock.running = false;
        }
      }),
    [],
  );

  useFrame((state, delta) => {
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
    // The instant replay (ADR-72): the flight once more from its own clock, slowly, then the store hears it is over.
    let replaying = false;
    if (replayMoves(s) && flight) {
      replaying = true;
      const R = replayClock;
      R.t += R.running ? frameStep(delta) : 0;
      R.running = true;
      progress = replayProgress(R.t, flight);
      if (progress >= 1) s.endReplay();
    }
    // Rolling (ADR-67): the world moves, the board stays. Only on the game
    // screen; elsewhere the ground is back on the spot. The roll keeps the
    // playback speed and the game's pace (ADR-78), so a slow-motion trick
    // passes over slow ground.
    const r = rollMotion;
    // The seconds this frame moved the roll or the landing on: the dust's clock too (ADR-74).
    let moved = 0;
    if (s.screen !== 'skate') {
      if (r.distance !== 0 || r.speed !== 0) resetRoll(r);
    } else if (s.roll === 'still') {
      if (r.speed !== 0) haltRoll(r);
    } else if (rollMoves(s)) {
      const dt = r.running ? frameStep(delta) * playRate(s) : 0;
      r.running = true;
      moved = dt;
      if (stepRoll(r, s.roll === 'push', dt)) s.rollRested();
    }
    writeSlides(r.distance, noseOf(s.stance));
    // The skate spot rolls past with the ground, wrapped over its loop (ADR-69).
    if (rollScenery.spot) rollScenery.spot.position.x = sceneryX(r.distance, noseOf(s.stance), ART.spot.loop);
    // The landing's motion (ADR-68): a game's sketchy landing rocks and
    // swerves with the rider on, a bail falls and slides from under the feet.
    // At the playback speed, like the roll; once over (or cut short) its end pose.
    let landed: Settle | null = null;
    // A replay shows the flight before its landing: no landing move while it plays.
    if (s.landing !== 'none' && s.flight && s.result && s.screen === 'skate' && !replaying) {
      const L = landingClock;
      if (s.landing === 'plays') {
        if (landingMoves(s)) {
          const dt = L.running ? frameStep(delta) * playRate(s) : 0;
          L.t += dt;
          L.running = true;
          moved = Math.max(moved, dt);
        }
        if (L.t >= settleSeconds(s.flight)) s.landingDone();
      }
      landed = writeSettle(settle.current, s.flight, s.landing === 'plays' ? L.t : Infinity);
    }
    // The bail's own landing, or null: the board falls and slides, the feet stay.
    const bail = landed !== null && landed.grade === 'bail' ? landed : null;
    placeMove(boardOuter.current, boardInner.current, landed, s.stance);
    placeMove(riderOuter.current, riderInner.current, landed && landed.riding ? landed : null, s.stance);
    // The preview's flight carries its own inputs; elsewhere the store state is the inputs object. No allocation either way.
    const inputs = s.screen === 'home' && flight ? flight.inputs : s;

    const p = writePose(pose.current, flight, progress);
    // A bailed board falls over onto its side (ADR-68): its own roll and height.
    if (bail) {
      p.roll = bail.roll;
      p.y = bail.rise;
    }
    const g = board.current;
    if (g) {
      g.position.y = REST_Y + p.y;
      // 'YZX' and the stance signs (ADR-32, ADR-10, ADR-25) live in setBoardRotation.
      setBoardRotation(g.rotation, p, s.stance);
    }
    // Dust (ADR-74): placed on the first frame that sees the landing, then
    // moved on only while the roll or the landing still draws frames, so none
    // is ever left hanging in a picture that has stopped. Not in a replay.
    const dm = dustMesh.current;
    if (!dm || !g) dust.pending = dust.live = false;
    else {
      const nose = noseOf(s.stance);
      if (dust.pending && s.landing !== 'none' && s.result) spawnDust(dust, g.rotation.y, s.result.grade, r.distance);
      if (dust.live) {
        if (replaying || !(rollMoves(s) || landingMoves(s))) dust.live = false;
        else if (stepDust(dust, moved, bail ? bail.forward * nose : 0, bail ? bail.side : 0, nose, r.distance)) {
          writeDust(dust, dustPosition.array as Float32Array, dustColor.array as Float32Array, state.camera.matrixWorld.elements, r.distance, nose);
          dustPosition.needsUpdate = true;
          dustColor.needsUpdate = true;
        }
      }
      dm.visible = dust.live;
      // A newly mounted mesh is drawn once with nothing in it (every puff has no size), on a frame of
      // its own while the board is at rest, so its program is not built in the middle of the first landing.
      if (dustPrimed.current !== dm) {
        dustPrimed.current = dm;
        dm.visible = true;
        state.invalidate();
      }
    }
    // Hidden feet cost nothing: the feet model and its clearance against the
    // board's volume run only while a shoe group is mounted. Turned on
    // mid-flight, the shoes are posed from the next frame.
    const feetShown = front.current !== null || back.current !== null;
    // The wind-up (ADR-86): the whole rider in a game rides along before its go and sinks into the crouch for the pop.
    // Stepped once a frame, here, before the camera reads it (this useFrame runs first).
    const ready = feetShown && rider.current && s.screen === 'skate' ? stepWindUp(s, delta) : noWindUp();
    if (feetShown) {
      // The store state carries pop, flick and scoop, so it is the inputs object: no allocation.
      // In a bail the board leaves the feet where they stepped down, cleared against it as it slides (ADR-68).
      const f = bail && flight ? writeBailFeet(feet.current, flight.inputs, flight, bail, s.stance) : writeFeetPose(feet.current, inputs, flight, progress, s.stance);
      const regular = s.stance === 'regular';
      applyFoot(front.current, f.front, regular ? -1 : 1);
      applyFoot(back.current, f.back, regular ? 1 : -1);
      // The legs (ADR-37) reach the shoes just posed; mounted only with the feet.
      // The whole rider (ADR-85) stands on the same legs, posed from the pelvis up.
      const rig = legs.current;
      const whole = rider.current;
      if (rig || whole) {
        const l = writeLegsPose(legsPose.current, f, flight, progress, inputs, s.stance, ready);
        if (rig) {
          applySegment(rig.frontThigh, l.front.thigh);
          applySegment(rig.frontShank, l.front.shank);
          applySegment(rig.backThigh, l.back.thigh);
          applySegment(rig.backShank, l.back.shank);
        }
        if (whole) applyBody(whole.bones, writeBodyPose(bodyPose.current, l, f, flight, progress, inputs, s.stance, ready));
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
      // The landing's move carries the footprints with what casts them (ADR-68).
      if (landed) {
        const bi = boardInner.current;
        const ri = riderInner.current;
        const turn = moveTurn(landed, s.stance);
        if (bi) {
          bi.updateWorldMatrix(true, false);
          moveFootprint(gs.board, bi.matrixWorld, turn);
          moveFootprint(gs.contact, bi.matrixWorld, turn);
        }
        if (ri && landed.riding) {
          ri.updateWorldMatrix(true, false);
          moveFootprint(gs.front, ri.matrixWorld, turn);
          moveFootprint(gs.back, ri.matrixWorld, turn);
        }
      }
      applyFootprint(sh, 0, gs.board);
      applyFootprint(sh, 1, gs.contact);
      applyFootprint(sh, 2, gs.front);
      applyFootprint(sh, 3, gs.back);
      applyBoardUniforms(gs.board, gs.contact);
      sh.count = feetShown ? SHADOW_INSTANCES : 2;
      sh.instanceMatrix.needsUpdate = true;
      shadowOpacity.needsUpdate = true;
    }
    // First of the frame (priority -1): the camera reads the pose it leaves (the wind-up, ADR-86), and PerfProbe (1) draws it.
  }, -1);

  return (
    <>
      {/* Projected footprints stand in for shadows on Medium and Low (ADR-38); High has real ones (ADR-19). */}
      {/* Not frustum culled: the instances move, and three would keep the bounds of the first frame. */}
      {!shadows && (
        <instancedMesh ref={shadow} args={[geo.shadow, shaderMat('shadow', nodeRenderer), SHADOW_INSTANCES]} renderOrder={1} frustumCulled={false} />
      )}
      {/* The cues and trails are a plan for the student's inputs, so the welcome screen's preview has neither. */}
      {/* The landing's move (ADR-68): the identity except while a game's landing plays or holds its end. */}
      <group ref={boardOuter}>
        <group ref={boardInner}>
          <Board ref={board} shadows={shadows}>
            {motionCuesVisible && lab && <MotionCues />}
          </Board>
        </group>
      </group>
      {/* The dust (ADR-74): one mesh, drawn only while dust is in the air. Never culled: its vertices move. */}
      {dusty && <mesh ref={dustMesh} geometry={geo.dust} material={shaderMat('dust', nodeRenderer)} renderOrder={2} frustumCulled={false} visible={false} />}
      <group ref={riderOuter}>
        <group ref={riderInner}>
          {feetVisible && <Feet front={front} back={back} shadows={shadows} />}
          {feetVisible && legsVisible && (wholeRider ? <Rider rig={rider} legs={legs} shadows={shadows} /> : <Legs rig={legs} shadows={shadows} />)}
          {footPathsVisible && !home && <FootPaths />}
        </group>
      </group>
    </>
  );
}
