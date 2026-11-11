// Plain-language text for the announcer, aria-valuetext, readouts and the
// scene description. Pure so the store and the UI phrase things the same way.
import {
  CATCH,
  flickDistance,
  FOOT,
  hoverHeight,
  MOTION,
  newFeetPose,
  RAIL_Z,
  rateFactor,
  scoopDistance,
  STANCE,
  writeStance,
  type Stance,
} from './feet';
import { computeFlight, PHASE, type Flight, type TrickInputs } from './flight';
import { describeBody } from './body';
import { describeLegs } from './legs';
import { restSide, type RestSide } from './settle';
import { landingZones } from './zones';
import {
  directionWord,
  FLIP_WORDS,
  isLanded,
  isUnderRotated,
  recognize,
  ROLL_TOLERANCE,
  SHOVE_WORDS,
  sketchAmount,
  sketchOf,
  YAW_TOLERANCE,
  type InputKey,
  type TrickId,
  type TrickResult,
} from './tricks';

export const INPUT_NAMES: Record<InputKey, string> = { pop: 'Pop', flick: 'Flick', scoop: 'Scoop' };
export const INPUT_UNITS: Record<InputKey, string> = { pop: 'm', flick: 'rev/s', scoop: 'rev/s' };

/**
 * Number shown next to a slider: pop with 2 decimals, rates with 1 and as a
 * magnitude (ADR-30): the sign is the direction, which inputDirection names.
 */
export const displayValue = (key: InputKey, v: number) => (key === 'pop' ? v.toFixed(2) : Math.abs(v).toFixed(1));

/**
 * The direction a signed rate turns, as one word (ADR-30): flick "kickflip"
 * or "heelflip", scoop "backside" or "frontside"; '' for pop and for a rate
 * that shows as 0.0. Decided on the shown (rounded) value, so "0.0 rev/s"
 * never carries a word.
 */
export function inputDirection(key: InputKey, v: number): string {
  if (key === 'pop') return '';
  return directionWord(key === 'flick' ? FLIP_WORDS : SHOVE_WORDS, Number(v.toFixed(1)));
}

/** The slider's readout after the number: "rev/s heelflip", "rev/s", "m". */
export const displayUnit = (key: InputKey, v: number) => {
  const word = inputDirection(key, v);
  return word ? `${INPUT_UNITS[key]} ${word}` : INPUT_UNITS[key];
};

const rateWords = (v: number) => {
  const n = Math.abs(Number(v.toFixed(1)));
  return `${n} ${n === 1 ? 'revolution' : 'revolutions'} per second`;
};

/** aria-valuetext: "0.35 meters", "1.9 revolutions per second, heelflip", "0 revolutions per second". */
export function valueText(key: InputKey, v: number): string {
  if (key === 'pop') return `${v.toFixed(2)} meters`;
  const word = inputDirection(key, v);
  return word ? `${rateWords(v)}, ${word}` : rateWords(v);
}

/** One rate in a sentence: "heelflip flick 1.9 revolutions per second", "scoop 0 revolutions per second". */
const rateClause = (key: 'flick' | 'scoop', v: number) => {
  const word = inputDirection(key, v);
  return `${word ? `${word} ` : ''}${key} ${rateWords(v)}`;
};

/** "pop 0.35 meters, heelflip flick 1.9 revolutions per second, frontside scoop 0.9 revolutions per second". */
export const describeInputs = (i: TrickInputs) =>
  `pop ${valueText('pop', i.pop)}, ${rateClause('flick', i.flick)}, ${rateClause('scoop', i.scoop)}`;

export const deg = (d: number) => Math.round(d);
export const seconds = (s: number) => s.toFixed(2);
const degWord = (d: number) => `${Math.abs(deg(d))} ${Math.abs(deg(d)) === 1 ? 'degree' : 'degrees'}`;

/**
 * Signed totals in words (ADR-30): the magnitude, then the direction when it
 * is not 0. The flip's direction is its trick ("kickflip", "heelflip"), the
 * shove's its side ("backside", "frontside"). Decided on the rounded degrees,
 * so a total that shows as 0 has no direction.
 */
