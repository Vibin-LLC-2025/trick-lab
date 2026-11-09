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

/**
 * The GLBs a tier shows (ADR-48), in the order they matter: the board, the
 * ground, then the shoes (High, and only while the feet are shown).
 * TrickScene starts these downloading as soon as it loads. Low shows none.
 */
export function modelsFor(quality: Quality, feetVisible: boolean): string[] {
  if (quality === 'low') return [];
  const urls = [boardUrlFor(quality), GROUND_URL];
  if (quality === 'high' && feetVisible) urls.push(SHOES_URL);
  return urls;
}

/** The GLBs a tier never shows, whatever the feet: freed when the student moves down to it (ADR-48). */
export function modelsUnusedBy(quality: Quality): string[] {
  const all = [BOARD_HIGH_URL, BOARD_URL, SHOES_URL, GROUND_URL];
  if (quality === 'low') return all;
  if (quality === 'medium') return [BOARD_HIGH_URL, SHOES_URL];
  return [];
}
