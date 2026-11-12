import { describe, expect, it } from 'vitest';
import { REST_Y, OUTLINE, TRUCK } from '../asset/spec';
import {
  BOLTS_X,
  CATCH,
  CUES,
  DECK_TOP,
  feetPoseAt,
  flickDistance,
  FOOT,
  hoverHeight,
  LAND_Y,
  MOTION,
  motionCues,
  newFeetPose,
  PAD_Y,
  RAIL_Z,
  releaseAt,
  scoopDistance,
  SKETCH,
  STANCE,
  TAIL_TOP,
  tuckHeight,
  tuckShape,
  writeFeetIntent,
  writeFeetPose,
  type CuePoint,
  type FeetPose,
  type FootPose,
  type Stance,
} from './feet';
import { CLEARANCE, footLift, glbDeckTop, halfWidth } from './boardVolume';
import { airtimeFor, computeFlight, PHASE, poseAt, POP_RISE_BY, type Pose, type TrickInputs } from './flight';
import { PRESETS, presetById, recognize, sketchAmount, snapInput } from './tricks';

const REST: Pose = { y: 0, roll: 0, yaw: 0, pitch: 0 };
/**
 * The shoe rests on the board (ADR-29): clear where it is (the bisection in
 * the deck march leaves up to 0.2 mm), and lowered by 1 mm it would need
 * lifting again. `edge` is the shoe's outside-edge sign in the goofy frame.
 */
const restsOnBoard = (f: FootPose, edge: 1 | -1, pose: Pose, narrow = 0) =>
  footLift(f, edge, pose, narrow) < 3e-4 && footLift({ ...f, y: f.y - 0.001 }, edge, pose, narrow) > 7e-4;

const ollie: TrickInputs = { pop: 0.35, flick: 0, scoop: 0 };
const kickflip = presetById('kickflip').inputs;
const shove = presetById('pop-shove-it').inputs;
const tre = presetById('360-flip').inputs;
/** The kickflip with a frontside scoop: the hardflip preset until ADR-41 (2026-11-05), still on the sliders. */
const KICKFLIP_FRONTSIDE: TrickInputs = { pop: 0.35, flick: 1.9, scoop: -0.9 };
/** Every preset plus that combination, so the sweeps cover all they did before ADR-41. */
const CASES = [...PRESETS, { id: 'kickflip-frontside', inputs: KICKFLIP_FRONTSIDE }] as const;

describe('frame constants agree with the asset', () => {
  it('pins the pad level, the rail and the bolts to src/asset/spec.ts', () => {
    expect(PAD_Y).toBeCloseTo(-REST_Y, 6);
    expect(RAIL_Z).toBeCloseTo(OUTLINE.width / 2, 6);
    expect(BOLTS_X).toBeCloseTo(TRUCK.centerX, 6);
  });
});

describe('stance from the inputs (no flight)', () => {
  it('puts both feet across the board for an ollie: back foot on the ball across the tail, heel up, on the kick', () => {
    const p = feetPoseAt(ollie, null, 0);
    expect(p.front.yaw).toBe(STANCE.front.yawAcross);
    expect(p.back.yaw).toBe(STANCE.back.yaw);
    // Heel up: toes down a few degrees (was -12, cut to -4 with the clearance, ADR-29).
    expect(p.back.pitch).toBeLessThan(-2);
    // The tail's own slope tilts the shoe (about -11 degrees of roll at x -0.31).
    expect(p.back.roll).toBeLessThan(-8);
    // On the board, not in it (ADR-29): the front sole bridges the concave on
    // the rails, 2 mm above them; the back sole rests on the tail kick. The
    // model's aims (DECK_TOP, TAIL_TOP) are below the real contact.
    expect(p.front.y).toBeCloseTo(glbDeckTop(p.front.x, RAIL_Z) + CLEARANCE.margin, 6);
    expect(p.front.y).toBeGreaterThan(DECK_TOP);
    expect(p.back.y).toBeGreaterThan(TAIL_TOP);
    expect(restsOnBoard(p.front, 1, REST)).toBe(true);
    expect(restsOnBoard(p.back, -1, REST)).toBe(true);
    expect(p.back.x).toBeLessThan(-TRUCK.bolts.x[1]);
    expect(p.front.x).toBeGreaterThan(0);
    expect(p.front.x).toBeLessThan(TRUCK.bolts.x[0]);
    // Not a shove-it setup: the back foot's ball is on the heel side (+Z, goofy) of the centreline.
    expect(p.back.z).toBeGreaterThan(0);
  });

  it('sets the kickflip front foot at about 45 degrees behind the bolts with the heel over the heel-side rail', () => {
    const p = feetPoseAt(kickflip, null, 0).front;
    expect(p.yaw).toBeGreaterThan(40);
    expect(p.yaw).toBeLessThan(50);
    expect(p.x).toBeLessThan(TRUCK.bolts.x[0]);
    const r = (p.yaw * Math.PI) / 180;
    const heelZ = p.z + (FOOT.length / 2) * Math.sin(r); // toe direction is (cos, 0, -sin) of the yaw
    expect(heelZ).toBeGreaterThan(RAIL_Z);
  });

  it('moves the back foot toward the toe-side edge (-Z) as the scoop grows, without turning it', () => {
    const a = feetPoseAt(ollie, null, 0);
    const b = feetPoseAt(shove, null, 0);
    expect(b.back.z).toBeLessThan(a.back.z);
    expect(b.back.yaw).toBe(a.back.yaw);
  });

  it('moves the front foot back toward the middle for a 360 flip', () => {
    expect(feetPoseAt(tre, null, 0).front.x).toBeLessThan(feetPoseAt(kickflip, null, 0).front.x);
  });

  it('ignores progress without a flight', () => {
    expect(feetPoseAt(kickflip, null, 0.5)).toEqual(feetPoseAt(kickflip, null, 0));
  });
});

const at = (inputs: TrickInputs, u: number) => feetPoseAt(ollie, computeFlight(inputs), u);
/** A progress after the flick and the pitch (LEVEL_BY 0.35) and before the gather, where the deck-frame feet hold still. */
const LEVEL_AFTER = 0.36;
const D2R = Math.PI / 180;
/**
 * Both feet in the deck's own frame (x along the deck, y above its centre, z
 * across), goofy numbers in either stance: the board's pitch, rise and each
 * foot's tuck taken out (ADR-27; the tuck since ADR-36 replaced the shared
 * sin^2 hover). Since the feet ride the deck through the pop, motion
 * "against the board" is measured here. It is the model's intent
 * (writeFeetIntent): the clearance (ADR-29) only adds height on top of it.
 */
const onDeck = (inputs: TrickInputs, u: number, stance: Stance = 'goofy') => {
  const flight = computeFlight(inputs);
  const pose = poseAt(flight, u);
  // The model's own motion, before the clearance lifts it off the board (ADR-29).
  const feet = writeFeetIntent(newFeetPose(), ollie, flight, u, stance);
  const k = stance === 'regular' ? -1 : 1;
  const c = Math.cos(pose.pitch * D2R);
  const sn = Math.sin(pose.pitch * D2R);
  const map = (f: FootPose, foot: 'front' | 'back') => {
    const x = k * f.x;
    const y = f.y - pose.y - tuckHeight(foot, inputs, u);
    return { x: k * (x * c + y * sn), y: -x * sn + y * c, z: f.z, yaw: f.yaw };
  };
  return { front: map(feet.front, 'front'), back: map(feet.back, 'back'), pitch: pose.pitch };
};
/**
 * The front shoe's bank against the deck, degrees: its roll with the deck's
 * own tilt under it taken out (the nose-up pitch lifts the right shoe's
 * outside edge by pitch * sin yaw, see rideDeck in feet.ts).
 */
const deckRoll = (inputs: TrickInputs, u: number) => {
  const f = at(inputs, u).front;
  return f.roll + onDeck(inputs, u).pitch * Math.sin(f.yaw * D2R);
};
/** Front foot displacement against the deck over the flick window. */
const flickMove = (inputs: TrickInputs) => {
  const a = onDeck(inputs, MOTION.flick.start).front;
  const b = onDeck(inputs, MOTION.flick.end).front;
  return { x: b.x - a.x, z: b.z - a.z };
};