export const flipDirection = (d: number) => directionWord(FLIP_WORDS, deg(d));
export const shoveDirection = (d: number) => directionWord(SHOVE_WORDS, deg(d));
/** Noun for a total on its axis: "heelflip", "frontside shove", or plain "flip", "shove" at 0. */
const flipNoun = (d: number) => flipDirection(d) || 'flip';
const shoveNoun = (d: number) => {
  const w = shoveDirection(d);
  return w ? `${w} shove` : 'shove';
};

/**
 * Telemetry readout for a signed total, in two parts: the magnitude ("365°")
 * and the direction ("heelflip", "frontside", '' at 0). Read together they
 * are "365° heelflip"; the row's own label (Flip, Shove) names the axis.
 */
export const degReadout = (axis: 'flip' | 'shove', d: number) => ({
  value: `${Math.abs(deg(d))}°`,
  dir: axis === 'flip' ? flipDirection(d) : shoveDirection(d),
});

/**
 * The board's spin in the air, between the ramp-up and the catch (ADR-36):
 * "3.2 rev/s flip, 1.4 rev/s shove in the air". About 1.7 times the slider's
 * rate, which is the turn per second of the whole airtime. An axis that shows
 * as 0.0 is left out; null when both do (an ollie).
 */
export function spinReadout(flight: Pick<Flight, 'flipRate' | 'shoveRate'>): string | null {
  const flip = flight.flipRate.toFixed(1);
  const shove = flight.shoveRate.toFixed(1);
  const parts: string[] = [];
  if (Number(flip) !== 0) parts.push(`${flip} rev/s flip`);
  if (Number(shove) !== 0) parts.push(`${shove} rev/s shove`);
  return parts.length ? `${parts.join(', ')} in the air` : null;
}

/** A sketchy landing's miss, as heard: "18 degrees past on the flip", "12 degrees short on the shove". */
export function sketchText(r: TrickResult): string {
  const sk = sketchOf(r);
  return sk ? `${degWord(sk.by)} ${sk.short ? 'short' : 'past'} on the ${sk.axis}` : '';
}

/**
 * "Heelflip landed clean. 365 degrees of heelflip, 0 degrees of shove, 0.53
 * seconds in the air.", or "Kickflip landed, sketchy: 18 degrees past on the
 * flip. ..." (ADR-63).
 */
export function describeResult(r: TrickResult): string {
  const totals = `${degWord(r.rollTotal)} of ${flipNoun(r.rollTotal)}, ${degWord(r.yawTotal)} of ${shoveNoun(r.yawTotal)}, ${seconds(r.airtime)} seconds in the air.`;
  if (r.grade === 'sketchy') return `${r.name} landed, sketchy: ${sketchText(r)}. ${totals}`;
  if (r.landed) return `${r.name} landed clean. ${totals}`;
  return `${r.name} not landed: ${r.failedAxis} ${r.outcome} by ${degWord(r.failedBy)}. ${totals}`;
}

const HINT: Record<'flip' | 'shove', Record<'under' | 'over', string>> = {
  flip: { under: 'More flick or more pop gives it time.', over: 'Ease the flick a little.' },
  shove: { under: 'More scoop or more pop gives it time.', over: 'Ease the scoop a little.' },
};

/**
 * Outcome card copy (docs/DESIGN.md section 4). The card is scanned, so it uses
 * "deg" and "s"; the announcer is heard, so it uses full words.
 */
