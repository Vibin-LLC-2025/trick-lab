// Where the runtime loads the GLBs built by `npm run assets` (scripts/build-board.ts)
// into public/, so Vite serves them as static files. Kept out of the lazy
// BoardModel chunk so Board.tsx can pick a URL without loading the GLTF loader.
import { BOARD_GLB, BOARD_HIGH_GLB, GROUND_GLB, SHOES_GLB } from '../asset/spec';
import type { Quality } from '../store';

const url = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export const BOARD_URL = url(BOARD_GLB);
export const BOARD_HIGH_URL = url(BOARD_HIGH_GLB);
export const SHOES_URL = url(SHOES_GLB);
export const GROUND_URL = url(GROUND_GLB);

/** High gets the high-detail board, Medium the original; Low never asks. */
export const boardUrlFor = (quality: Exclude<Quality, 'low'>) => (quality === 'high' ? BOARD_HIGH_URL : BOARD_URL);