describe('flight', () => {
  it('starts in the stance of the flight inputs, not the live sliders', () => {
    const flight = computeFlight(kickflip);
    expect(feetPoseAt(ollie, flight, 0)).toEqual(feetPoseAt(kickflip, null, 0));
  });

  it('rides the board in an ollie and clears it in a flip trick', () => {
    for (const pop of [0.15, 0.35, 0.6]) {
      const ol = at({ ...ollie, pop }, 0.5);
      expect(ol.front.y - (pop + DECK_TOP)).toBeLessThan(0.03);
      expect(ol.front.y - (pop + DECK_TOP)).toBeGreaterThan(0);
      const kf = at({ ...kickflip, pop }, 0.5);
      expect(kf.front.y - (pop + DECK_TOP)).toBeGreaterThan(0.06);
    }
  });

  it('slides the ollie front foot up to the nose pocket by about 0.16 of the airtime, on its outside edge', () => {
    const p = onDeck(ollie, MOTION.slide.end).front;
    expect(p.x).toBeGreaterThan(0.25);
    expect(deckRoll(ollie, 0.08)).toBeGreaterThan(15);
  });

  it('flicks the kickflip front foot forward, out of the heel-side corner and up, not down', () => {
    const m = flickMove(kickflip);
    expect(m.x).toBeGreaterThan(0.05);
    expect(m.z).toBeGreaterThan(0.1);
    expect(at(kickflip, MOTION.flick.end).front.z).toBeGreaterThan(RAIL_Z);
    // Up relative to the board: the shoe rises off the deck through the flick.
    const lift = (u: number) => onDeck(kickflip, u).front.y;
    expect(lift(MOTION.flick.end)).toBeGreaterThan(lift(MOTION.flick.start) + 0.04);
    // The flick is the shoe's outside edge, never a toe dip: the only pitch is
    // the deck's own tilt under it (ADR-27), toes up, never down.
    for (const u of [0.05, 0.1, 0.15, 0.2]) {
      const f = at(kickflip, u).front;
      expect(f.pitch).toBeCloseTo(onDeck(kickflip, u).pitch * Math.cos(f.yaw * D2R), 9);
      expect(f.pitch).toBeGreaterThanOrEqual(0);
    }
    expect(deckRoll(kickflip, 0.13)).toBeGreaterThan(20);
  });

  it('turns the kickflip front foot toward its flick so the little toe leads out of the heel-side pocket (ADR-33)', () => {
    // The little-toe point of the right shoe: 6 cm ahead of the sole centre, 4 cm toward its outside (+Z local) edge.
    const littleToe = (u: number) => {
      const f = at(kickflip, u).front;
      const y = f.yaw * D2R;
      return { x: f.x + 0.06 * Math.cos(y) + 0.04 * Math.sin(y), z: f.z - 0.06 * Math.sin(y) + 0.04 * Math.cos(y) };
    };
    const ends = (u: number) => {
      const f = at(kickflip, u).front;
      const y = f.yaw * D2R;
      return { toeZ: f.z - Math.sin(y) * (FOOT.length / 2), heelZ: f.z + Math.sin(y) * (FOOT.length / 2), yaw: f.yaw };
    };
    // Stance: toes toward the nose and the toe side, heel over the heel-side rail.
    expect(ends(0).yaw).toBeGreaterThan(40);
    expect(ends(0).heelZ).toBeGreaterThan(ends(0).toeZ);
    expect(littleToe(MOTION.flick.start).z).toBeLessThan(RAIL_Z);
    // The little toe crosses the heel-side rail inside the pocket of the nose, during the flick.
    let crossed: { x: number; z: number; u: number } | null = null;
    for (let i = 0; i <= 40 && !crossed; i++) {
      const u = MOTION.flick.start + ((MOTION.flick.end - MOTION.flick.start) * i) / 40;
      const q = littleToe(u);
      if (q.z >= RAIL_Z) crossed = { ...q, u };
    }
    expect(crossed).not.toBeNull();
    expect(crossed!.x).toBeGreaterThan(0.24);
    expect(crossed!.x).toBeLessThan(0.38);
    expect(crossed!.u).toBeLessThan(0.16);
    // By the end of the flick the toes point at the nose or a little toward the heel side, and the toe end is the one furthest out.
    const e = ends(MOTION.flick.end);
    expect(e.yaw).toBeLessThan(0);
    expect(e.yaw).toBeGreaterThan(-45);
    expect(e.toeZ).toBeGreaterThan(e.heelZ);
    // An ollie does not turn at all, and the turn grows with the flick.
    expect(at(ollie, MOTION.flick.end).front.yaw).toBeCloseTo(at(ollie, 0).front.yaw, 9);
    expect(at({ ...kickflip, flick: 0.8 }, MOTION.flick.end).front.yaw).toBeGreaterThan(e.yaw);
  });

  it('shows a weak flick: the front foot barely reaches the rail', () => {
    expect(at({ ...kickflip, flick: 0.4 }, MOTION.flick.end).front.z).toBeLessThan(RAIL_Z);
    expect(flickDistance({ ...kickflip, flick: 3 })).toBeGreaterThan(flickDistance(kickflip));
  });

  it('leans the flick forward for a varial and out for a 360 flip, lighter with a big scoop', () => {
    const kf = flickMove(kickflip);
    const va = flickMove(presetById('varial-flip').inputs);
    const tr = flickMove(tre);
    expect(va.x / va.z).toBeGreaterThan(kf.x / kf.z);
    expect(tr.x / tr.z).toBeLessThan(kf.x / kf.z);
    expect(flickDistance(tre)).toBeLessThan(flickDistance(kickflip));
  });

  it('scoops the back foot behind the heels about 10 cm per rev/s, past the heel-side rail for a 360 flip', () => {
    const end = (inputs: TrickInputs) => MOTION.scoop.end + MOTION.scoop.endScoop * Math.min(1, inputs.scoop / 2);
    // Toward the heel side, +Z in the goofy frame.
    const drop = (inputs: TrickInputs) => at(inputs, end(inputs)).back.z - at(inputs, 0).back.z;
    expect(drop(ollie)).toBeCloseTo(0, 6);
    expect(drop(shove)).toBeCloseTo(scoopDistance(shove) * MOTION.scoop.dir.z, 6);
    expect(scoopDistance(shove)).toBeCloseTo(0.09, 6);
    expect(drop(tre)).toBeGreaterThan(drop(shove) * 1.8);
    expect(at(tre, end(tre)).back.z).toBeGreaterThan(RAIL_Z);
    expect(scoopDistance({ ...tre, scoop: 3 })).toBe(MOTION.scoop.max);
  });

  it.each(CASES)('lands $id on the bolts, on the grip', ({ inputs }) => {
    const flight = computeFlight(inputs);
    expect(recognize(flight).landed).toBe(true);
    const p = feetPoseAt(ollie, flight, 1);
    expect(p.front.x).toBeCloseTo(BOLTS_X, 6);
    expect(p.back.x).toBeCloseTo(-BOLTS_X, 6);
    expect(p.front.z).toBeCloseTo(0, 6);
    expect(p.back.z).toBeCloseTo(0, 6);
    // On the grip (ADR-29): the model aims at DECK_TOP and the clearance sets
    // the soles 2 mm above the rails of the landed board, which may still be
    // a few degrees off level (a landing within the roll tolerance).
    const pose = poseAt(flight, 1);
    expect(restsOnBoard(p.front, 1, pose)).toBe(true);
    expect(restsOnBoard(p.back, -1, pose)).toBe(true);
    for (const f of [p.front, p.back]) {
      expect(f.y).toBeGreaterThan(DECK_TOP);
      expect(f.y).toBeLessThan(DECK_TOP + 0.03);
    }
  });

  it('bails a failed trick onto the pad beside the heel-side rail', () => {
    const flight = computeFlight({ ...tre, pop: 0.15 });
    expect(recognize(flight).landed).toBe(false);
    // The model puts both soles on the pad...
    const aim = writeFeetIntent(newFeetPose(), ollie, flight, 1);
    expect(aim.front.y).toBeCloseTo(PAD_Y, 6);
    expect(aim.back.y).toBeCloseTo(PAD_Y, 6);
    // ...and the clearance (ADR-29) keeps them there, or where the failed
    // board lies under a shoe (here the board has come down turned 240
    // degrees, across the back foot) on top of it, never in it.
    const p = feetPoseAt(ollie, flight, 1);
    const pose = poseAt(flight, 1);
    for (const [f, edge] of [[p.front, 1], [p.back, -1]] as const) {
      expect(f.y).toBeGreaterThanOrEqual(PAD_Y - 1e-9);
      // At the landing the bail has narrowed the shoulder all the way (feet.ts).
      if (f.y > PAD_Y + 1e-6) expect(restsOnBoard(f, edge, pose, 1)).toBe(true);
    }
    expect(p.front.z).toBeGreaterThan(RAIL_Z + 0.05);
    expect(p.back.z).toBeGreaterThan(RAIL_Z + 0.05);
    // Still over the board until the bail starts (the catch's start since ADR-36).
    const before = feetPoseAt(ollie, flight, MOTION.bail.start);
    expect(before.front.z).toBeLessThan(RAIL_Z / 2);
  });

  it('steps off a bail like a person (ADR-90): the front foot first, toes reaching, the stance opening toward the nose', () => {
    const flight = computeFlight({ ...kickflip, pop: 0.15 });
    const B = MOTION.bail;
    const aim = (u: number) => writeFeetIntent(newFeetPose(), ollie, flight, u);
    // The front foot is on the pad before the back one has finished its step.
    expect(aim(B.front.end).front.y).toBeCloseTo(PAD_Y, 9);
    expect(aim(B.front.end).back.y).toBeGreaterThan(PAD_Y + 0.02);
    // Mid step the toes reach down; planted, the sole is flat again.
    expect(aim(B.start + (B.front.end - B.start) * 0.6).front.pitch).toBeLessThan(-8);
    expect(Math.abs(aim(1).front.pitch)).toBeLessThan(1e-9);
    // On the pad the feet are a little wider than the bolts and turned toward the nose.
    expect(aim(1).front.yaw).toBe(B.frontYaw);
    expect(aim(1).back.yaw).toBe(B.backYaw);
    expect(aim(1).front.x - aim(1).back.x).toBeCloseTo(2 * (BOLTS_X + B.spread), 9);
  });

  // 3 cm per percent (was 2.5 before the 2026-11-04 research pass): the hardest
  // scoop, 3 rev/s, is a 25 cm backward kick in the first eighth of the
  // airtime, as fast as the coaching sources describe a 360 flip scoop. Still
  // far from a jump: the step is a tenth of a shoe length.
  // ADR-63: a sketchy landing comes down off the bolts, toward the middle of
  // the board, by an amount from the miss, and stays on the grip. Roll misses,
  // yaw misses and both together, each direction, both stances; the shove-its
  // end half round, so the front foot stands over the tail's bolts.
  const SKETCHY: readonly { name: string; inputs: TrickInputs }[] = [
    { name: 'a kickflip flipped 25 degrees past', inputs: { pop: 0.35, flick: 2, scoop: 0 } },
    { name: 'a heelflip 14 degrees short', inputs: { pop: 0.35, flick: -1.8, scoop: 0 } },
    { name: 'a pop shove-it 12 degrees past', inputs: { pop: 0.35, flick: 0, scoop: 1 } },
    { name: 'a frontside shove-it 20 degrees short', inputs: { pop: 0.3, flick: 0, scoop: -0.9 } },
    { name: 'a varial flip past on both', inputs: { pop: 0.35, flick: 2, scoop: 1 } },
    { name: 'a varial heelflip past on both', inputs: { pop: 0.35, flick: -2, scoop: -1 } },
    { name: 'a 360 flip past on both', inputs: { pop: 0.35, flick: 2, scoop: 2 } },
  ];

  it.each(SKETCHY)('lands $name off the bolts, toward the middle, on the grip (ADR-63)', ({ inputs }) => {
    const flight = computeFlight(inputs);
    expect(recognize(flight).grade).toBe('sketchy');
    const sketch = sketchAmount(flight.rollTotal, flight.yawTotal);
    expect(sketch).toBeGreaterThan(0.1);
    const pose = poseAt(flight, 1);
    const p = feetPoseAt(ollie, flight, 1);
    // The front foot further than the back: a narrow, uneven stance.
    expect(p.front.x).toBeCloseTo(BOLTS_X - SKETCH.front * sketch, 6);
    expect(p.back.x).toBeCloseTo(-BOLTS_X + SKETCH.back * sketch, 6);
    expect(BOLTS_X - p.front.x).toBeGreaterThan(p.back.x + BOLTS_X);
    expect(p.front.z).toBeCloseTo(0, 6);
    expect(p.back.z).toBeCloseTo(0, 6);
    // Still on the grip, resting on the rails: clear of the board, and not floating above it.
    expect(restsOnBoard(p.front, 1, pose)).toBe(true);
    expect(restsOnBoard(p.back, -1, pose)).toBe(true);
    // Regular is the mirror: the same distances the other way along the board.
    const r = feetPoseAt(ollie, flight, 1, 'regular');
    expect(r.front.x).toBeCloseTo(-p.front.x, 9);
    expect(r.back.x).toBeCloseTo(-p.back.x, 9);
    expect(r.front.y).toBeCloseTo(p.front.y, 9);
  });

  it('a sketchy landing never puts a sole in the board or under the pad, and never jumps (ADR-63)', () => {
    for (const { inputs } of SKETCHY) {
      const flight = computeFlight(inputs);
      let prev = feetPoseAt(ollie, flight, 0);
      for (let i = 1; i <= 100; i++) {
        const u = i / 100;
        const pose = poseAt(flight, u);
        const p = feetPoseAt(ollie, flight, u);
        // Nothing left to lift: the clearance already put each sole clear of the board in its pose.
        expect(footLift(p.front, 1, pose)).toBeLessThan(3e-4);
        expect(footLift(p.back, -1, pose)).toBeLessThan(3e-4);
        for (const foot of ['front', 'back'] as const) {
          expect(p[foot].y).toBeGreaterThan(PAD_Y - 1e-9);
          // The world bound the landed tricks keep (below).
          expect(Math.hypot(p[foot].x - prev[foot].x, p[foot].y - prev[foot].y, p[foot].z - prev[foot].z)).toBeLessThan(0.08);
        }
        prev = p;
      }
    }
  });

  it('a clean landing is on the bolts exactly: the sketchy offset starts from nothing at the clean limit', () => {
    // Just inside and just outside 10 degrees of flip: the feet land within a hair of each other.
    const at370 = { ...computeFlight(kickflip), rollTotal: 370 };
    const at371 = { ...computeFlight(kickflip), rollTotal: 371 };
    const a = feetPoseAt(ollie, at370, 1);
    const b = feetPoseAt(ollie, at371, 1);
    expect(a.front.x).toBe(BOLTS_X);
    expect(a.back.x).toBe(-BOLTS_X);
    expect(BOLTS_X - b.front.x).toBeGreaterThan(0);
    expect(BOLTS_X - b.front.x).toBeLessThan(0.004);
  });

  // Measured against the deck since ADR-27 (2026-11-04): in the pop the feet
  // ride the deck as it snaps 32 degrees nose up in 5 percent of the airtime,
  // so a front foot near the nose is carried up to 6 cm per percent by the
  // board itself. The foot's own motion keeps a 3.2 cm bound: against the deck
  // the hardest scoop (3 rev/s) also shows its 30 percent downward part, which
  // the board's rise used to hide in the world frame (3.08 cm, measured). The
  // carried motion stays under 8 cm.
  // Since the clearance (ADR-29, 2026-11-04) the deck measure is the model's
  // intent (onDeck), and the 8 cm world bound holds for the cleared feet of a
  // landed trick too, which also ride up over the spinning board (the
  // continuity of the lift itself is pinned below). A bail got 12 cm: the
  // hardest failed trick (3 and 3 rev/s) spun its board out from under a
  // bailing foot, which then dropped 11 cm in a percent (measured).
  // Re-measured on 2026-11-05 for ADR-36 (phased rotation, tuck, catch):
  // against the deck the largest step is still the hardest scoop, 3.08 cm
  // per percent (a landed 360 flip 2.39); in the world the largest is the
  // pop itself, 7.2 cm for a landed kickflip and 6.6 cm for a bail, so the
  // bail's 12 cm is tightened to the landed 8 cm: with the bail from the
  // catch's start, no bailing foot drops off a board any more.
  it('never teleports: every foot moves less than 3.2 cm per percent of flight against the deck', () => {
    for (const inputs of [ollie, kickflip, shove, tre, { ...tre, pop: 0.15 }, { ...ollie, flick: 3, scoop: 3 }]) {
      const flight = computeFlight(inputs);
      let prev = onDeck(inputs, 0);
      let prevWorld = feetPoseAt(ollie, flight, 0);
      for (let i = 1; i <= 100; i++) {
        const next = onDeck(inputs, i / 100);
        const world = feetPoseAt(ollie, flight, i / 100);
        for (const foot of ['front', 'back'] as const) {
          const d = Math.hypot(next[foot].x - prev[foot].x, next[foot].y - prev[foot].y, next[foot].z - prev[foot].z);
          expect(d).toBeLessThan(0.032);
          const w = world[foot];
          const v = prevWorld[foot];
          expect(Math.hypot(w.x - v.x, w.y - v.y, w.z - v.z)).toBeLessThan(0.08);
        }
        prev = next;
        prevWorld = world;
      }
    }
  });

  // ADR-27: the board pivots on its tail in the pop, and the feet stay on it.
  it('rides the tilting deck in the pop: back sole on the tail kick, front sole on the grip, nothing under the pad', () => {
    for (const inputs of [ollie, kickflip, shove, tre]) {
      for (const u of [0.01, 0.02, POP_RISE_BY, 0.1]) {
        const d = onDeck(inputs, u);
        const w = at(inputs, u);
        // Against the deck the feet are where the model puts them on a level board.
        const press = MOTION.pop.press * Math.sin(Math.PI * Math.min(1, u / MOTION.pop.end));
        const scoopDown = MOTION.scoop.dir.y * scoopDistance(inputs);
        expect(d.back.y).toBeLessThanOrEqual(TAIL_TOP - press + 1e-9);
        expect(d.back.y).toBeGreaterThanOrEqual(TAIL_TOP - press + scoopDown - 1e-9);
        expect(d.front.y).toBeGreaterThanOrEqual(DECK_TOP - 1e-9);
        // In the world both soles are above the pad.
        expect(w.back.y).toBeGreaterThan(PAD_Y);
        expect(w.front.y).toBeGreaterThan(PAD_Y);
      }
      // At full pitch the back shoe sits on the struck tail and the front one
      // is carried up. On the tail, not in it (ADR-29): 6 to 7 cm above the
      // pad for an ollie or a shove (the sole bridges the concave over a tail
      // at 13 degrees to the pad); a flip has already rolled the board 18
      // degrees by the strike, which lifts the toe-side rail under the back
      // toes by another 5 to 6 cm (was under 6 cm in all cases, when the
      // sole could sink into the rail).
      const strike = at(inputs, POP_RISE_BY);
      expect(restsOnBoard(strike.back, -1, poseAt(computeFlight(inputs), POP_RISE_BY))).toBe(true);
      expect(strike.back.y - PAD_Y).toBeLessThan(inputs.flick > 0 ? 0.14 : 0.075);
      expect(strike.front.y - strike.back.y).toBeGreaterThan(0.15);
      // The soles tilt with the deck: the back shoe's outside edge (toward the
      // tail) goes down with the tail, past the kick's own tilt.
      expect(strike.back.roll).toBeGreaterThan(feetPoseAt(inputs, null, 0).back.roll + 25);
    }
  });

  // ADR-24: the rider is goofy, the regular numbers mirrored across z = 0, so
  // from the rider's view on the heel side (+Z) the front foot is the
  // right-hand shoe and everything it does toward the heels goes toward +Z.
  it('pins the goofy mirror: front flick, bail and back scoop all go toward the heel side, +Z', () => {
    // Both shoes point their toes at the toe side, -Z: (cos yaw, 0, -sin yaw) with yaw near +90.
    const rest = feetPoseAt(ollie, null, 0);
    expect(-Math.sin((rest.front.yaw * Math.PI) / 180)).toBeLessThan(-0.99);
    expect(-Math.sin((rest.back.yaw * Math.PI) / 180)).toBeLessThan(-0.99);
    // The kickflip flick leaves toward the heel side and ends on the nose side of the bolts.
    const m = flickMove(kickflip);
    expect(m.z).toBeGreaterThan(0);
    const end = at(kickflip, MOTION.flick.end).front;
    expect(end.z).toBeGreaterThan(RAIL_Z);
    expect(end.x).toBeGreaterThan(BOLTS_X);
    // The bail steps to +Z.
    expect(MOTION.bail.frontZ).toBeGreaterThan(0);
    expect(MOTION.bail.backZ).toBeGreaterThan(0);
    const bail = feetPoseAt(ollie, computeFlight({ ...kickflip, pop: 0.15 }), 1);
    expect(bail.front.z).toBeGreaterThan(RAIL_Z);
    expect(bail.back.z).toBeGreaterThan(RAIL_Z);
    // The back foot's scoop moves toward +Z.
    expect(at(shove, 0.1).back.z).toBeGreaterThan(at(shove, 0).back.z + 0.05);
  });

  // ADR-25: regular is the goofy pose mirrored along the board's length, x to
  // -x and yaw to 180 - yaw. The camera stays on the heel side, so the front
  // foot moves to the nose at -X and everything toward the heels still goes to +Z.
  describe('regular stance', () => {
    const reg = (inputs: TrickInputs, u: number) => feetPoseAt(ollie, computeFlight(inputs), u, 'regular');
    const toe = (yaw: number) => ({ x: Math.cos((yaw * Math.PI) / 180), z: -Math.sin((yaw * Math.PI) / 180) });

    it('defaults to goofy', () => {
      expect(feetPoseAt(kickflip, null, 0)).toEqual(feetPoseAt(kickflip, null, 0, 'goofy'));
    });

    it('mirrors every foot along X: x and the toe direction flip, height, z, pitch and roll stay', () => {
      for (const inputs of [ollie, kickflip, shove, tre, { ...tre, pop: 0.15 }]) {
        const flight = computeFlight(inputs);
        for (const u of [0, 0.1, 0.3, 0.6, 1]) {
          const g = feetPoseAt(ollie, flight, u);
          const r = feetPoseAt(ollie, flight, u, 'regular');
          for (const foot of ['front', 'back'] as const) {
            expect(r[foot].x).toBeCloseTo(-g[foot].x, 9);
            expect(r[foot].y).toBe(g[foot].y);
            expect(r[foot].z).toBe(g[foot].z);
            expect(r[foot].pitch).toBe(g[foot].pitch);
            expect(r[foot].roll).toBe(g[foot].roll);
            expect(toe(r[foot].yaw).x).toBeCloseTo(-toe(g[foot].yaw).x, 9);
            expect(toe(r[foot].yaw).z).toBeCloseTo(toe(g[foot].yaw).z, 9);
            expect(r[foot].yaw).toBeGreaterThan(-180);
            expect(r[foot].yaw).toBeLessThanOrEqual(180);
          }
        }
      }
    });

    it('puts the front foot toward the nose (-X), back foot on the tail (+X), toes at the toe side (-Z)', () => {
      const rest = feetPoseAt(kickflip, null, 0, 'regular');
      expect(rest.front.x).toBeLessThan(0);
      expect(rest.back.x).toBeGreaterThan(0.25);
      expect(toe(rest.front.yaw).z).toBeLessThan(-0.6);
      expect(toe(rest.back.yaw).z).toBeLessThan(-0.99);
      // Turned toward the nose, now at -X.
      expect(toe(rest.front.yaw).x).toBeLessThan(-0.6);
    });

    it('slides the front foot to the nose and flicks it off the heel-side corner, toward +Z', () => {
      expect(onDeck(ollie, MOTION.slide.end, 'regular').front.x).toBeLessThan(-0.25);
      const a = onDeck(kickflip, MOTION.flick.start, 'regular').front;
      const b = onDeck(kickflip, MOTION.flick.end, 'regular').front;
      expect(b.x - a.x).toBeLessThan(-0.05);
      expect(b.z - a.z).toBeGreaterThan(0.1);
      expect(b.z).toBeGreaterThan(RAIL_Z);
      expect(b.x).toBeLessThan(-BOLTS_X);
    });

    it('scoops the back foot toward +Z, lands on the bolts and bails to +Z', () => {
      expect(reg(shove, 0.1).back.z).toBeGreaterThan(reg(shove, 0).back.z + 0.05);
      const land = reg(kickflip, 1);
      expect(land.front.x).toBeCloseTo(-BOLTS_X, 6);
      expect(land.back.x).toBeCloseTo(BOLTS_X, 6);
      const bail = feetPoseAt(ollie, computeFlight({ ...kickflip, pop: 0.15 }), 1, 'regular');
      expect(bail.front.z).toBeGreaterThan(RAIL_Z);
      expect(bail.back.z).toBeGreaterThan(RAIL_Z);
      // Aimed at the pad; the clearance may set it on the failed board's wheels (ADR-29).
      expect(writeFeetIntent(newFeetPose(), ollie, computeFlight({ ...kickflip, pop: 0.15 }), 1, 'regular').front.y).toBeCloseTo(PAD_Y, 6);
      expect(bail.front.y).toBeGreaterThanOrEqual(PAD_Y - 1e-9);
    });
  });

  // ADR-29 (2026-11-04): the clearance against the board's volume.
  describe('clearance', () => {
    const sweep: TrickInputs[] = [ollie, ...CASES.map((p) => p.inputs)];
    for (const pop of [0.15, 0.5]) for (const flick of [0, 1.5, 3]) for (const scoop of [0, 1.5, 3]) sweep.push({ pop, flick, scoop });

    it("only ever adds height: x, z, yaw, pitch and roll are the model's own", () => {
      const a = newFeetPose();
      const b = newFeetPose();
      for (const inputs of sweep) {
        const flight = computeFlight(inputs);
        for (const stance of ['goofy', 'regular'] as const) {
          for (let k = 0; k <= 50; k++) {
            writeFeetPose(a, ollie, flight, k / 50, stance);
            writeFeetIntent(b, ollie, flight, k / 50, stance);
            for (const foot of ['front', 'back'] as const) {
              expect(a[foot].y).toBeGreaterThanOrEqual(b[foot].y);
              expect({ ...a[foot], y: 0 }).toEqual({ ...b[foot], y: 0 });
            }
          }
        }
      }
    });

    it('stands every preset on the board at rest, and starts each flight from that stance', () => {
      for (const { inputs } of CASES) {
        const rest = feetPoseAt(inputs, null, 0);
        expect(restsOnBoard(rest.front, 1, REST)).toBe(true);
        expect(restsOnBoard(rest.back, -1, REST)).toBe(true);
        expect(feetPoseAt(ollie, computeFlight(inputs), 0)).toEqual(rest);
        expect(feetPoseAt(ollie, computeFlight(inputs), 0, 'regular')).toEqual(feetPoseAt(inputs, null, 0, 'regular'));
      }
    });

    // Lifting along a fixed direction would step where a rail sweeps in under
    // a shoe from the side (25 cm in one step for a hard scoop, measured with
    // no shoulder). The shoulder (CLEARANCE.shoulder) turns every such step
    // into a ramp. Measured over this sweep at 2000 steps a flight, the
    // largest change of a foot's height per 0.001 of progress is 8.6 mm for a
    // landed trick, and the largest of those are in the first steps of the
    // pop, where the board itself rises that fast. A bail narrows the
    // shoulder so the feet can step down beside the board (feet.ts), so a
    // failed hard shove (3 rev/s) still spinning by the bailing feet ramps
    // them at up to 3.6 cm per 0.001; at 1x playback a frame is 0.03 of the
    // airtime, so either ramp is over within one frame. At ten times the steps
    // the largest change of the lift is a tenth or less, so there is no step
    // left anywhere, only slopes.
    // Re-measured on 2026-11-05 for ADR-36 (phased rotation, tuck, catch):
    // 8.0 mm per 0.001 for a landed trick (was 8.6) and 10.8 mm for a bail
    // (was 3.6 cm; the hardest is now a failed 3 and 3 rev/s at pop 0.5,
    // at the end of its scoop), the bounds unchanged.
    it('lifts continuously: under 1 cm of height per 0.001 of progress (4 cm in a bail), no step left at ten times the resolution', () => {
      const out = newFeetPose();
      const aim = newFeetPose();
      const worst = (n: number, flight: ReturnType<typeof computeFlight>, stance: Stance) => {
        let y = 0;
        let lift = 0;
        let prevY = [0, 0];
        let prevLift = [0, 0];
        for (let k = 0; k <= n; k++) {
          writeFeetPose(out, ollie, flight, k / n, stance);
          writeFeetIntent(aim, ollie, flight, k / n, stance);
          const ys = [out.front.y, out.back.y];
          const ls = [out.front.y - aim.front.y, out.back.y - aim.back.y];
          if (k > 0) {
            for (let i = 0; i < 2; i++) {
              y = Math.max(y, Math.abs(ys[i]! - prevY[i]!));
              lift = Math.max(lift, Math.abs(ls[i]! - prevLift[i]!));
            }
          }
          prevY = ys;
          prevLift = ls;
        }
        // Per 0.001 of progress.
        return { y: (y * n) / 1000, lift: (lift * n) / 1000 };
      };
      let coarse = 0;
      for (const inputs of sweep) {
        const flight = computeFlight(inputs);
        const landed = recognize(flight).landed;
        for (const stance of ['goofy', 'regular'] as const) {
          const w = worst(2000, flight, stance);
          expect(w.y, `${JSON.stringify(inputs)} landed ${landed}`).toBeLessThan(landed ? 0.01 : 0.04);
          coarse = Math.max(coarse, w.lift);
        }
      }
      // The steepest lifts found above (a failed hard shove, a 360 flip), at ten times the resolution.
      let fine = 0;
      for (const inputs of [{ pop: 0.5, flick: 0, scoop: 3 }, { pop: 0.5, flick: 3, scoop: 3 }, tre]) {
        const flight = computeFlight(inputs);
        fine = Math.max(fine, worst(20000, flight, 'goofy').lift);
        // Per 0.001 the same slope at both resolutions: a ramp, not a step.
        expect(worst(20000, flight, 'goofy').lift).toBeLessThan(worst(2000, flight, 'goofy').lift * 1.2);
      }
      expect(fine).toBeLessThan(coarse * 1.2);
    }, 120000);
  });

  // ADR-36 (2026-11-05): the feet are timed against the board's catch.
  describe('tuck and catch (ADR-36)', () => {
    /** Every landed preset, and the same tricks rescaled to land at pop 0.2 and 0.5. */
    const landedCases: TrickInputs[] = CASES.map((p) => p.inputs);
    for (const pop of [0.2, 0.5]) {
      const k = airtimeFor(0.35) / airtimeFor(pop);
      for (const { inputs } of CASES) {
        const scaled = { pop, flick: snapInput('flick', inputs.flick * k), scoop: snapInput('scoop', inputs.scoop * k) };
        if (computeFlight(scaled).landed) landedCases.push(scaled);
      }
    }
    /**
     * How far a sole is above the board under it, metres (the clearance rests
     * it at CLEARANCE.margin): the lift a copy 0.2 m lower would need, taken
     * back off. Board and shoe are raised 1 m together so the pad, which the
     * lift also keeps the sole above, does not count.
     */
    const gapAbove = (f: FootPose, edge: 1 | -1, pose: Pose) =>
      0.2 + CLEARANCE.margin - footLift({ ...f, y: f.y + 1 - 0.2 }, edge, { ...pose, y: pose.y + 1 });

    it('times the catch: the front foot first, then the back as the board stops; the gather from no earlier than 0.2 before the catch', () => {
      expect(CATCH.front).toBeCloseTo(PHASE.catch.end - 0.03, 12);
      expect(CATCH.back).toBe(PHASE.catch.end);
      expect(MOTION.gather.start).toBeGreaterThanOrEqual(PHASE.catch.start - 0.2 - 1e-12);
      expect(MOTION.gather.front).toBe(CATCH.front);
      expect(MOTION.gather.back).toBe(CATCH.back);
      expect(MOTION.bail.start).toBe(PHASE.catch.start);
      // A landed sole rests on the rails of the concave (about 0.021), above the old DECK_TOP aim and under 2 cm more.
      for (const y of [LAND_Y.front.square, LAND_Y.front.half, LAND_Y.back.square, LAND_Y.back.half]) {
        expect(y).toBeGreaterThan(DECK_TOP);
        expect(y).toBeLessThan(DECK_TOP + 0.02);
      }
    });

    it('tucks each foot from its release: a fast rise, a level top, and down to the board at its catch', () => {
      for (const { inputs } of CASES) {
        for (const [foot, peak, catchAt] of [
          ['front', MOTION.tuck.frontPeak, CATCH.front],
          ['back', MOTION.tuck.backPeak, CATCH.back],
        ] as const) {
          const release = releaseAt(foot, inputs);
          expect(release).toBeLessThan(peak);
          expect(tuckHeight(foot, inputs, release)).toBe(0);
          expect(tuckHeight(foot, inputs, peak)).toBeCloseTo(hoverHeight(inputs), 12);
          expect(tuckHeight(foot, inputs, catchAt)).toBe(0);
          expect(tuckHeight(foot, inputs, 0.9)).toBe(0);
          // Ease-out up, ease-in down: three quarters of the height in the first half of the rise, a quarter gone in the first half of the descent.
          expect(tuckShape((release + peak) / 2, release, peak, catchAt)).toBeCloseTo(0.75, 12);
          expect(tuckShape((peak + catchAt) / 2, release, peak, catchAt)).toBeCloseTo(0.75, 12);
          let prev = 0;
          for (let k = 0; k <= 100; k++) {
            const t = tuckShape(release + ((peak - release) * k) / 100, release, peak, catchAt);
            expect(t).toBeGreaterThanOrEqual(prev);
            prev = t;
          }
        }
      }
      // The front foot leaves at the end of its flick; the back at the end of the pop, or of the scoop.
      expect(releaseAt('front', kickflip)).toBe(MOTION.flick.end);
      expect(releaseAt('back', kickflip)).toBe(MOTION.pop.end);
      expect(releaseAt('back', shove)).toBeGreaterThan(MOTION.pop.end);
    });

    it('gathers to the catch, not on a fixed clock: the flick spot holds until the gather starts, the bolts by each foot\'s catch', () => {
      // Against the deck the kickflip's front foot is still where its flick left it at the gather's start.
      const held = onDeck(kickflip, LEVEL_AFTER).front;
      const start = onDeck(kickflip, MOTION.gather.start).front;
      expect(start.x).toBeCloseTo(held.x, 9);
      expect(start.z).toBeCloseTo(held.z, 9);
      expect(start.z).toBeGreaterThan(RAIL_Z);
      // A kickflip has no shove, so the board's settling does not move x or the yaw: the front foot is on its bolts at its catch.
      const front = at(kickflip, CATCH.front).front;
      expect(front.x).toBeCloseTo(BOLTS_X, 9);
      expect(front.yaw).toBeCloseTo(STANCE.front.yawAcross, 9);
      // At the end of the catch the board is flat and square, and both feet stand on their bolts.
      for (const { inputs } of CASES) {
        const p = at(inputs, CATCH.back);
        expect(p.front.x).toBeCloseTo(BOLTS_X, 9);
        expect(p.back.x).toBeCloseTo(-BOLTS_X, 9);
        expect(p.front.z).toBeCloseTo(0, 9);
        expect(p.back.z).toBeCloseTo(0, 9);
        expect(p.front.yaw).toBeCloseTo(STANCE.front.yawAcross, 9);
        expect(p.back.yaw).toBeCloseTo(STANCE.front.yawAcross, 9);
      }
    });

    it('puts the feet on the board after the catch: no lift and each sole within 3 mm of the deck, every landed trick', () => {
      // Before ADR-36 the clearance held a kickflip's shoes 5 to 6.6 cm up on the spinning board from 0.6 to 0.9.
      expect(landedCases.length).toBe(24);
      const out = newFeetPose();
      const aim = newFeetPose();
      for (const inputs of landedCases) {
        const flight = computeFlight(inputs);
        expect(flight.landed).toBe(true);
        for (const [foot, edge, from] of [
          ['front', 1, CATCH.front],
          ['back', -1, CATCH.back],
        ] as const) {
          for (let k = 0; k <= 50; k++) {
            const u = from + ((1 - from) * k) / 50;
            writeFeetPose(out, ollie, flight, u);
            writeFeetIntent(aim, ollie, flight, u);
            const why = `${JSON.stringify(inputs)} ${foot} at ${u}`;
            expect(out[foot].y - aim[foot].y, why).toBeLessThan(0.003);
            expect(gapAbove(out[foot], edge, poseAt(flight, u)), why).toBeLessThan(0.003);
          }
        }
      }
    });

    // Not met by the spec as written (2026-11-05, ADR-36): the tuck's height
    // is hoverHeight (7.65 cm at the presets), which does not clear a rolled
    // board everywhere between the front foot's release (0.22) and the
    // catch's start (0.64), so the clearance still lifts the shoes there.
    // Measured at 0.0025 steps: back foot up to 3.75 cm (kickflip at 0.56;
    // heelflip 3.7, kickflip with a frontside scoop 2.9, 360 flip 2.7, varial
    // flip 1.2), front foot up to 2.5 cm (varial heelflip at 0.62, kickflip and
    // kickflip with a frontside scoop 2.3; the
    // shove-its about 2 mm at the release). The 360 flip's front foot and
    // the shove-its' back feet are clear. Needs taller per-foot tucks from
    // reference data (RESEARCH-FEET.md section 4 item 11).
    it.todo('keeps the feet clear of the board by intent in the air: no lift between the front foot\'s release and the catch, every preset');
  });

  it('writes into the given object and returns it (no allocation per call)', () => {
    const out: FeetPose = newFeetPose();
    const flight = computeFlight(kickflip);
    expect(writeFeetPose(out, ollie, flight, 0.3)).toBe(out);
    expect(writeFeetPose(out, ollie, null, 0)).toBe(out);
    expect(writeFeetPose(out, ollie, flight, 0.3, 'regular')).toBe(out);
    expect(writeFeetPose(out, ollie, null, 0, 'regular')).toBe(out);
  });
});