export function outcomeCard(r: TrickResult): { name: string; detail: string } {
  const sk = sketchOf(r);
  if (sk) {
    // Sketchy (ADR-63): which axis was off, which way, and what to change.
    return {
      name: `${r.name} landed, sketchy`,
      detail: `${Math.abs(deg(sk.by))} deg ${sk.short ? 'short' : 'past'} on the ${sk.axis}. ${HINT[sk.axis][sk.short ? 'under' : 'over']}`,
    };
  }
  if (r.landed) {
    // "No rotation" only when both totals show as 0: an ollie inside the
    // tolerances can still have turned up to 30 degrees of flip and 25 of
    // shove, and the card must not contradict the telemetry.
    const detail =
      r.id === 'ollie' && deg(r.rollTotal) === 0 && deg(r.yawTotal) === 0
        ? `No rotation, ${seconds(r.airtime)} s in the air. Add flick or scoop to try a trick.`
        : `${Math.abs(deg(r.rollTotal))} deg ${flipNoun(r.rollTotal)}, ${Math.abs(deg(r.yawTotal))} deg ${shoveNoun(r.yawTotal)}, ${seconds(r.airtime)} s in the air.`;
    return { name: `${r.name} landed clean`, detail };
  }
  // Under or over against the direction of rotation (ADR-30), not the raw sign of the error.
  const off = [
    { axis: 'flip' as const, err: r.rollError, under: isUnderRotated(r.rollTotal, 360), fails: Math.abs(r.rollError) > ROLL_TOLERANCE },
    { axis: 'shove' as const, err: r.yawError, under: isUnderRotated(r.yawTotal, 180), fails: Math.abs(r.yawError) > YAW_TOLERANCE },
  ].filter((a) => a.fails);
  const dir = (under: boolean) => (under ? 'under' : 'over');
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const failed = r.outcome === 'under-rotated' ? 'under' : 'over';
  const detail =
    off.length === 2
      ? `${off.map((a, i) => `${i === 0 ? cap(dir(a.under)) : dir(a.under)}-rotated ${Math.abs(deg(a.err))} deg of ${a.axis}`).join(', ')}.`
      : `${cap(failed)}-rotated by ${Math.abs(deg(r.failedBy))} deg of ${r.failedAxis}. ${HINT[r.failedAxis!][failed]}`;
  return { name: `${r.name} not landed`, detail };
}

/** A trick the player has to do in a game: its name and its turn on each axis (a SkateCall). */
export interface ForecastCall {
  id: TrickId;
  name: string;
  flips: number;
  halfShoves: number;
}

/**
 * How far a bail misses the trick to do, on the axis that misses most past
 * its tolerance (the same choice recognition makes): "38 degrees short on the
 * flip", "96 degrees past on the shove", or "the flip turns the wrong way"
 * when it turns against the trick's own direction.
 */
function missOf(r: TrickResult, call: ForecastCall): string {
  const axes = [
    { axis: 'flip' as const, total: r.rollTotal, target: call.flips * 360, tol: ROLL_TOLERANCE },
    { axis: 'shove' as const, total: r.yawTotal, target: call.halfShoves * 180, tol: YAW_TOLERANCE },
  ];
  const worst = axes.reduce((a, b) => (Math.abs(b.total - b.target) - b.tol > Math.abs(a.total - a.target) - a.tol ? b : a));
  if (worst.target !== 0 && deg(worst.total) !== 0 && Math.sign(worst.total) !== Math.sign(worst.target)) return `the ${worst.axis} turns the wrong way`;
  const short = worst.target !== 0 && Math.abs(worst.total) < Math.abs(worst.target);
  return `${degWord(worst.total - worst.target)} ${short ? 'short' : 'past'} on the ${worst.axis}`;
}

/**
 * The forecast under the game's sliders (ADR-83): what the sliders make if
 * the pop is timed right (a release in the band is exactly the sliders,
 * ADR-65), from the same flight and recognition that fly the trick. Against
 * the trick to do when there is one: "This makes: kickflip, clean.", "This
 * makes: kickflip, sketchy: 19 degrees short on the flip.", "This makes: a
 * bail: 38 degrees short on the flip.", "This makes: heelflip, not the
 * kickflip you need.". `cleanOnly` (Hard) says a sketchy one will not count.
 * When no slider value can land the trick from this pop (its landing zone
 * lies past a slider's end, zones.ts), it says what the sliders make and to
 * pop higher.
 */
export function forecastText(inputs: TrickInputs, call: ForecastCall | null, cleanOnly = false): string {
  const r = recognize(computeFlight(inputs));
  const name = r.name.charAt(0).toLowerCase() + r.name.slice(1);
  // A zone past the slider's end (a double flip from a low pop): no slider value lands it from this pop.
  if (call) {
    const zones = landingZones(call, inputs.pop);
    const off = !zones.flick ? 'flick' : !zones.scoop ? 'scoop' : null;
    if (off) return `${forecastText(inputs, null)} Pop higher: the ${off} slider cannot reach the ${call.name.toLowerCase()} from here.`;
  }
  if (call && r.landed && r.id !== call.id) return `This makes: ${name}, not the ${call.name.toLowerCase()} you need.`;
  if (r.grade === 'clean') return `This makes: ${name}, clean.`;
  if (r.grade === 'sketchy') return `This makes: ${name}, sketchy: ${sketchText(r)}.${call && cleanOnly ? ' Only clean counts on Hard.' : ''}`;
  if (call) return `This makes: a bail: ${missOf(r, call)}.`;
  return `This makes: a bail: ${degWord(r.failedBy)} ${r.outcome === 'under-rotated' ? 'short' : 'past'} on the ${r.failedAxis}.`;
}

