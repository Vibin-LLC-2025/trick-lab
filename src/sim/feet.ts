// Feet from the inputs, pure. The two shoes are driven by pop, flick and
// scoop (not by the recognized trick), so a weak flick shows a front foot that
// barely leaves the rail, a hard scoop swings the back foot wide, and a low pop
// keeps the feet near the deck. No React, no three, no store. Units: metres,
// seconds, degrees. See docs/BRIEF-FEET.md and ADR-17.
//
// Frame: the board's rest frame. Origin at the deck centre at rest (the board
// group's origin when it sits on the pad), long axis X with the nose at +X,
// up +Y, toe side -Z, heel side +Z. The rider is goofy (ADR-24): facing -Z
// with the nose on their right, so the front foot is the right shoe and the
// back foot the left. The numbers are the regular-stance research
// (docs/RESEARCH-FEET.md) mirrored across z = 0: every z and every yaw is
// negated; descriptions relative to the rider (heel side, outside edge,
// backside) are unchanged. In the air the feet do not rotate with the board:
// after the pop they tuck up above a spinning board, then come down onto it
// in the catch (PHASE.catch in flight.ts, ADR-36), where the bolts are if the
// trick lands, and ride it down with the board's last settling carried onto
// them. A failed trick is a bail: the feet step off to the heel side (+Z) and
// land on the pad.
//
// Regular stance (ADR-25, 2026-11-04) is a last step on top of the goofy
// numbers: the camera stays on the heel side, the board turns 180 degrees on
// the pad (nose at -X) and both feet mirror along the board's length, x to -x
// and yaw to 180 - yaw. The front foot is then the left shoe, at the nose
// (-X), toes still at the toe side (-Z); everything toward the heels still
// goes toward +Z.
import { deckTiltDeg, footLift } from './boardVolume';
import { CATCH, computeFlight, PHASE, writePose, type Flight, type Pose, type TrickInputs } from './flight';
import { isLanded, sketchAmount } from './landing';

/**
 * Which foot leads (ADR-24, ADR-25). Goofy: right foot forward, nose at +X.
 * Regular: left foot forward, nose at -X. The model computes in the goofy
 * frame and mirrors along X for regular. A view preference, defined here so
 * the sim imports nothing from the store.
 */
export type Stance = 'goofy' | 'regular';
export const STANCES: readonly Stance[] = ['goofy', 'regular'];
export const isStance = (v: unknown): v is Stance => STANCES.includes(v as Stance);

/**
 * Shoe dimensions, which the shoe asset (src/asset/shoeSpec.ts) must match: a
 * test in src/asset asserts it. Length along the shoe's own X (toe at +X),
 * width along its Z, sole height the thickness of the sole under the foot.
 */
export const FOOT = { length: 0.285, width: 0.105, soleHeight: 0.024 } as const;

/**
 * Pad level in this frame: minus the board's rest height (REST_Y in
 * src/asset/spec.ts). Pinned by feet.test.ts so the two cannot drift.
 */
export const PAD_Y = -0.08425;
/** Sole bottom on the grip over the bolts (deck half thickness plus a little concave). */
export const DECK_TOP = 0.0095;
/** Sole bottom on the tail pocket (the kick lifts it). */
export const TAIL_TOP = 0.0185;
/** Half width of the deck, for "the heel is over the edge" (OUTLINE.width / 2). */
export const RAIL_Z = 0.1016;
/** Bolt pattern centre, where the feet land (TRUCK.centerX). */
export const BOLTS_X = 0.208;

/**
 * One shoe. Position of the sole's bottom centre; rotation as three Euler
 * 'YZX' (yaw about Y, then pitch about the shoe's Z, then roll about the
 * shoe's own long axis).
 */
export interface FootPose {
  x: number;
  y: number;
  z: number;
  /**
   * Degrees about +Y. 0 points the toe at the nose; +90 points it at the toe
   * side, -Z (across the board): three's Y rotation takes the shoe's +X to
   * (cos yaw, 0, -sin yaw).
   */
  yaw: number;
  /** Degrees about the shoe's own Z after the yaw. Negative is toes down (heel raised). */
  pitch: number;
  /**
   * Degrees about the shoe's own long axis. Positive banks the shoe onto its
   * outside (little-toe) edge, the edge that drags up the grip in the slide
   * and leaves the board in a kickflip; negative lifts that edge (the back
   * shoe on the tail kick). FlightDriver maps it per shoe, since the back
   * shoe is a mirrored right shoe.
   */
  roll: number;
}

/**
 * Goofy stance (ADR-24): the front foot is the right shoe, the back foot the
 * left. Regular (ADR-25): the front foot is the left shoe, the back the right.
 */
export interface FeetPose {
  front: FootPose;
  back: FootPose;
}

export const newFeetPose = (): FeetPose => ({
  front: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
  back: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
});

/**
 * Stance numbers (2026-11-04 research pass, docs/RESEARCH-FEET.md 5.1). Each
 * is a base value for an ollie plus a term per unit of normalised flick (f)
 * and scoop (s), clamped to 1 for the stance, fitted to the coaching sources'
 * per-trick placements, mirrored to goofy (ADR-24): kickflip front foot 45
 * degrees just behind the bolts with the heel over the heel-side rail, 360
 * flip front foot back toward the middle, back foot on the ball across the
 * tail with the heel up, moving toward the toe-side edge for a shove.
 */
