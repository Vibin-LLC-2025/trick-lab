// The recorded sounds (step 18, ADR-73): which free recordings each impact
// plays, how the build trims and levels them, and their budgets. Pure data:
// no Web Audio, no React, no three. scripts/build-sounds.ts reads it to make
// public/sounds/ with ffmpeg; the player reads the file names; assets:check
// enforces the budgets. A swap is cheap by design: point a take at another
// source file, run `npm run sounds`, and update CREDITS.md.

/** Every recording here is CC0 (public domain): free to ship in a public repo, no credit owed. */
export const SOUND_SOURCE = {
  dir: 'assets/source/sounds/kenney-impact-sounds',
  name: 'Impact Sounds (1.0) by Kenney',
  page: 'https://kenney.nl/assets/impact-sounds',
  licence: 'CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)',
  fetched: '2026-11-10',
} as const;

/** The sounds that have recordings. The rest (the scuff, the roll, a letter, the jingles) stay synthesized (ADR-73 says why). */
export type RecordedKind = 'pop' | 'catch' | 'land' | 'bail';
export const RECORDED_KINDS: readonly RecordedKind[] = ['pop', 'catch', 'land', 'bail'];

/** One layer of a take: a source file, where it starts in the take (s) and its level (dB, before the take is levelled). */
export interface Layer {
  file: string;
  at: number;
  db: number;
}

/**
 * One take: its layers, its length (s, faded out over `fade` at the end),
 * and the peak it is levelled to (dB full scale), so the takes of a sound
 * match each other and the sounds sit together.
 */
export interface Take {
  layers: readonly Layer[];
  length: number;
  fade: number;
  peak: number;
}

const one = (file: string, length: number, fade: number, peak: number): Take => ({ layers: [{ file, at: 0, db: 0 }], length, fade, peak });

/**
 * The takes, two or three per sound, one picked at random each time.
 * - pop: the tail striking the concrete, a bright, short wooden crack (a plank knock, cut before its ring).
 * - catch: the shoes slapping onto the grip tape, gritty and soft (a shoe on concrete), well under the pop.
 * - land: four wheels and the deck coming down, a deep wooden thud.
 * - bail: the board clattering away: a knock, two smaller bounces and a scrape of grit, mixed here.
 */
export const TAKES: Record<RecordedKind, readonly Take[]> = {
  pop: [one('impactPlank_medium_001.ogg', 0.26, 0.12, -3), one('impactPlank_medium_002.ogg', 0.26, 0.12, -3), one('impactPlank_medium_003.ogg', 0.26, 0.12, -3)],
  catch: [one('footstep_concrete_000.ogg', 0.11, 0.05, -10), one('footstep_concrete_003.ogg', 0.11, 0.05, -10), one('footstep_concrete_004.ogg', 0.11, 0.05, -10)],
  land: [one('impactWood_heavy_000.ogg', 0.3, 0.12, -2), one('impactWood_heavy_002.ogg', 0.3, 0.12, -2), one('impactWood_heavy_004.ogg', 0.3, 0.12, -2)],
  bail: [
    {
      layers: [
        { file: 'impactPlank_medium_000.ogg', at: 0, db: 0 },
        { file: 'impactWood_medium_001.ogg', at: 0.14, db: -5 },
        { file: 'impactWood_light_003.ogg', at: 0.31, db: -9 },
        { file: 'footstep_concrete_001.ogg', at: 0.44, db: -12 },
      ],
      length: 0.7,
      fade: 0.2,
      peak: -3,
    },
    {
      layers: [
        { file: 'impactWood_heavy_002.ogg', at: 0, db: 0 },
        { file: 'impactWood_medium_003.ogg', at: 0.12, db: -4 },
        { file: 'impactWood_light_002.ogg', at: 0.27, db: -8 },
        { file: 'footstep_concrete_003.ogg', at: 0.4, db: -12 },
      ],
      length: 0.7,
      fade: 0.2,
      peak: -3,
    },
  ],
};

/** The encoding: MP3, which every target browser decodes (Chrome, Edge, Firefox, Safari), mono, 44.1 kHz, 64 kbit/s. */
export const ENCODING = { ext: 'mp3', rate: 44100, kbps: 64 } as const;

/** Where the files are served, under the site's base. */
export const SOUND_DIR = 'sounds';

/** A take's file name: `pop-1.mp3`. */
export const takeFile = (kind: RecordedKind, i: number) => `${kind}-${i + 1}.${ENCODING.ext}`;

/** Every file the build makes, in order. */
export const SOUND_FILES: readonly string[] = RECORDED_KINDS.flatMap((k) => TAKES[k].map((_, i) => takeFile(k, i)));

/** Budgets (assets:check): each file, and the whole set, which the plan holds under about 150 KB. */
export const SOUND_BUDGET = { fileBytes: 12 * 1024, totalBytes: 150 * 1024 } as const;

/** Each play of a take is this much higher or lower at random (a fraction of its pitch), so ten pops are not one sound ten times. */
export const PITCH_JITTER = 0.04;