/**
 * The stance and rotation convention in words (ADR-10, ADR-24, ADR-25), so a
 * screen-reader user gets the same directions a sighted user sees from the
 * default camera, which is on the heel side in both stances.
 */
export const STANCE_NOTE: Record<Stance, string> = {
  goofy:
    'Goofy stance, nose to the right, heel side toward the camera. Flick rolls the grip toward the heel side for a kickflip, toward the toe side for a heelflip; scoop swings the tail behind the heels for backside, counterclockwise seen from above, and in front of the toes for frontside, clockwise.',
  regular:
    'Regular stance, nose to the left, heel side toward the camera. Flick rolls the grip toward the heel side for a kickflip, toward the toe side for a heelflip; scoop swings the tail behind the heels for backside, clockwise seen from above, and in front of the toes for frontside, counterclockwise.',
};

/**
 * The stance the feet take for these inputs (src/sim/feet.ts), in words. The
 * shoes follow the inputs, so this is also what a sighted student sees change
 * as the sliders move. Computed in the goofy frame; the words are relative to
 * the rider, so they hold for regular too.
 */
export function describeFeet(inputs: TrickInputs): string {
  const p = writeStance(newFeetPose(), inputs);
  // Goofy yaw (ADR-24): across is +87 and turning toward the nose lowers it.
  const turn = Math.round(STANCE.front.yawAcross - p.front.yaw);
  // The toe points along (cos yaw, 0, -sin yaw), so the heel sits half a shoe the other way, toward +Z.
  const heelZ = p.front.z + (FOOT.length / 2) * Math.sin((p.front.yaw * Math.PI) / 180);
  const front =
    inputDirection('flick', inputs.flick) === 'heelflip'
      ? 'Front foot across the board just behind the front bolts, toes hanging over the toe-side edge for a heelflip'
      : turn < 3
        ? 'Front foot across the board just behind the front bolts'
        : `Front foot just behind the front bolts, turned ${turn} degrees toward the nose${heelZ > RAIL_Z ? ' with the heel over the heel-side edge' : ''}`;
  const scoop = inputDirection('scoop', inputs.scoop);
  const back =
    scoop === 'backside'
      ? 'back foot on its ball across the tail, toes toward the toe-side edge to scoop'
      : scoop === 'frontside'
        ? 'back foot on its ball toward the heel side of the tail, to scoop frontside'
        : 'back foot on its ball across the tail, heel up';
  return `${front}; ${back}.`;
}

/** One step of the foot motion, timed in fractions of the airtime (the phases of src/sim/feet.ts). */
export interface FootStep {
  foot: 'front' | 'back' | 'both';
  text: string;
  start: number;
  end: number;
}

const cm = (m: number) => `${Math.round(m * 100)} cm`;

/**
 * The foot motion as ordered steps (DESIGN.md 8.5): the text equivalent of
 * the foot trails and a coaching script, from the same feet model, so a weak
 * flick reads "only 4 cm, it barely reaches the rail" and a trick that will
 * not land ends in a bail step. Takes the flight being shown, or before a pop
 * the flight the live inputs would make. Landing uses the flight's own
 * landing test (isLanded), never the recognized trick. Timed by the flight's
 * phases (PHASE, ADR-36): the feet are in the air from the flick's end to the
 * catch, a landed trick's feet catch the board over PHASE.catch and press it
 * flat, then ride it down; a bail steps off from the catch's start.
 */