export const STANCE = {
  /** Flick and scoop are normalised against 2 rev/s (the presets use 1.9). */
  rateScale: 2,
  rateMax: 1.5,
  front: {
    x: 0.1,
    xFlick: 0.03,
    /** Per unit of scoop either way (backside or frontside, ADR-30): the 360 flip fit. */
    xScoop: -0.03,
    z: 0.01,
    zFlick: 0.03,
    /** Across the board (ollie) at flick 0, turned toward the nose as the flick grows, a little less with scoop. */
    yawAcross: 87,
    yawFlick: -44,
    yawScoop: 6,
    /**
     * Heelflip setup (ADR-30, 2026-11-04; RESEARCH-FEET.md 1.4 and the 5.1
     * row "Heelflip", z and yaw mirrored to goofy): per unit of heelflip
     * factor, toward x 0.11 and yaw 88, still across the board. zHeel was
     * -0.03 (centre z -0.02 at the preset); ADR-34 (2026-11-04) moved it to
     * -0.045, centre z -0.033: the ball of the foot (6 cm ahead of the
     * centre) on the toe-side rail, the toes 7 cm over it, the heel at the
     * heel-side rail. A visual candidate, a touch past the research's
     * estimated -0.01 to -0.03, so the heel has the deck to sweep across.
     */
    xHeel: 0.01,
    zHeel: -0.045,
    yawHeel: 1,
    /**
     * Frontside scoop (RESEARCH-FEET.md 1.6 and the 5.1 row "Frontside
     * shove-it", z mirrored): the front toe hangs off the toe side a little,
     * z +0.01 to -0.01 over the preset's 0.45 factor. x and yaw use the
     * scoop terms above by magnitude.
     */
    zFrontside: -0.04,
    /**
     * Kickflip with a frontside scoop (ADR-35, 2026-11-04): the toes point
     * a little more toward the nose, per unit of frontside factor times
     * kickflip factor (48 to about 37 degrees at flick 1.9, scoop -0.9),
     * written for the hardflip from memory (est., RESEARCH-FEET.md item 16).
     * ADR-41 (2026-11-05) removed the hardflip's name and preset; the
     * sources disagree on this angle, and it is kept unchanged so the
     * combination still on the sliders does not move. A frontside shove-it
     * alone and the heelflip side are untouched.
     */
    yawFrontside: -25,
  },
  back: {
    /** Tail pocket. */
    x: -0.31,
    xFlick: -0.02,
    xScoop: 0.01,
    /** Ball near the centreline, heel over the heel side; toward the toe-side edge with scoop. */
    z: 0.03,
    zFlick: -0.02,
    zScoop: -0.06,
    /** Toward the toe side (-Z) no further than this. */
    zMax: 0.03,
    /** Perpendicular, toes turned a touch toward the tail; no turn with a backside scoop (no source supports one). */
    yaw: 95,
    /**
     * Heelflip back foot (RESEARCH-FEET.md 1.4, row "Heelflip": x -0.32,
     * z +0.03 goofy, yaw 100, "heel turned a few degrees toward the front
     * foot"): per unit of heelflip factor. z stays at the heel-side 0.03.
     */
    xHeel: -0.01,
    yawHeel: 5,
    /**
     * Frontside back foot (RESEARCH-FEET.md 1.6, row "Frontside shove-it":
     * x -0.33, z +0.04 goofy, yaw 90; the foot "hangs off the heel side of
     * the tail"), fitted per unit of frontside factor so the preset's 0.45
     * lands near those numbers: further back, toward the heel side, square
     * across.
     */
    xFrontside: -0.04,
    zFrontside: 0.02,
    yawFrontside: -10,
    /**
     * On the ball, heel up: degrees toes down about the shoe's own Z, on top of
     * the tail's tilt. Was -12 before the clearance (ADR-29, 2026-11-04): on a
     * rigid sole whose toes reach past the toe-side rail, toes down pivots the
     * shoe on that rail, so -12 floated the ball 2 cm off the pocket. At -4
     * the sole bridges the concave from rail to rail with the heel about 1 cm
     * up; the ball is still about 1 to 2 cm above the pocket's centreline
     * (the concave, and the primitive's straight kick, are under it).
     */
    pitch: -4,
    /*
     * No fixed roll (was -15): writeStance tilts the shoe by the tail kick's
     * own slope across the sole's width at its x, through the yaw, the way
     * rideDeck maps a deck tilt (about -11 to -14 degrees of roll, so the
     * outside edge toward the tail sits higher, and a degree of toes up).
     */
  },
} as const;

/**
 * Where each foot lands, sole bottom above the deck centre: on the grip over
 * the bolts, across the board (yaw yawAcross), resting on the rails of the
 * concave the way the clearance (ADR-29) rests a sole, so a foot on the board
 * after the catch needs no lift (ADR-36). `square` for a board that ends with
 * its nose where it started, `half` for one turned half round (the front foot
 * then stands over the tail's bolts). Computed once, at import.
 */
const landHeight = (x: number, edge: 1 | -1, yaw: number) =>
  DECK_TOP + footLift({ x, y: DECK_TOP, z: 0, yaw: STANCE.front.yawAcross, pitch: 0, roll: 0 }, edge, { y: 0, roll: 0, yaw, pitch: 0 });
export const LAND_Y = {
  front: { square: landHeight(BOLTS_X, 1, 0), half: landHeight(BOLTS_X, 1, 180) },
  back: { square: landHeight(-BOLTS_X, -1, 0), half: landHeight(-BOLTS_X, -1, 180) },
} as const;

/**
 * A sketchy landing (ADR-63): the shoes come down off the bolts, toward the
 * middle of the board, by these distances at the edge of landing
 * (sketchAmount 1), the front foot further than the back, so the stance is
 * narrow and uneven. Nothing for a clean landing, which keeps the motion
 * pinned in feet.pinned.test.ts. Between the kicks the deck is the same along
 * its length, so the shoes stay on the grip.
 */
export const SKETCH = { front: 0.06, back: 0.035 } as const;
/**
 * The resting height along each foot's sketchy slide, as LAND_Y is at the
 * bolts: a table from the bolts (index 0, LAND_Y exactly) to the furthest
 * spot. A table and not two ends, because the height is not a straight line:
 * a sole over the bolts rests partly on the start of the kick, 1.2 mm higher
 * than on the flat a few centimetres in. Computed once, at import; read by
 * sketchHeight without allocating.
 */
