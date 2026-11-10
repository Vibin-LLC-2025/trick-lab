// Rolling (step 12, ADR-67): the board stays where it is and the world moves.
// The store says whether the board is pushing off, slowing or still
// (store/roll.ts); this turns that into speed and distance, frame by frame,
// and slides what shows the roll: the ground's textures (the slab joints,
// colour and roughness, on every tier) and the wheels' print (Medium and
// High). Sliding a texture moves nothing on the GPU but one matrix, so
// rolling adds no draw call and no geometry.
//
// No React. FlightDriver is the only caller per frame, and nothing here
// allocates once the textures are registered.
import type { Texture } from 'three';
import { ART } from './artDirection';

const R = ART.roll;

/** The roll's motion, shared by every mount of FlightDriver (a tier change remounts it mid-roll). Mutated in place. */
export interface RollMotion {
  /** m/s along +X, nose first. */
  speed: number;
  /** Metres rolled since the game screen was last left. */
  distance: number;
  /** False makes the next moving frame a start, so a gap in frames (a dialog, a pause) does not jump. */
  running: boolean;
}

export const rollMotion: RollMotion = { speed: 0, distance: 0, running: false };

/** How fast the speed changes: a steady push to the cruise, a steady slow-down to a stop. m/s per second. */
export const PUSH_ACCEL = R.cruise / R.pushS;
export const SLOW_DECEL = R.cruise / R.slowS;

/**
 * One step of `dt` seconds: toward the cruise while pushing, toward a stop
 * otherwise, at a constant rate either way, with the distance of the step's
 * mean speed (exact for a constant rate). Returns true when slowing has
 * reached a stop (also a board slowed before it ever moved).
 */
export function stepRoll(m: RollMotion, pushing: boolean, dt: number): boolean {
  const before = m.speed;
  const after = pushing ? Math.min(R.cruise, before + PUSH_ACCEL * dt) : Math.max(0, before - SLOW_DECEL * dt);
  // The part of the step spent changing speed, and the rest at the final speed.
  const changing = before === after ? 0 : Math.abs(after - before) / (pushing ? PUSH_ACCEL : SLOW_DECEL);
  m.distance += ((before + after) / 2) * changing + after * (dt - changing);
  m.speed = after;
  return !pushing && after === 0;
}

/** Stops at once (a roll cut short), keeping the distance. */
export function haltRoll(m: RollMotion) {
  m.speed = 0;
  m.running = false;
}

/** Back to the spot: no speed, no distance (leaving the game screen, ADR-67: the lab stays on the spot). */
export function resetRoll(m: RollMotion) {
  m.speed = 0;
  m.distance = 0;
  m.running = false;
}

/**
 * A texture that slides with the roll: its offset along u is its own base
 * plus `perMetre` texture widths per metre rolled. Kept to the fraction, so
 * an offset never grows (with repeat wrapping a whole texture width looks
 * the same: the wrap never shows).
 */
interface Slide {
  texture: Texture;
  base: number;
  perMetre: number;
  /** The ground slides along the world's X, the way the nose points; the wheels turn in the board's own frame (ADR-68). */
  ground: boolean;
}

/** Room for every texture that slides: the ground's three maps or Low's joints, and one wheel map. */
const MAX_SLIDES = 8;
const slides: (Slide | null)[] = new Array<Slide | null>(MAX_SLIDES).fill(null);
let count = 0;

/** The base offset each texture had when it was first registered: textures of the model cache outlive a mount. */
const bases = new WeakMap<Texture, number>();

/**
 * Registers a texture to slide, `perMetre` of its width per metre rolled
 * (for the ground: its repeat over the plane's width; for the wheels: one
 * turn per circumference). `ground`: it lies on the ground, which slides the
 * way the nose points (+X goofy, -X regular); otherwise it turns with the
 * board, the same way for either stance. Returns what unregisters it and
 * puts its offset back. A texture registered twice keeps its first entry.
 */
export function slideTexture(texture: Texture, perMetre: number, ground = true): () => void {
  for (let i = 0; i < count; i++) if (slides[i]!.texture === texture) return () => {};
  if (count === MAX_SLIDES) throw new Error('trick-lab: too many sliding textures (scene/roll.ts MAX_SLIDES)');
  if (!bases.has(texture)) bases.set(texture, texture.offset.x);
  const entry: Slide = { texture, base: bases.get(texture)!, perMetre, ground };
  slides[count++] = entry;
  return () => {
    const i = slides.indexOf(entry);
    if (i < 0) return;
    slides[i] = slides[count - 1]!;
    slides[--count] = null;
    texture.offset.x = entry.base;
  };
}

/** The fractional part, in [0, 1). */
const frac = (x: number) => x - Math.floor(x);

/**
 * Writes every registered texture's offset for `distance` metres rolled,
 * with the nose along `nose` (+1 world +X, goofy; -1, regular). No allocation.
 */
export function writeSlides(distance: number, nose: 1 | -1 = 1) {
  for (let i = 0; i < count; i++) {
    const s = slides[i]!;
    s.texture.offset.x = s.base + frac((s.ground ? nose : 1) * distance * s.perMetre);
  }
}

/** How many textures slide now (for tests and the debug readout). */
export const slideCount = () => count;

/** Texture widths per metre for a texture repeated `repeat` times across `width` metres of ground. */
export const groundPerMetre = (repeat: number, width: number) => repeat / width;

/** Texture widths per metre for a wheel's lathe map (u once around): one per circumference. */
export const wheelPerMetre = (radius: number = R.wheelRadius) => 1 / (2 * Math.PI * radius);