// ADR-26 (2026-11-04): the motion cues on the grip, in the board's own frame.
describe('motion cues', () => {
  const varial = presetById('varial-flip').inputs;
  const first = (pts: CuePoint[]) => pts[0]!;
  const last = (pts: CuePoint[]) => pts[pts.length - 1]!;
  /** Direction of the last stretch of a path (where the arrowhead points). */
  const exit = (pts: CuePoint[]) => {
    const a = pts[pts.length - 5]!;
    const b = last(pts);
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  };

  it('starts the front arrow under the ball of the front shoe and follows the feet model', () => {
    for (const inputs of [ollie, kickflip, shove, varial, tre]) {
      const c = motionCues(inputs);
      const stand = feetPoseAt(inputs, null, 0).front;
      const toe = { x: Math.cos(stand.yaw * D2R), z: -Math.sin(stand.yaw * D2R) };
      expect(first(c.front).x).toBeCloseTo(stand.x + toe.x * CUES.ball, 9);
      expect(first(c.front).z).toBeCloseTo(stand.z + toe.z * CUES.ball, 9);
      // The arrow ends where the shoe is against the deck at the end of its move (slide, or flick if any),
      // under the ball along the shoe's own direction there (a kickflip has turned by then, ADR-33).
      const end = flickDistance(inputs) > 0 ? MOTION.flick.end : MOTION.slide.end;
      const d = onDeck(inputs, end).front;
      const toeEnd = { x: Math.cos(d.yaw * D2R), z: -Math.sin(d.yaw * D2R) };
      expect(last(c.front).x).toBeCloseTo(d.x + toeEnd.x * CUES.ball, 6);
      expect(last(c.front).z).toBeCloseTo(d.z + toeEnd.z * CUES.ball, 6);
    }
  });

  it('shows an ollie as a straight slide toward the nose, and no scoop', () => {
    const c = motionCues(ollie);
    for (const p of c.front) expect(p.z).toBeCloseTo(first(c.front).z, 9);
    expect(last(c.front).x - first(c.front).x).toBeCloseTo(MOTION.slide.distance, 6);
    expect(c.scoop).toEqual([]);
  });

  it('shows a kickflip sliding toward the nose and leaving off the heel-side corner (+Z, goofy)', () => {
    const c = motionCues(kickflip);
    expect(last(c.front).x).toBeGreaterThan(first(c.front).x + 0.15);
    expect(last(c.front).z).toBeGreaterThan(RAIL_Z);
    const e = exit(c.front);
    expect(e.x).toBeGreaterThan(0.3);
    expect(e.z).toBeGreaterThan(0.5);
    expect(c.scoop).toEqual([]);
  });

  it('leans the flick forward for a varial and out for a 360 flip', () => {
    const k = exit(motionCues(kickflip).front);
    const v = exit(motionCues(varial).front);
    const t = exit(motionCues(tre).front);
    expect(v.x / v.z).toBeGreaterThan(k.x / k.z);
    expect(t.x / t.z).toBeLessThan(k.x / k.z);
  });

  it('marks the back shoe on the tail pocket and sweeps the scoop toward the heel side, in front of the shoe', () => {
    for (const inputs of [shove, varial, tre]) {
      const c = motionCues(inputs);
      const b = feetPoseAt(inputs, null, 0).back;
      expect(c.press).toEqual({ x: b.x, z: b.z, yaw: b.yaw, length: FOOT.length, width: FOOT.width });
      expect(c.press.x).toBeLessThan(-0.28);
      // The sweep goes toward +Z by the scoop's sideways length, on the tail side, nose-side of the shoe.
      let length = 0;
      for (let i = 1; i < c.scoop.length; i++) {
        const p = c.scoop[i]!;
        const q = c.scoop[i - 1]!;
        expect(p.z).toBeGreaterThan(q.z);
        length += Math.hypot(p.x - q.x, p.z - q.z);
      }
      expect(length).toBeCloseTo(scoopDistance(inputs) * MOTION.scoop.dir.z, 4);
      for (const p of c.scoop) {
        expect(p.x).toBeLessThan(-0.1);
        expect(p.x).toBeGreaterThan(c.press.x + FOOT.width / 2 + CUES.scoopGap - 0.02);
      }
    }
    // A bigger scoop sweeps further.
    expect(last(motionCues(tre).scoop).z - first(motionCues(tre).scoop).z).toBeGreaterThan(
      last(motionCues(shove).scoop).z - first(motionCues(shove).scoop).z,
    );
  });

  it('mirrors across the board for a regular rider (ADR-25): x the same, z and yaw negated', () => {
    for (const inputs of [ollie, kickflip, shove, varial, tre]) {
      const g = motionCues(inputs);
      const r = motionCues(inputs, 'regular');
      for (const key of ['front', 'scoop'] as const) {
        expect(r[key].length).toBe(g[key].length);
        r[key].forEach((p, i) => {
          expect(p.x).toBe(g[key][i]!.x);
          expect(p.z).toBe(-g[key][i]!.z);
        });
      }
      expect(r.press).toEqual({ ...g.press, z: -g.press.z, yaw: -g.press.yaw });
    }
    // So in the board's own frame a regular kickflip leaves toward -Z, which
    // the board's 180 degree turn puts on the heel side (+Z) in the world.
    expect(last(motionCues(kickflip, 'regular').front).z).toBeLessThan(-RAIL_Z);
    expect(last(motionCues(shove, 'regular').scoop).z).toBeLessThan(first(motionCues(shove, 'regular').scoop).z);
  });
});