const SKETCH_STEPS = 12;
const sketchTable = (x: number, toward: 1 | -1, reach: number, edge: 1 | -1, yaw: number) =>
  Float64Array.from({ length: SKETCH_STEPS + 1 }, (_, i) => landHeight(x + (toward * reach * i) / SKETCH_STEPS, edge, yaw));
const SKETCH_Y = {
  front: { square: sketchTable(BOLTS_X, -1, SKETCH.front, 1, 0), half: sketchTable(BOLTS_X, -1, SKETCH.front, 1, 180) },
  back: { square: sketchTable(-BOLTS_X, 1, SKETCH.back, -1, 0), half: sketchTable(-BOLTS_X, 1, SKETCH.back, -1, 180) },
} as const;
/** The resting height at sketch amount `s` (0 to 1) from one of the tables above. `s` 0 is the bolts' own height, exactly. */
function sketchHeight(table: Float64Array, s: number): number {
  const f = s * SKETCH_STEPS;
  const i = Math.min(SKETCH_STEPS - 1, Math.floor(f));
  return table[i]! + (table[i + 1]! - table[i]!) * (f - i);
}

/** When each foot is back on the board (ADR-36): defined in flight.ts beside PHASE (ADR-73). */
export { CATCH };

/**
 * Motion numbers. Windows are fractions of the airtime; distances metres.
 * Ollie timing from the TU Delft video analysis (front foot at the nose by
 * 0.16); flick and scoop "almost immediately" after the pop. Since ADR-36
 * the gather, the tuck and the bail are timed against the board's catch.
 */
