// Where the runtime loads the GLBs built by `npm run assets` (scripts/build-board.ts)
// into public/, so Vite serves them as static files. Kept out of the lazy
// BoardModel chunk so Board.tsx can pick a URL without loading the GLTF loader.
// Which files a tier shows is modelFiles.ts (pure, read by the scripts too).
import { BOARD_GLB, BOARD_HIGH_GLB, GROUND_GLB, SHOES_GLB, SPOT_GLB } from '../asset/spec';
import type { Quality } from '../store';
import { boardFileFor, modelFilesFor, modelFilesUnusedBy } from './modelFiles';

const url = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export const BOARD_URL = url(BOARD_GLB);
export const BOARD_HIGH_URL = url(BOARD_HIGH_GLB);
export const SHOES_URL = url(SHOES_GLB);
export const GROUND_URL = url(GROUND_GLB);
/** The skate spot (ADR-69): the game screen only, on Medium and High, so not in modelsFor (no first visit fetches it). */
export const SPOT_URL = url(SPOT_GLB);

/** High gets the high-detail board, Medium the original; Low never asks. */
export const boardUrlFor = (quality: Exclude<Quality, 'low'>) => url(boardFileFor(quality));

/**
 * The GLBs a tier shows (ADR-48), in the order they matter: the board, the
 * ground, then the shoes (High, and only while the feet are shown).
 * TrickScene starts these downloading as soon as it loads. Low shows none.
 */
export const modelsFor = (quality: Quality, feetVisible: boolean): string[] => modelFilesFor(quality, feetVisible).map(url);

/** The GLBs a tier never shows, whatever the feet: freed when the student moves down to it (ADR-48). */
export const modelsUnusedBy = (quality: Quality): string[] => modelFilesUnusedBy(quality).map(url);