// ADR-30 (2026-11-04): signed flick and scoop. A negative flick is a heelflip,
// a negative scoop frontside; the magnitudes drive the amounts, the signs the
// directions. Numbers from RESEARCH-FEET.md 1.4 and 1.6 with z mirrored.
describe('mirror tricks: heelflip and frontside scoop', () => {
  const heel = presetById('heelflip').inputs;
  const fs = presetById('frontside-pop-shove-it').inputs;
  const hard = KICKFLIP_FRONTSIDE;
  const varialHeel = presetById('varial-heelflip').inputs;
  const inward: TrickInputs = { pop: 0.35, flick: -1.9, scoop: 0.9 };
  const last = (pts: CuePoint[]) => pts[pts.length - 1]!;
  const first = (pts: CuePoint[]) => pts[0]!;
  const exit = (pts: CuePoint[]) => {
    const a = pts[pts.length - 5]!;
    const b = last(pts);
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  };
  const scoopEnd = (inputs: TrickInputs) => MOTION.scoop.end + MOTION.scoop.endScoop * Math.min(1, Math.abs(inputs.scoop) / 2);
  const scoopMove = (inputs: TrickInputs) => at(inputs, scoopEnd(inputs)).back.z - at(inputs, 0).back.z;
  const intent = (inputs: TrickInputs) => writeFeetIntent(newFeetPose(), inputs, null, 0);

  it('sets the heelflip front foot across the board, ball more centred, toes a little over the toe-side rail', () => {
    const p = intent(heel).front;
    // RESEARCH-FEET.md 5.1 "Heelflip": 0.11, +0.02, -88 in its frame; goofy z and yaw negated,
    // z a touch further (ADR-34) so the ball of the foot sits on the toe-side rail.
    expect(p.x).toBeCloseTo(0.1 + 0.01 * 0.95, 9);
    expect(p.z).toBeCloseTo(0.01 - 0.045 * 0.95, 9);
    expect(p.z).toBeLessThan(0);
    const ballZ = p.z - CUES.ball * Math.sin(p.yaw * D2R);
    expect(Math.abs(ballZ + RAIL_Z)).toBeLessThan(0.015);
    // The heel is at the heel-side rail, not hanging over it.
    expect(p.z + (FOOT.length / 2) * Math.sin(p.yaw * D2R)).toBeLessThan(RAIL_Z + 0.015);
    expect(p.yaw).toBeGreaterThan(86);
    expect(p.yaw).toBeLessThan(90);
    // The toe tip is past the toe-side rail (-Z), and more so than an ollie's.
    const toeZ = (f: FootPose) => f.z - (FOOT.length / 2) * Math.sin(f.yaw * D2R);
    expect(toeZ(p)).toBeLessThan(-RAIL_Z);
    expect(toeZ(p)).toBeLessThan(toeZ(intent(ollie).front));
  });

  it('sets the heelflip back foot on the heel side of the tail, heel turned toward the front foot', () => {
    const b = intent(heel).back;
    const o = intent(ollie).back;
    expect(b.x).toBeLessThan(o.x);
    expect(b.z).toBeCloseTo(STANCE.back.z, 9);
    expect(b.yaw).toBeGreaterThan(o.yaw);
    expect(b.yaw).toBeCloseTo(100, 0);
  });

  it('slides the heelflip front foot about 8 cm, then kicks it forward and out off the toe-side corner of the nose', () => {
    expect(MOTION.slide.distance + MOTION.slide.distanceHeel * 0.95).toBeCloseTo(0.084, 6);
    const m = flickMove(heel);
    expect(m.x).toBeGreaterThan(0.05);
    expect(m.z).toBeLessThan(-0.15);
    expect(at(heel, MOTION.flick.end).front.z).toBeLessThan(-RAIL_Z);
    // The heel crosses the whole deck where the kickflip's little toe crosses half of it (ADR-34).
    expect(flickDistance(heel)).toBeCloseTo(flickDistance(kickflip) * MOTION.flick.heelReach, 12);
    // Up, not down.
    const lift = (u: number) => onDeck(heel, u).front.y;
    expect(lift(MOTION.flick.end)).toBeGreaterThan(lift(MOTION.flick.start) + 0.04);
  });

  it('kicks the heelflip with the heel: it sweeps across to the toe-side pocket of the nose and off it, toes leading forward and out (ADR-34)', () => {
    const ends = (u: number) => {
      const f = at(heel, u).front;
      const y = f.yaw * D2R;
      return {
        heel: { x: f.x - (FOOT.length / 2) * Math.cos(y), z: f.z + (FOOT.length / 2) * Math.sin(y) },
        toe: { x: f.x + (FOOT.length / 2) * Math.cos(y), z: f.z - (FOOT.length / 2) * Math.sin(y) },
        yaw: f.yaw,
      };
    };
    // Before the kick the heel is at the heel-side rail; it then crosses the toe-side rail inside the pocket of the nose.
    expect(ends(MOTION.flick.start).heel.z).toBeGreaterThan(0.08);
    let crossed: { x: number; u: number } | null = null;
    for (let i = 0; i <= 40 && !crossed; i++) {
      const u = MOTION.flick.start + ((MOTION.flick.end - MOTION.flick.start) * i) / 40;
      const h = ends(u).heel;
      if (h.z <= -halfWidth(h.x)) crossed = { x: h.x, u };
    }
    expect(crossed).not.toBeNull();
    expect(crossed!.x).toBeGreaterThan(0.24);
    expect(crossed!.x).toBeLessThan(0.36);
    expect(crossed!.u).toBeLessThanOrEqual(MOTION.flick.end);
    // Toes lead, heel last: the toe end is the one further toward the toe side throughout, and the toes end up pointing forward and out.
    for (const u of [0, 0.08, 0.12, 0.16, MOTION.flick.end]) {
      const e = ends(u);
      expect(e.toe.z).toBeLessThan(e.heel.z);
      expect(e.toe.x).toBeGreaterThanOrEqual(e.heel.x - 1e-9);
    }
    const yawEnd = ends(MOTION.flick.end).yaw;
    expect(yawEnd).toBeGreaterThan(55);
    expect(yawEnd).toBeLessThan(80);
    // The ollie does not use the heel pivot: it still slides straight.
    expect(at(ollie, MOTION.flick.end).front.z).toBeCloseTo(at(ollie, 0).front.z, 9);
  });

  it('kicks the heelflip with the toes up and the heel down, not on the outside edge', () => {
    for (const u of [0.1, 0.135, 0.17]) {
      const f = at(heel, u).front;
      const own = f.pitch - onDeck(heel, u).pitch * Math.cos(f.yaw * D2R);
      expect(own).toBeGreaterThan(10);
      expect(own).toBeLessThanOrEqual(MOTION.flick.heelPitch + 1e-9);
      // The outside-edge roll fades out as the heelflip factor grows (0.95 here): about 1.5 degrees left.
      expect(Math.abs(deckRoll(heel, u))).toBeLessThan(MOTION.slide.roll * 0.05 + 1e-9);
      expect(Math.abs(deckRoll(heel, u))).toBeLessThan(deckRoll(kickflip, u) * 0.06);
    }
    // Outside the kick the pitch is the deck's alone.
    const later = at(heel, 0.3).front;
    expect(later.pitch).toBeCloseTo(onDeck(heel, 0.3).pitch * Math.cos(later.yaw * D2R), 9);
  });

  it('shows a weak heelflip: the front foot barely reaches the toe-side rail', () => {
    expect(at({ ...heel, flick: -0.4 }, MOTION.flick.end).front.z).toBeGreaterThan(-RAIL_Z);
  });

  it('sets the frontside back foot toward the heel side of the tail, square across', () => {
    const b = intent(fs).back;
    const o = intent(ollie).back;
    expect(b.z).toBeGreaterThan(o.z);
    expect(intent(shove).back.z).toBeLessThan(o.z);
    expect(b.x).toBeLessThan(o.x);
    // RESEARCH-FEET.md 5.1 "Frontside shove-it": -0.33, +0.04 goofy, yaw 90.
    expect(b.x).toBeCloseTo(-0.33, 2);
    expect(b.z).toBeCloseTo(0.04, 2);
    expect(Math.abs(b.yaw - 90)).toBeLessThan(1);
  });

  it('slices the frontside scoop forward toward the toe side (-Z), as far as the backside one goes to +Z', () => {
    expect(scoopDistance(fs)).toBeCloseTo(scoopDistance(shove), 12);
    expect(scoopDistance(fs)).toBeCloseTo(0.09, 6);
    expect(scoopMove(fs)).toBeCloseTo(-scoopDistance(fs) * MOTION.scoop.dir.z, 6);
    expect(scoopMove(shove)).toBeCloseTo(scoopDistance(shove) * MOTION.scoop.dir.z, 6);
    expect(scoopDistance({ ...fs, scoop: -3 })).toBe(MOTION.scoop.max);
    // Flat: the scoop adds no pitch of its own, only the pop's heel lift on the stance's tilt.
    const own = (inputs: TrickInputs, u: number) =>
      writeFeetIntent(newFeetPose(), ollie, computeFlight(inputs), u).back.pitch - onDeck(inputs, u).pitch * Math.cos(intent(inputs).back.yaw * D2R);
    for (const u of [0.06, 0.1]) expect(own(fs, u) - intent(fs).back.pitch).toBeCloseTo(own(shove, u) - intent(shove).back.pitch, 0);
  });

  it('composes a kickflip with a frontside scoop and the inward heelflip from the two', () => {
    // Kickflip with a frontside scoop (the hardflip until ADR-41): kickflip front foot (+Z, mostly forward since ADR-35), frontside back foot (-Z).
    expect(flickMove(hard).z).toBeGreaterThan(0.02);
    expect(flickMove(hard).x).toBeGreaterThan(0.1);
    expect(scoopMove(hard)).toBeLessThan(-0.05);
    // Inward heelflip: heelflip front foot (-Z), backside back foot (+Z).
    expect(flickMove(inward).z).toBeLessThan(-0.05);
    expect(scoopMove(inward)).toBeGreaterThan(0.05);
    // Varial heelflip: both toward the toe side.
    expect(flickMove(varialHeel).z).toBeLessThan(-0.05);
    expect(scoopMove(varialHeel)).toBeLessThan(-0.05);
  });

  it('kicks a kickflip with a frontside scoop straight forward off the nose, toes a little more toward it, with no change to the frontside shove-it or the heelflip side (ADR-35, unchanged by ADR-41)', () => {
    const va = flickMove(presetById('varial-flip').inputs);
    const hd = flickMove(hard);
    // More forward than sideways against the varial flip's lean; still toward the heel side.
    expect(hd.x / hd.z).toBeGreaterThan(va.x / va.z * 1.5);
    expect(hd.z).toBeGreaterThan(0.02);
    // Stance: toes turned toward the nose only when a kickflip meets a frontside scoop.
    expect(intent(hard).front.yaw).toBeCloseTo(intent(presetById('varial-flip').inputs).front.yaw + STANCE.front.yawFrontside * 0.45 * 0.95, 9);
    expect(intent(fs).front.yaw).toBeCloseTo(intent(shove).front.yaw, 9);
    // The heelflip side keeps the backside leans, mirrored: a varial heelflip's kick is not the forward one.
    const vh = flickMove(varialHeel);
    expect(vh.z).toBeLessThan(-0.05);
    expect(Math.abs(vh.x / vh.z)).toBeLessThan(hd.x / hd.z);
    // Continuous through scoop 0 and held past the varial point for a harder frontside scoop.
    const plus = flickMove({ ...kickflip, scoop: 0.01 });
    const minus = flickMove({ ...kickflip, scoop: -0.01 });
    expect(Math.hypot(plus.x - minus.x, plus.z - minus.z)).toBeLessThan(0.003);
    const hard360 = flickMove({ ...kickflip, scoop: -1.9 });
    expect(hard360.x / hard360.z).toBeGreaterThan(va.x / va.z * 1.5);
    // Both stances: regular is the mirror along X.
    const g = feetPoseAt(ollie, computeFlight(hard), 0.15, 'goofy').front;
    const r = feetPoseAt(ollie, computeFlight(hard), 0.15, 'regular').front;
    expect(r.x).toBeCloseTo(-g.x, 9);
    expect(r.z).toBeCloseTo(g.z, 9);
  });

  it('keeps the bail stepping off to the heel side for failed mirror tricks', () => {
    for (const inputs of [heel, fs, hard, varialHeel]) {
      const bail = feetPoseAt(ollie, computeFlight({ ...inputs, pop: 0.15 }), 1);
      expect(bail.front.z).toBeGreaterThan(RAIL_Z);
      expect(bail.back.z).toBeGreaterThan(RAIL_Z);
    }
  });

  it('stays a heelflip and a frontside scoop for a regular rider: toward the toe side (-Z), nose at -X', () => {
    const a = onDeck(heel, MOTION.flick.start, 'regular').front;
    const b = onDeck(heel, MOTION.flick.end, 'regular').front;
    expect(b.x - a.x).toBeLessThan(-0.05);
    expect(b.z - a.z).toBeLessThan(-0.1);
    expect(b.z).toBeLessThan(-RAIL_Z);
    const reg = (inputs: TrickInputs, u: number) => feetPoseAt(ollie, computeFlight(inputs), u, 'regular');
    expect(reg(fs, scoopEnd(fs)).back.z).toBeLessThan(reg(fs, 0).back.z - 0.05);
    expect(reg(fs, 0).back.x).toBeGreaterThan(0.25);
  });

  it('draws the heelflip cue off the toe-side corner and the frontside scoop toward -Z, in front of the back shoe', () => {
    const h = motionCues(heel);
    expect(last(h.front).z).toBeLessThan(-RAIL_Z);
    expect(exit(h.front).x).toBeGreaterThan(0.3);
    expect(exit(h.front).z).toBeLessThan(-0.5);
    expect(h.scoop).toEqual([]);
    const c = motionCues(fs);
    expect(c.scoop.length).toBeGreaterThan(2);
    let length = 0;
    for (let i = 1; i < c.scoop.length; i++) {
      const p = c.scoop[i]!;
      const q = c.scoop[i - 1]!;
      expect(p.z).toBeLessThan(q.z);
      length += Math.hypot(p.x - q.x, p.z - q.z);
    }
    expect(length).toBeCloseTo(scoopDistance(fs) * MOTION.scoop.dir.z, 4);
    for (const p of c.scoop) {
      expect(p.x).toBeLessThan(-0.1);
      // On the nose side of the back shoe, where the shoe does not hide it.
      expect(p.x).toBeGreaterThan(c.press.x + FOOT.width / 2 + CUES.scoopGap - 0.02);
    }
    // Regular mirrors the cue across the board's long axis, as for the kickflip.
    const r = motionCues(fs, 'regular');
    expect(last(r.scoop).z).toBeGreaterThan(first(r.scoop).z);
    expect(last(motionCues(heel, 'regular').front).z).toBeGreaterThan(RAIL_Z);
  });
});