export const MOTION = {
  /**
   * Back foot snaps the tail: heel further up and a small press down. The
   * heel lift was -10 degrees before the clearance (ADR-29): the shoe pivots
   * on the toe-side rail, so every degree lifts the ball 2 mm off the tail.
   */
  pop: { end: 0.05, pitch: -5, press: 0.01 },
  /**
   * Front foot drags up the grip on its outside edge: 0.16 m by 0.16 for an
   * ollie, shorter and quicker as the flick grows. A heelflip slides about
   * 0.08 m (RESEARCH-FEET.md 5.1 row "Heelflip", ADR-30): distanceHeel per
   * unit of heelflip factor; its timing is the kickflip's.
   */
  slide: { distance: 0.16, distanceFlick: -0.06, distanceHeel: -0.08, min: 0.04, end: 0.16, endFlick: -0.06, lift: 0.1, roll: 30 },
  /**
   * Front foot leaves the heel-side corner of the nose, forward, out and up
   * ("up and out, not down"): 0.10 m per rev/s, less when the scoop does part
   * of the work. Direction leans forward for a varial and out for a 360 flip.
   * A heelflip (flick < 0, ADR-30, reworked in ADR-34, 2026-11-04) kicks
   * forward and out off the toe-side corner of the nose, heel last
   * (RESEARCH-FEET.md 1.4): the HEEL is the moving point. It starts at the
   * heel-side rail and sweeps across the deck to the toe-side pocket along
   * `heelDir` (z negated like every heelflip z), `heelReach` times the
   * flick distance (27 cm at the preset against the kickflip's 19: the heel
   * crosses the whole deck where the little toe crosses half of it), with
   * the toes up and the heel down (heelPitch, degrees toes up at the peak
   * of the kick, an estimate: the sources say "heel last" without an angle)
   * instead of the kickflip's roll onto the outside edge. The sole centre
   * follows from the heel and the turned yaw (writeDeckFeet).
   */
  flick: {
    start: 0.05,
    end: 0.22,
    perRev: 0.1,
    scoopRelief: 0.35,
    heelPitch: 20,
    dir: { x: 0.6, y: 0.3, z: 0.74 },
    heelDir: { x: 0.55, y: 0.3, z: 0.78 },
    heelReach: 1.4,
    varial: { x: 0.8, y: 0.3, z: 0.52 },
    tre: { x: 0.35, y: 0.35, z: 0.87 },
    /**
     * Frontside lean (ADR-35): a kickflip with a frontside scoop kicks
     * straight forward off the nose rather than out to the side, reached at
     * `varialAt` and held for harder scoops (no frontside counterpart of the
     * tre lean). Named for the hardflip, which ADR-41 (2026-11-05) removed:
     * most coaching sources flick it sideways and up instead
     * (docs/research/2026-11-05/hardflip.md), so this is unverified, kept
     * unchanged until reference data. The heelflip side keeps the varial
     * lean, z negated, pending its own evidence.
     */
    hardflip: { x: 0.9, y: 0.3, z: 0.3 },
    /** Scoop factor where the varial lean peaks and where the full 360 flip lean is reached. */
    varialAt: 0.45,
    treAt: 0.95,
    /**
     * Through the flick the toes turn toward where the foot is going, this
     * fraction of the way from the stance yaw to the flick direction's
     * heading, per unit of flick factor. Kickflip (ADR-33, 2026-11-04): 45
     * to about -19 degrees at the preset, so the little toe is the end that
     * crosses the heel-side pocket of the nose and leads out while the heel
     * trails over the deck (with no turn the sole stayed diagonal, the heel
     * swung 14 cm past the rail and the toe stayed inside it, which read as
     * a heelflip). Heelflip (ADR-34): 88 to about 66, toes forward and out
     * along the kick, heel last. A visual estimate (RESEARCH-FEET.md 1.3 and
     * 1.4 give the contact, not the angle).
     */
    turn: 0.7,
  },
  /**
   * Back foot scoops the tail behind the heels (backside): back, down a
   * little, toward the heel side (+Z). Frontside (scoop < 0, ADR-30) slices
   * it forward in front of the toes, the same numbers with z negated
   * (RESEARCH-FEET.md 1.6, (0, -0.3, +0.95) in its frame), the foot flat.
   */
  scoop:{ perRev: 0.1, max: 0.25, end: 0.08, endScoop: 0.04, dir: { x: 0, y: -0.3, z: 0.95 } },
  /**
   * Both feet gather over the bolts for the catch (ADR-36): x, z and yaw
   * reach their landing values at each foot's catch (CATCH), from no earlier
   * than 0.2 before the catch starts, so the feet do not line up over a board
   * that is still upside down (was 0.35 to 0.75 for both feet).
   */
  gather: { start: PHASE.catch.start - 0.2, front: CATCH.front, back: CATCH.back },
  /**
   * The tuck's amplitude above the board: an ollie rides the board, flips
   * and shoves clear it (hoverHeight). Peaks 12 cm for the hardest inputs.
   */
  hover: { base: 0.01, perFactor: 0.07, max: 0.12 },
  /**
   * The tuck (ADR-36): each foot rises from its release (front: the end of
   * the flick; back: the end of the pop, or of the scoop if any) to its peak
   * here, fast at first (ease-out), then comes down slowly at first and fast
   * at the end (ease-in) to reach the board at its catch: the stomp. The
   * peaks are starting values (RESEARCH-FEET.md section 4 item 11).
   */
  tuck: { frontPeak: 0.4, backPeak: 0.35 },
  /**
   * Bail (ADR-90): the feet step off to the heel side (+Z), each on its own
   * time, the front foot first (`front.end`), the back one a little later
   * (`back.start`) and down as the board lands. Each step is a human one,
   * not a slide along a line: out of its tuck the foot drops to the pad
   * faster and faster as it falls (`fall`), the toes reaching down (`reach`
   * degrees, toes down) and flat again as it plants. The stance opens as the rider
   * gets off: the feet a little wider (`spread` metres along the deck each)
   * and turned toward the nose (`frontYaw`, `backYaw`, from yawAcross), the
   * way a rider turns to run a bail out. A foot reaches at most `ground`
   * metres below where it would stand on the board, so it touches the pad
   * before the board only when the board is that low: from a high pop the
   * rider comes down with the board. Until ADR-90 both feet went in one
   * straight line together, flat and square to the board, on one smoothstep
   * from the catch's start (was 0.62 until ADR-36).
   */
  bail: {
    start: PHASE.catch.start,
    frontZ: 0.26,
    backZ: 0.24,
    front: { end: 0.93 },
    back: { start: PHASE.catch.start + 0.06 },
    reach: -16,
    spread: 0.03,
    frontYaw: 68,
    backYaw: 76,
    ground: 0.06,
  },
} as const;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
/** 0 before a, 1 after b, smooth between. */
const smooth = (a: number, b: number, u: number) => {
  const s = clamp01((u - a) / (b - a));
  return s * s * (3 - 2 * s);
};
/** 0 at a and b, 1 in the middle. */
const bump = (a: number, b: number, u: number) => Math.sin(Math.PI * clamp01((u - a) / (b - a)));
/** A fall, 0 to 1: starts at rest and speeds up, still moving at the end (t^2 (2 - t): the foot plants, it does not hover down). */
const fall = (t: number) => t * t * (2 - t);
/** A bailing foot's own step off the board (ADR-90), 0 to 1 over its part of the flight (MOTION.bail). */
function bailStep(p: number, foot: 'front' | 'back'): number {
  const B = MOTION.bail;
  return foot === 'front' ? clamp01((p - B.start) / (B.front.end - B.start)) : clamp01((p - B.back.start) / (1 - B.back.start));
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Flick or scoop rate as a 0 to 1.5 factor: the magnitude, whichever way it
 * turns (ADR-30). The sign picks the direction: see the split below.
 */
export const rateFactor = (rate: number) => Math.min(STANCE.rateMax, Math.abs(rate) / STANCE.rateScale);

/**
 * The signed inputs split into one 0 to 1 factor per direction (ADR-30),
 * only one of each pair non-zero: kick (kickflip) and heel (heelflip) from the
 * flick, back (backside) and front (frontside) from the scoop. `flick` and
 * `scoop` are the magnitudes. Writes into `out`; allocation-free.
 */
interface Rates {
  flick: number;
  kick: number;
  heel: number;
  scoop: number;
  back: number;
  front: number;
}
function writeRates(out: Rates, inputs: TrickInputs, cap: number): Rates {
  out.flick = Math.min(cap, rateFactor(inputs.flick));
  out.kick = inputs.flick > 0 ? out.flick : 0;
  out.heel = inputs.flick < 0 ? out.flick : 0;
  out.scoop = Math.min(cap, rateFactor(inputs.scoop));
  out.back = inputs.scoop > 0 ? out.scoop : 0;
  out.front = inputs.scoop < 0 ? out.scoop : 0;
  return out;
}
const stanceRates: Rates = { flick: 0, kick: 0, heel: 0, scoop: 0, back: 0, front: 0 };
const motionRates: Rates = { flick: 0, kick: 0, heel: 0, scoop: 0, back: 0, front: 0 };

/** +1 for a kickflip or a backside scoop (and at 0), -1 for a heelflip or a frontside scoop. */
const sideOf = (rate: number) => (rate < 0 ? -1 : 1);

/** Where the feet stand before the pop, from the inputs. Writes into `out`. */
export function writeStance(out: FeetPose, inputs: TrickInputs): FeetPose {
  // f and s are the kickflip and backside factors, as before ADR-30; the
  // heelflip (h) and frontside (r) terms come last so a positive input gives
  // the same numbers to the last bit.
  const { kick: f, back: s, scoop: sAny, heel: h, front: r } = writeRates(stanceRates, inputs, 1);
  const F = STANCE.front;
  const B = STANCE.back;
  out.front.x = F.x + F.xFlick * f + F.xScoop * sAny + F.xHeel * h;
  out.front.y = DECK_TOP;
  out.front.z = F.z + F.zFlick * f + F.zHeel * h + F.zFrontside * r;
  out.front.yaw = F.yawAcross + F.yawFlick * f + F.yawScoop * sAny + F.yawHeel * h + F.yawFrontside * r * f;
  out.front.pitch = 0;
  out.front.roll = 0;
  out.back.x = B.x + B.xFlick * f + B.xScoop * s + B.xHeel * h + B.xFrontside * r;
  out.back.y = TAIL_TOP;
  out.back.z = Math.max(-B.zMax, B.z + B.zFlick * f + B.zScoop * s + B.zFrontside * r);
  out.back.yaw = B.yaw + B.yawHeel * h + B.yawFrontside * r;
  // The tail kick under the sole tilts the shoe like a nose-down deck (the
  // mapping rideDeck uses): about the shoe's own axes through its yaw.
  const kick = deckTiltDeg(out.back.x, RAIL_Z, FOOT.width) * D2R;
  const yaw = out.back.yaw * D2R;
  out.back.pitch = B.pitch + (kick * Math.cos(yaw)) / D2R;
  out.back.roll = (kick * Math.sin(yaw)) / D2R;
  return out;
}

/**
 * How far the flicking point of the front foot moves in the kick, metres: the
 * sole centre of a kickflip (0.19 m at the preset), the heel of a heelflip
 * (`heelReach` times that, 0.27 m at the preset, ADR-34). A magnitude.
 */
export const flickDistance = (inputs: TrickInputs) =>
  MOTION.flick.perRev *
  Math.abs(inputs.flick) *
  (1 - MOTION.flick.scoopRelief * Math.min(1, rateFactor(inputs.scoop))) *
  (inputs.flick < 0 ? MOTION.flick.heelReach : 1);

/** Scoop length in metres for these inputs (0.09 m for both pop shove-it presets): a magnitude, either direction. */
export const scoopDistance = (inputs: TrickInputs) => Math.min(MOTION.scoop.max, MOTION.scoop.perRev * Math.abs(inputs.scoop));

/** Peak of the tuck above the board for these inputs, metres. */
export const hoverHeight = (inputs: TrickInputs) =>
  Math.min(
    MOTION.hover.max,
    MOTION.hover.base + MOTION.hover.perFactor * Math.max(rateFactor(inputs.flick), rateFactor(inputs.scoop)),
  );

/** When the back foot's scoop ends, a fraction of the airtime (0.08 with no scoop, up to 0.12). */
const scoopEndAt = (inputs: TrickInputs) => MOTION.scoop.end + MOTION.scoop.endScoop * Math.min(1, rateFactor(inputs.scoop));

/**
 * When a foot leaves the board and its tuck starts (ADR-36): the front foot
 * at the end of its flick, the back foot at the end of the pop, or of the
 * scoop when there is one.
 */
export const releaseAt = (foot: 'front' | 'back', inputs: TrickInputs) =>
  foot === 'front' ? MOTION.flick.end : inputs.scoop !== 0 ? scoopEndAt(inputs) : MOTION.pop.end;

/**
 * The tuck's shape, 0 to 1 (ADR-36): 0 up to `release`, an ease-out rise to
 * 1 at `peak`, an ease-in descent to 0 at `catchAt`, then 0. Continuous, with
 * a level top; the descent arrives at its steepest, which is the stomp.
 */
export function tuckShape(u: number, release: number, peak: number, catchAt: number): number {
  if (u <= release || u >= catchAt) return 0;
  if (u <= peak) {
    const s = 1 - (u - release) / (peak - release);
    return 1 - s * s;
  }
  const s = (u - peak) / (catchAt - peak);
  return 1 - s * s;
}

/** How far a foot is tucked up above the board at progress u, metres (ADR-36). Allocation-free. */
export const tuckHeight = (foot: 'front' | 'back', inputs: TrickInputs, u: number) =>
  hoverHeight(inputs) *
  (foot === 'front'
    ? tuckShape(u, releaseAt('front', inputs), MOTION.tuck.frontPeak, CATCH.front)
    : tuckShape(u, releaseAt('back', inputs), MOTION.tuck.backPeak, CATCH.back));

/**
 * Unit flick direction for a scoop factor (a magnitude), written into `out`
 * (x, y, z): the kickflip direction, leaning forward toward a varial and out
 * toward a 360 flip; with a frontside scoop (`frontside`) the kickflip leans
 * straight forward instead (ADR-35, unverified, ADR-41). `side` -1 is the heelflip
 * (ADR-30, ADR-34): the heel's kick direction with the backside leans
 * whichever way the scoop turns, off the toe-side corner, z negated.
 * Allocation-free: only constant vectors are picked.
 */
function flickDir(s: number, side: 1 | -1, frontside: boolean, out: { x: number; y: number; z: number }) {
  const F = MOTION.flick;
  const base = side < 0 ? F.heelDir : F.dir;
  const hard = side > 0 && frontside;
  const tre = hard ? 0 : clamp01((s - F.varialAt) / (F.treAt - F.varialAt));
  const varial = clamp01(s / F.varialAt) * (1 - tre);
  const lean = hard ? F.hardflip : F.varial;
  out.x = base.x + (lean.x - base.x) * varial + (F.tre.x - base.x) * tre;
  out.y = base.y + (lean.y - base.y) * varial + (F.tre.y - base.y) * tre;
  out.z = base.z + (lean.z - base.z) * varial + (F.tre.z - base.z) * tre;
  const n = Math.hypot(out.x, out.y, out.z);
  out.x /= n;
  out.y /= n;
  out.z = (out.z / n) * side;
}
const dir = { x: 0, y: 0, z: 0 };

/**
 * Writes both feet at progress u (0 to 1 of the airtime) into `out` and
 * returns it. Allocation-free so the render loop can call it every frame.
 * With no flight the feet stand in the stance for the live inputs; with a
 * flight they follow the flight's own inputs, so moving a slider during
 * playback does not move the feet of the trick in the air. `stance` mirrors
 * the result for a regular rider (see the top of this file).
 */
export function writeFeetPose(out: FeetPose, inputs: TrickInputs, flight: Flight | null, u: number, stance: Stance = 'goofy'): FeetPose {
  if (flight) writeFlightFeet(out, flight, u);
  else writeStance(out, inputs);
  clearBoard(out, flight, u);
  if (stance === 'regular') {
    mirrorFoot(out.front);
    mirrorFoot(out.back);
  }
  return out;
}

/**
 * Goofy to regular, in place: x to -x along the board's length, and the toe
 * direction (cos yaw, 0, -sin yaw) mirrored the same way, which is yaw to
 * 180 - yaw, kept in (-180, 180]. Height, z, pitch and roll are unchanged:
 * roll means "onto the outside edge", which FlightDriver maps per shoe.
 */
export function mirrorFoot(f: FootPose) {
  f.x = -f.x;
  let yaw = 180 - f.yaw;
  if (yaw > 180) yaw -= 360;
  else if (yaw <= -180) yaw += 360;
  f.yaw = yaw;
}

/** The board's pose for the feet, reused (allocation-free). */
const board: Pose = { y: 0, roll: 0, yaw: 0, pitch: 0 };
const D2R = Math.PI / 180;

/**
 * The clearance step (ADR-29, 2026-11-04), goofy frame, before the regular
 * mirror: each shoe rises straight up by the least amount that puts its whole
 * sole 2 mm above the board in the board's pose at this progress (rest with
 * no flight), so the rest pose stands on the rails and the kicks and a
 * spinning deck never passes through a shoe. It only adds height. Progress 0
 * of a flight is the rest pose, so it still equals the stance exactly.
 */
function clearBoard(out: FeetPose, flight: Flight | null, u: number) {
  const p = clamp01(u);
  writePose(board, flight, p);
  // A bailing foot steps down beside the board: its shoulder narrows with the bail.
  const narrow = flight && !isLanded(flight.rollTotal, flight.yawTotal) ? smooth(MOTION.bail.start, 1, p) : 0;
  out.front.y += footLift(out.front, 1, board, narrow);
  out.back.y += footLift(out.back, -1, board, narrow);
}

/**
 * The feet as the model means them, before the clearance (ADR-29): the same
 * as writeFeetPose without the lift. For the tests that measure the model's
 * own motion against the deck.
 */
export function writeFeetIntent(out: FeetPose, inputs: TrickInputs, flight: Flight | null, u: number, stance: Stance = 'goofy'): FeetPose {
  if (flight) writeFlightFeet(out, flight, u);
  else writeStance(out, inputs);
  if (stance === 'regular') {
    mirrorFoot(out.front);
    mirrorFoot(out.back);
  }
  return out;
}

/**
 * Both feet through a flight, goofy frame. The motion is built against the
 * deck (x along it, y above its centre), then carried by the board's pitch
 * and rise (ADR-27): during the pop the deck tilts nose up about its centre
 * while it pivots on the tail, so the back shoe rides the tail down to the pad
 * and the front shoe rides the rising deck under it, and both soles tilt with
 * it. From LEVEL_BY the board is level and this is a plain lift, plus each
 * foot's tuck (ADR-36). In a landed trick each foot then rides the board's
 * last settling from the catch (rideCatch).
 */
function writeFlightFeet(out: FeetPose, flight: Flight, u: number): FeetPose {
  writeDeckFeet(out, flight, u);
  const p = clamp01(u);
  writePose(board, flight, p);
  const i = flight.inputs;
  const t = board.pitch * D2R;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  rideDeck(out.front, c, sn, board.y + tuckHeight('front', i, p), board.pitch, 1);
  rideDeck(out.back, c, sn, board.y + tuckHeight('back', i, p), board.pitch, -1);
  // A bailing foot reaches below the board for the pad as it steps off
  // (ADR-90), by up to MOTION.bail.ground: so from a low pop the front foot
  // is down before the board, and whatever the board does (a rail or a kick
  // holds it up a couple of centimetres, ADR-68) each foot ends on the pad.
  // Level by then (pitch 0), so it is a straight drop. 0 for every landing.
  if (!flight.landed && p >= 0.5) {
    const G = MOTION.bail.ground;
    out.front.y -= Math.min(board.y + tuckHeight('front', i, p), G) * fall(bailStep(p, 'front'));
    out.back.y -= Math.min(board.y + tuckHeight('back', i, p), G) * fall(bailStep(p, 'back'));
  }
  if (isLanded(flight.rollTotal, flight.yawTotal)) {
    rideCatch(out.front, flight, p, CATCH.front, 1);
    rideCatch(out.back, flight, p, CATCH.back, -1);
  }
  return out;
}

/**
 * The catch (ADR-36): a landed board's roll and yaw settle onto the whole
 * turn over PHASE.catch while the feet come down on it, so a foot on the grip
 * moves with that last settling. The board's residual (its pose minus its
 * target) is carried onto the foot, weighted from 0 at the catch's start to 1
 * at this foot's catch, so nothing jumps: the foot's position turns about the
 * board centre, roll about X then yaw about Y, and the sole tilts the way
 * rideDeck tilts it for a pitch (for a shoe whose toe points along
 * (cos yaw, 0, -sin yaw), a turn about world X is a pitch of roll * sin yaw
 * and a turn about its own long axis of roll * cos yaw). With the board turned
 * half round the residual roll is about -X in the rest frame. From
 * PHASE.catch.end the residual is 0 and the foot sits where the model put it.
 */
function rideCatch(f: FootPose, flight: Flight, p: number, catchAt: number, edge: 1 | -1) {
  const w = smooth(PHASE.catch.start, catchAt, p);
  if (w === 0 || p >= PHASE.catch.end) return;
  const half = Math.round(Math.abs(flight.yawTarget) / 180) % 2 === 1;
  const roll = (board.roll - flight.rollTarget) * w * (half ? -1 : 1);
  const yaw = (board.yaw - flight.yawTarget) * w;
  const cr = Math.cos(roll * D2R);
  const sr = Math.sin(roll * D2R);
  const cy = Math.cos(yaw * D2R);
  const sy = Math.sin(yaw * D2R);
  const x = f.x;
  const y = f.y - board.y;
  const z = f.z;
  const y1 = y * cr - z * sr;
  const z1 = y * sr + z * cr;
  f.x = x * cy + z1 * sy;
  f.y = board.y + y1;
  f.z = -x * sy + z1 * cy;
  const own = f.yaw * D2R;
  f.pitch += roll * Math.sin(own);
  f.roll += roll * Math.cos(own) * edge;
  f.yaw += yaw;
}

/**
 * Carries one foot from the deck frame into the rest frame: rotate (x, y)
 * about the deck centre by the pitch, add the rise. The sole tilts with the
 * deck: a nose-up turn about world Z is, for a shoe whose toe points along
 * (cos yaw, 0, -sin yaw), a toe-up pitch of pitch * cos yaw and a turn about
 * the shoe's long axis of -pitch * sin yaw, which is a roll of that times the
 * shoe's outside-edge sign (goofy front +1, back -1, as in FlightDriver).
 */
function rideDeck(f: FootPose, c: number, sn: number, rise: number, pitch: number, edge: 1 | -1) {
  const x = f.x;
  const y = f.y;
  f.x = x * c - y * sn;
  f.y = rise + x * sn + y * c;
  const yaw = f.yaw * D2R;
  f.pitch += pitch * Math.cos(yaw);
  f.roll -= pitch * Math.sin(yaw) * edge;
}

/**
 * Both feet against the deck, goofy frame: x along the deck, y above the deck
 * centre (the pad is PAD_Y below it when level), z across. The model's own
 * motion with the board's rise and pitch left out; writeFlightFeet adds them.
 */
function writeDeckFeet(out: FeetPose, flight: Flight, u: number): FeetPose {
  const i = flight.inputs;
  writeStance(out, i);
  const p = clamp01(u);
  // Magnitudes drive the amounts, the signs the direction (ADR-30).
  const { flick: fc, kick, heel } = writeRates(motionRates, i, 1);
  const s = rateFactor(i.scoop);
  const M = MOTION;
  const landed = isLanded(flight.rollTotal, flight.yawTotal);
  const gatherFront = smooth(M.gather.start, M.gather.front, p);
  const gatherBack = smooth(M.gather.start, M.gather.back, p);
  // Each foot's own step off a bail (ADR-90), 0 to 1; 0 for a landing, which leaves every number below as it was.
  const B = M.bail;
  const stepF = landed ? 0 : bailStep(p, 'front');
  const stepB = landed ? 0 : bailStep(p, 'back');
  const easeF = smooth(0, 1, stepF);
  const easeB = smooth(0, 1, stepB);
  // On the grip over the bolts, resting on the rails (LAND_Y), of a board that ends square or half round.
  const half = landed && Math.round(Math.abs(flight.yawTarget) / 180) % 2 === 1;
  // A sketchy landing comes down off the bolts (ADR-63); 0 for a clean one, which leaves every number below as it was.
  const sketch = sketchAmount(flight.rollTotal, flight.yawTotal);
  const landFront = sketchHeight(half ? SKETCH_Y.front.half : SKETCH_Y.front.square, sketch);
  const landBack = sketchHeight(half ? SKETCH_Y.back.half : SKETCH_Y.back.square, sketch);

  // Front foot: slide up the grip on the outside edge, then flick out of the
  // heel-side corner of the nose (forward, out and up), then gather. A
  // heelflip slides less and kicks off the toe-side corner, heel last.
  const front = out.front;
  const S = M.slide;
  const slideEnd = S.end + S.endFlick * fc;
  const slide = smooth(0, slideEnd, p) * Math.max(S.min, S.distance + S.distanceFlick * kick + S.distanceHeel * heel);
  const kicking = smooth(M.flick.start, M.flick.end, p);
  const flick = kicking * flickDistance(i);
  flickDir(Math.min(1, s), sideOf(i.flick), i.scoop < 0, dir);
  // The toes turn toward the flick's heading (yaw 0 is the nose, positive the
  // toe side): a kickflip so the little toe leads off the heel-side pocket
  // (ADR-33), a heelflip so they point forward and out along the kick (ADR-34).
  const heading = Math.atan2(-dir.z, dir.x) / D2R;
  const turned = front.yaw + (heading - front.yaw) * M.flick.turn * fc * kicking;
  // A heelflip kicks with the heel (ADR-34): the kick moves the heel, half a
  // sole behind the centre, and the centre follows it round the turn. Zero
  // for a kickflip or an ollie (heel factor 0), so their paths are untouched.
  const pivot = heel * (FOOT.length / 2);
  const fx = front.x + slide + dir.x * flick + pivot * (Math.cos(turned * D2R) - Math.cos(front.yaw * D2R));
  const fy = DECK_TOP + slide * S.lift + dir.y * flick;
  const fz = front.z + dir.z * flick - pivot * (Math.sin(turned * D2R) - Math.sin(front.yaw * D2R));
  front.x = lerp(fx, BOLTS_X - SKETCH.front * sketch, gatherFront) + B.spread * easeF;
  front.z = lerp(lerp(fz, 0, gatherFront), B.frontZ, easeF);
  front.y = lerp(lerp(fy, landFront, gatherFront), PAD_Y, fall(stepF));
  front.yaw = lerp(lerp(turned, STANCE.front.yawAcross, gatherFront), B.frontYaw, easeF);
  front.roll = S.roll * bump(0, M.flick.end, p) * (1 - heel) * (1 - easeF);
  // Heelflip: toes up, heel down through the kick (0 for a kickflip or an ollie); a bailing foot's toes reach for the pad.
  front.pitch = M.flick.heelPitch * heel * bump(M.flick.start, M.flick.end, p) + B.reach * bump(0.15, 1, stepF);

  // Back foot: pop (heel up, a small press), scoop behind the heels
  // (backside) or forward in front of the toes (frontside), gather.
  const back = out.back;
  const scoopEnd = scoopEndAt(i);
  const scoop = smooth(0, scoopEnd, p) * scoopDistance(i);
  const press = M.pop.press * bump(0, M.pop.end, p);
  const bx = back.x + M.scoop.dir.x * scoop;
  const by = TAIL_TOP - press + M.scoop.dir.y * scoop * (1 - smooth(scoopEnd, scoopEnd + 0.1, p));
  const bz = back.z + M.scoop.dir.z * sideOf(i.scoop) * scoop;
  back.x = lerp(bx, -BOLTS_X + SKETCH.back * sketch, gatherBack) - B.spread * easeB;
  back.z = lerp(lerp(bz, 0, gatherBack), B.backZ, easeB);
  back.y = lerp(lerp(by, landBack, gatherBack), PAD_Y, fall(stepB));
  // From the stance's own tilt on the tail (writeStance), so progress 0 is the stance exactly.
  back.pitch = lerp(back.pitch + M.pop.pitch * bump(0, M.pop.end, p), 0, gatherBack) + B.reach * bump(0.15, 1, stepB);
  back.roll = lerp(back.roll, 0, gatherBack);
  back.yaw = lerp(lerp(back.yaw, STANCE.front.yawAcross, gatherBack), B.backYaw, easeB);
  return out;
}

export const feetPoseAt = (inputs: TrickInputs, flight: Flight | null, u: number, stance: Stance = 'goofy'): FeetPose =>
  writeFeetPose(newFeetPose(), inputs, flight, u, stance);

/**
 * A point on the deck in the board's own frame (the frame of the board group
 * in src/scene): x along the deck with the nose at +X in both stances, z
 * across it. Metres. The scene drapes it onto the grip.
 */
export interface CuePoint {
  x: number;
  z: number;
}

/**
 * Motion cues (ADR-26, DESIGN.md 8.7): how each shoe will move against the
 * deck for these inputs, drawn flat on the grip before the pop.
 * - front: the front shoe's ball through its slide and (if any) flick, from
 *   the stance to where it leaves; the arrowhead goes at the last point.
 * - press: the back shoe's footprint on the tail pocket (centre, yaw as in
 *   FootPose, sole length and width), where it presses for the pop.
 * - scoop: the back shoe's scoop as a sweep about the board's centre (the
 *   shove axis), toward the heel side for backside and the toe side for
 *   frontside (ADR-30), in front of the back shoe so it is not hidden under
 *   it; its length is the scoop distance. Empty with no scoop.
 */
export interface MotionCueSpec {
  front: CuePoint[];
  press: { x: number; z: number; yaw: number; length: number; width: number };
  scoop: CuePoint[];
}

export const CUES = {
  /** The ball of the foot, ahead of the sole centre toward the toes (about 72 percent from the heel). */
  ball: 0.06,
  /** Gap from the back shoe's nose-side edge to the scoop sweep, clear of the press outline. */
  scoopGap: 0.035,
  /** Shorter scoops than this draw no sweep. */
  minScoop: 0.005,
} as const;

/**
 * The cue description for these inputs, in the board's own frame. Pure; built
 * when the inputs, the flight or the stance change, never per frame. The
 * motion is the feet model's own (writeDeckFeet), so an ollie is a straight
 * slide toward the nose, a kickflip slides and then leaves off the heel-side
 * corner of the nose, a heelflip off the toe-side corner (ADR-30), a varial
 * leans forward and a 360 flip out. Regular
 * (ADR-25) mirrors the feet along X in the world, and the board group is
 * turned 180 degrees, so in the board's own frame the cues mirror across its
 * long axis: z to -z, yaw to -yaw, x unchanged.
 */
export function motionCues(inputs: TrickInputs, stance: Stance = 'goofy', samples = 32): MotionCueSpec {
  const flight = computeFlight(inputs);
  const zs = stance === 'regular' ? -1 : 1;
  const fc = Math.min(1, rateFactor(inputs.flick));
  const slideEnd = MOTION.slide.end + MOTION.slide.endFlick * fc;
  const end = flickDistance(inputs) > 0 ? Math.max(slideEnd, MOTION.flick.end) : slideEnd;
  const pose = newFeetPose();
  const stand = writeStance(newFeetPose(), inputs);

  // Front: the ball rides ahead of the sole centre along the shoe's own toe
  // direction (cos yaw, -sin yaw) at each sample, so the kickflip's turn
  // through the flick (ADR-33) bends the arrow out through the pocket.
  const front: CuePoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const f = writeDeckFeet(pose, flight, (end * i) / samples).front;
    const yaw = (f.yaw * Math.PI) / 180;
    front.push({ x: f.x + Math.cos(yaw) * CUES.ball, z: zs * (f.z - Math.sin(yaw) * CUES.ball) });
  }

  const b = stand.back;
  const press = { x: b.x, z: zs * b.z, yaw: zs * b.yaw, length: FOOT.length, width: FOOT.width };

  // Scoop: an arc about the centre on the tail side, just in front of the back
  // shoe (on the nose side of it, so the shoe never hides it), from the shoe's
  // z by the scoop's sideways part: toward +Z (goofy) for backside, toward -Z
  // for frontside (ADR-30).
  const scoop: CuePoint[] = [];
  const d = scoopDistance(inputs) * MOTION.scoop.dir.z * sideOf(inputs.scoop);
  if (Math.abs(d) >= CUES.minScoop) {
    const by = (b.yaw * Math.PI) / 180;
    const reach = (FOOT.length / 2) * Math.abs(Math.cos(by)) + (FOOT.width / 2) * Math.abs(Math.sin(by));
    const r = Math.abs(b.x) - reach - CUES.scoopGap;
    const a0 = Math.asin(Math.max(-1, Math.min(1, b.z / r)));
    const side = Math.sign(b.x) || -1;
    for (let i = 0; i <= samples; i++) {
      const a = a0 + (d / r) * (i / samples);
      scoop.push({ x: side * r * Math.cos(a), z: zs * r * Math.sin(a) });
    }
  }
  return { front, press, scoop };
}
