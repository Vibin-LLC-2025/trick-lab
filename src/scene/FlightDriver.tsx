import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group, type Mesh } from 'three';
import { advance, writePose, type Pose } from '../sim/flight';
import { useTrickStore } from '../store';
import { ART } from './artDirection';
import { Board } from './Board';
import { setBoardRotation } from './boardPose';
import { geo, mat } from './resources';

const S = ART.shadow;
const REST_Y = ART.board.restY;
/** Store commits of progress while playing: at most 10 per second. */
const COMMIT_EVERY = 0.1;
/**
 * The R3F clock keeps running while the loop idles in demand mode, so the
 * first frame after frameloop switches to "always" can carry a long delta.
 * Clamp it so a trick never skips straight to its landing.
 */
const MAX_DELTA = 1 / 30;

/**
 * The only per-frame writer of the board pose. While playing it advances a
 * local progress with the frame delta, writes the pose into a ref (no React
 * state per frame), applies it to the Board group and the shadow disc, and
 * commits progress to the store at most 10 times a second for the timeline.
 * When progress reaches 1 it calls `land()`, which resolves the trick and
 * sends the Canvas back to demand mode. When not playing (idle, paused, done,
 * scrubbing) it poses the board from the store's progress on demand frames.
 */
export function FlightDriver() {
  const board = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const pose = useRef<Pose>({ y: 0, roll: 0, yaw: 0, pitch: 0 });
  const clock = useRef({ progress: 0, flightId: -1, wasPlaying: false, sinceCommit: 0 });

  useFrame((_state, delta) => {
    const s = useTrickStore.getState();
    const c = clock.current;
    const playing = s.status === 'playing' && s.flight !== null;

    if (playing) {
      // A new pop or a resume: start from wherever the store says.
      if (!c.wasPlaying || c.flightId !== s.flightId) {
        c.progress = s.progress;
        c.sinceCommit = 0;
      }
      const dt = Math.min(delta, MAX_DELTA);
      c.progress = advance(c.progress, dt, s.rate, s.flight!.airtime);
      c.sinceCommit += dt;
      if (c.progress >= 1) {
        s.land();
      } else if (c.sinceCommit >= COMMIT_EVERY) {
        c.sinceCommit = 0;
        s.syncProgress(c.progress);
      }
    } else {
      c.progress = s.progress;
    }
    c.wasPlaying = playing;
    c.flightId = s.flightId;

    const p = writePose(pose.current, s.flight, c.progress);
    const g = board.current;
    if (g) {
      g.position.y = REST_Y + p.y;
      // 'YXZ' and the stance signs (ADR-2, ADR-10) live in setBoardRotation.
      setBoardRotation(g.rotation, p);
    }
    const disc = shadow.current;
    if (disc) {
      const k = Math.min(1, p.y / S.topHeight);
      disc.scale.setScalar(MathUtils.lerp(S.scale.ground, S.scale.top, k));
      mat.shadow.opacity = MathUtils.lerp(S.opacity.ground, S.opacity.top, k);
    }
  });

  return (
    <>
      <mesh ref={shadow} geometry={geo.shadow} material={mat.shadow} position={[0, S.y, 0]} renderOrder={1} />
      <Board ref={board} />
    </>
  );
}
