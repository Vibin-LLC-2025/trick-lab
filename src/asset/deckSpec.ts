// The deck graphics (step 16, ADR-71): the bottom of the board, one drawing
// each in assets/source (the owner approved the four new ones on
// 2026-11-10). Today's graphic is inside the board GLBs; each other one is a
// KTX2 texture per board level in public/models/decks/, built by
// `npm run assets` from its SVG with the same deck wear, size and encoding as
// the GLB's own (so it swaps in for the Graphic material's map), downloaded
// only when it is shown. Pure: no React, no three.
// Types only from spec.ts: this file is in the first page download (the
// welcome screen's Deck choice), and spec.ts is not (deckTexture.ts has the sizes).
import type { DetailLevel } from './spec';

export const DECKS = {
  classic: { name: 'Trick Lab', svg: 'assets/source/deck-graphic.svg' },
  dusk: { name: 'Dusk', svg: 'assets/source/decks/deck-dusk.svg' },
  bolt: { name: 'Bolt', svg: 'assets/source/decks/deck-bolt.svg' },
  ripple: { name: 'Ripple', svg: 'assets/source/decks/deck-ripple.svg' },
  circuit: { name: 'Circuit', svg: 'assets/source/decks/deck-circuit.svg' },
} as const;

export type DeckId = keyof typeof DECKS;
/** The graphic inside the board GLBs: no file of its own. */
export const MODEL_DECK = 'classic' satisfies DeckId;
/** What the student chooses between on the welcome screen, in order. */
export const PLAYER_DECKS = ['classic', 'dusk', 'bolt', 'ripple'] as const satisfies readonly DeckId[];
export type PlayerDeck = (typeof PLAYER_DECKS)[number];
/** The computer's own deck in a game of SKATE: never the student's. */
export const COMPUTER_DECK = 'circuit' satisfies DeckId;
/** The decks with a texture file of their own. */
export type FileDeck = Exclude<DeckId, typeof MODEL_DECK>;
export const FILE_DECKS = (Object.keys(DECKS) as DeckId[]).filter((d): d is FileDeck => d !== MODEL_DECK);

export const isPlayerDeck = (v: unknown): v is PlayerDeck => typeof v === 'string' && (PLAYER_DECKS as readonly string[]).includes(v);

/** The board levels a deck is built for: Medium's board.glb and High's board-high.glb. */
export const DECK_LEVELS = ['medium', 'high'] as const satisfies readonly DetailLevel[];

/** Where a deck's texture for a board level is, under public/. */
export const deckFile = (deck: FileDeck, level: DetailLevel) => `models/decks/deck-${deck}-${level}.ktx2`;

/** Every deck texture file, for the build and the checks. */
export const DECK_FILES: readonly { deck: FileDeck; level: DetailLevel; file: string }[] = FILE_DECKS.flatMap((deck) =>
  DECK_LEVELS.map((level) => ({ deck, level, file: deckFile(deck, level) })),
);

/**
 * Each deck file's budget (assets:check): KTX2 with the full mip chain, the
 * GLB's deck bottom size, and at most `bytes`: the largest built
 * (2026-11-10, Ripple: 25.5 KB on Medium, 57.5 KB on High) plus about half
 * again, so a redrawn deck has room but not a photograph.
 */
export const DECK_BUDGET: Record<DetailLevel, { bytes: number }> = {
  medium: { bytes: 40 * 1024 },
  high: { bytes: 96 * 1024 },
};