export function footSteps(s: { flight: Flight | null; pop: number; flick: number; scoop: number }): FootStep[] {
  const flight = s.flight ?? computeFlight({ pop: s.pop, flick: s.flick, scoop: s.scoop });
  const i = flight.inputs;
  const M = MOTION;
  // Magnitudes for the amounts, the signs for the direction (ADR-30).
  const f = Math.min(1, rateFactor(i.flick));
  const sc = Math.min(1, rateFactor(i.scoop));
  const heel = i.flick < 0;
  const steps: FootStep[] = [
    { foot: 'back', text: 'Back foot snaps the tail down off the ball of the foot: the pop.', start: 0, end: M.pop.end },
  ];
  if (i.scoop !== 0) {
    const d = scoopDistance(i);
    const how = d >= M.scoop.max ? ', as hard as it goes' : d < 0.06 ? ', a light nudge' : '';
    steps.push({
      foot: 'back',
      text:
        i.scoop > 0
          ? `Back foot scoops the tail back behind the heels, ${cm(d)} toward the heel side${how}.`
          : `Back foot slices the tail forward in front of the toes, ${cm(d)} toward the toe side${how}.`,
      start: 0,
      end: M.scoop.end + M.scoop.endScoop * sc,
    });
  }
  const slide = Math.max(M.slide.min, M.slide.distance + (heel ? M.slide.distanceHeel : M.slide.distanceFlick) * f);
  steps.push({
    foot: 'front',
    text: heel
      ? `Front foot slides up the grip toward the nose, ${cm(slide)}.`
      : `Front foot drags up the grip on its outside edge toward the nose, ${cm(slide)}.`,
    start: 0,
    end: M.slide.end + M.slide.endFlick * f,
  });
  if (i.flick !== 0) {
    const d = flickDistance(i);
    // A heelflip's heel starts at the far rail, so its kick is scaled by heelReach (ADR-34); so is "weak".
    const weak = 0.08 * (heel ? M.flick.heelReach : 1);
    const text = heel
      ? d < weak
        ? `Front foot kicks off the toe-side corner of the nose, but only ${cm(d)}: it barely reaches the rail.`
        : `Front foot kicks forward and out off the toe-side corner of the nose, heel last, ${cm(d)}.`
      : d < weak
        ? `Front foot flicks off the heel-side corner of the nose, but only ${cm(d)}: it barely reaches the rail.`
        : `Front foot flicks forward, out and up off the heel-side corner of the nose, ${cm(d)}.`;
    steps.push({ foot: 'front', text, start: M.flick.start, end: M.flick.end });
  }
  const hover = hoverHeight(i);
  const landed = isLanded(flight.rollTotal, flight.yawTotal);
  const C = PHASE.catch;
  // An ollie's feet never leave the board, so there is nothing to catch: they stay on it until the board stops turning.
  const rides = hover < 0.03;
  steps.push(
    rides
      ? { foot: 'both', text: 'Both feet stay on the board as it levels out and rises with them.', start: M.flick.end, end: landed ? C.end : C.start }
      : { foot: 'both', text: `Both feet lift ${cm(hover)} clear while the board turns under them.`, start: M.flick.end, end: C.start },
  );
  if (landed && !rides) {
    steps.push({
      foot: 'both',
      text: `Both feet catch the board at about ${Math.round(((C.start + C.end) / 2) * 100)} percent of the flight and press it flat.`,
      start: C.start,
      end: C.end,
    });
  }
  const sketchy = sketchAmount(flight.rollTotal, flight.yawTotal) > 0;
  steps.push(
    landed
      ? {
          foot: 'both',
          text: sketchy
            ? 'Both feet ride the board down, but come down off the bolts, toward the middle: a sketchy landing.'
            : 'Both feet ride the board down over the bolts and land on the grip.',
          start: CATCH.back,
          end: 1,
        }
      : { foot: 'both', text: 'The board does not come round in time: both feet step off to the heel side, a bail.', start: M.bail.start, end: 1 },
  );
  return steps;
}

/** Where the feet are during and after a flight: in the air, then (landed, from the catch's end, ADR-36) on the board riding it down. */
function describeFeetInFlight(s: { status: 'idle' | 'playing' | 'paused' | 'done'; progress: number; flight: Flight | null }): string {
  if (!s.flight || s.status === 'idle') return '';
  const landed = isLanded(s.flight.rollTotal, s.flight.yawTotal);
  if (s.status === 'done' && s.progress >= 1) {
    if (!landed) return 'Feet stepped off to the heel side and landed on the pad: a bail.';
    return sketchAmount(s.flight.rollTotal, s.flight.yawTotal) > 0 ? 'Feet landed off the bolts, toward the middle: a sketchy landing.' : 'Feet landed on the bolts.';
  }
  return landed && s.progress >= CATCH.back ? 'Feet on the board, riding it down.' : 'Feet in the air above the board.';
}

