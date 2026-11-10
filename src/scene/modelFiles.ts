// The GLB files each tier shows (ADR-48), relative to the app's base path.
// Pure, with no import.meta, so the scripts can read it too (the download
// budget, scripts/lib/bundleBudget.ts); modelUrls.ts turns these into URLs.
import { BOARD_GLB, BOARD_HIGH_GLB, GROUND_GLB, SHOES_GLB, SPOT_GLB } from '../asset/spec';
import type { Quality } from '../store/types';

/** High gets the high-detail board, Medium the original; Low never asks. */
export const boardFileFor = (quality: Exclude<Quality, 'low'>) => (quality === 'high' ? BOARD_HIGH_GLB : BOARD_GLB);

/**
 * The GLBs a tier shows, in the order they matter: the board, the ground,
 * then the shoes (High, and only while the feet are shown). Low shows none.
 */
export function modelFilesFor(quality: Quality, feetVisible: boolean): string[] {
  if (quality === 'low') return [];
  const files = [boardFileFor(quality), GROUND_GLB];
  if (quality === 'high' && feetVisible) files.push(SHOES_GLB);
  return files;
}

/** The GLBs a tier never shows, whatever the feet. */
export function modelFilesUnusedBy(quality: Quality): string[] {
  const all = [BOARD_HIGH_GLB, BOARD_GLB, SHOES_GLB, GROUND_GLB, SPOT_GLB];
  if (quality === 'low') return all;
  if (quality === 'medium') return [BOARD_HIGH_GLB, SHOES_GLB];
  return [];
}
