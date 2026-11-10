// The roll's motion (ADR-67), on its own with no imports, so the sound
// (useSound, ADR-73) can read the speed and distance FlightDriver last wrote
// without pulling the scene's code into the first page download.
// scene/roll.ts re-exports it and is the only writer.

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