const FELL: Record<RestSide, string> = {
  wheels: 'slides away from the feet on its wheels',
  rail: 'falls onto its side and slides away from the feet',
  grip: 'falls upside down and slides away from the feet',
};

/** The landing's motion in a game (ADR-68), as it plays or once it has: one sentence, empty for a clean landing. */
function describeSettle(flight: Flight, grade: 'clean' | 'sketchy' | 'bail', playing: boolean): string {
  if (grade === 'sketchy') return playing ? ' The board rocks onto its back wheels and swerves; the feet ride it out.' : ' The board rocked and swerved; the feet rode it out.';
  if (grade !== 'bail') return '';
  const fell = FELL[restSide(flight)];
  return playing ? ` The board ${fell}.` : ` The board ${fell.replace('falls', 'fell').replace('slides', 'slid')}.`;
}

export function describeScene(s: {
  status: 'idle' | 'playing' | 'paused' | 'done';
  progress: number;
  flight: Flight | null;
  result: TrickResult | null;
  pop: number;
  flick: number;
  scoop: number;
  feetVisible?: boolean;
  /** Shown when left out, and only with the feet (ADR-37). */
  legsVisible?: boolean;
  /** The whole rider on screen (ADR-85, store riderShown): a sentence for the body after the legs'. Not when left out. */
  riderShown?: boolean;
  /** Goofy when left out (ADR-25). */
  stance?: Stance;
  /** Who popped the flight on screen (the game of SKATE, ADR-43); the student when left out. */
  flightBy?: 'you' | 'computer';
  /** Rolling in the game (ADR-67); still when left out. */
  roll?: 'still' | 'push' | 'slow';
  /** The landing's own motion in a game (ADR-68); none when left out. */
  landing?: 'none' | 'plays' | 'over';
  /** The instant replay (ADR-72); none when left out. */
  replay?: 'none' | 'due' | 'plays';
}): string {
  // The instant replay plays the made trick again before the landing shows (ADR-72).
  const replay = s.replay === 'plays' ? s.result : null;
  const board = replay
    ? `Instant replay of the ${replay.name.toLowerCase()}, in slow motion from a low camera. Press Pop or Escape to skip it.`
    : s.status === 'playing'
      ? 'Skateboard in the air.'
      : s.status === 'paused'
        ? `Skateboard paused in the air at ${Math.round(s.progress * 100)} percent of the flight.`
        : s.status === 'done' && s.flight
          ? s.progress >= 1
            ? 'Skateboard back on the pad at its landing pose.'
            : `Skateboard frozen at ${Math.round(s.progress * 100)} percent of the flight.`
          : s.roll === 'push' || s.roll === 'slow'
            ? 'Skateboard flat on the concrete, grip side up.'
            : 'Skateboard resting flat on a concrete pad, grip side up.';
  const rolling = s.roll === 'push' ? ' Rolling along the concrete, nose first.' : s.roll === 'slow' ? ' Rolling to a stop.' : '';
  const feet = s.feetVisible === false ? '' : ` ${describeFeetInFlight(s) || describeFeet(s.flight?.inputs ?? s)}`;
  const at = s.status === 'idle' ? 0 : s.progress;
  const legs = s.feetVisible === false || s.legsVisible === false ? '' : ` ${describeLegs(at, s.flight)}${s.riderShown ? ` ${describeBody(at, s.flight)}` : ''}`;
  const inputs = `Inputs: ${describeInputs(s)}.`;
  // A popped flight without a result is still in the air (playing or paused), even after an earlier trick.
  const cpu = s.flightBy === 'computer';
  const last = s.result
    ? `${cpu ? "The computer's last trick" : 'Last trick'}: ${describeResult(s.result)}`
    : s.flight
      ? cpu
        ? "Waiting for the computer's trick to land."
        : 'Waiting for this trick to land.'
      : 'No trick popped yet.';
  const settled = !replay && s.landing && s.landing !== 'none' && s.flight && s.result ? describeSettle(s.flight, s.result.grade, s.landing === 'plays') : '';
  return `${board}${rolling}${settled}${feet}${legs} ${STANCE_NOTE[s.stance ?? 'goofy']} ${inputs} ${last}`;
}
