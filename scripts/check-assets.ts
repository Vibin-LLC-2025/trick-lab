// npm run assets:check (also the last step of npm run verify): reads the
// committed GLBs in public/models (and the deck textures in public/models/decks, ADR-71) and fails if any file exceeds its budget
// (src/asset/spec.ts BUDGETS, from docs/BRIEF-BOARD.md and the quality tiers
// pass of 2026-11-04). Prints one table per file either way. Also checks the
// loading pictures (ADR-56, src/asset/stillSpec.ts). The KTX2 transcoder is
// three's own file, emitted by Vite into the build (ADR-49, step 4 of
// PLAN-PLAY-POLISH-REACH), so there is no copy left to check. And the sound
// recordings (ADR-73, src/audio/soundSpec.ts): each file is an MP3 within its
// budget, the set within its own, and CREDITS.md lists every file.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECK_FILES } from '../src/asset/deckSpec';
import { ASSET_FILES, type AssetKey } from '../src/asset/spec';
import { STILL, STILL_THEMES, stillFile } from '../src/asset/stillSpec';
import { SOUND_BUDGET, SOUND_DIR, SOUND_FILES } from '../src/audio/soundSpec';
import { evaluateBudget, evaluateDeckTexture, formatTable } from './lib/budget';
import { inspectDeckTexture, inspectGlb } from './lib/inspect';
import { readWebp, stillProblems } from './lib/webp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const failures: string[] = [];
  for (const key of Object.keys(ASSET_FILES) as AssetKey[]) {
    const file = ASSET_FILES[key];
    const path = resolve(ROOT, 'public', file);
    if (!existsSync(path)) {
      console.error(`assets:check: ${path} is missing. Run npm run assets.`);
      process.exit(1);
    }
    const rows = evaluateBudget(await inspectGlb(path), key);
    console.log(`Asset budget: public/${file} (${key})\n`);
    console.log(formatTable(rows));
    console.log('');
    for (const r of rows) if (!r.ok) failures.push(`${file}: ${r.check.trim()}`);
  }
  // The deck textures (step 16, ADR-71): each stands in for its board level's deck bottom.
  for (const { file, level } of DECK_FILES) {
    const path = resolve(ROOT, 'public', file);
    if (!existsSync(path)) {
      failures.push(`${file}: missing (run npm run assets -- decks)`);
      continue;
    }
    const rows = evaluateDeckTexture(inspectDeckTexture(path), level);
    console.log(`Deck texture: public/${file}
`);
    console.log(formatTable(rows));
    console.log('');
    for (const r of rows) if (!r.ok) failures.push(`${file}: ${r.check}`);
  }
  // The loading pictures (ADR-56): made in a browser (scripts/still), so checked, not rebuilt here.
  for (const theme of STILL_THEMES) {
    const file = stillFile(theme);
    const path = resolve(ROOT, 'public', file);
    const bytes = existsSync(path) ? readFileSync(path) : null;
    const problems = stillProblems(bytes, STILL);
    const info = bytes && readWebp(bytes);
    const what = info ? `${info.width} x ${info.height} WebP (${info.format}), ${(bytes.length / 1024).toFixed(1)} KB` : 'unreadable';
    console.log(`Still: public/${file} ${what}; limit ${STILL.width} x ${STILL.height}, ${STILL.maxBytes / 1024} KB: ${problems.length ? 'FAIL' : 'pass'}`);
    for (const p of problems) failures.push(`public/${file}: ${p} (see scripts/still)`);
  }

  // The sound recordings (ADR-73): built with ffmpeg (npm run sounds), so checked, not rebuilt here.
  const creditsPath = resolve(ROOT, 'public', SOUND_DIR, 'CREDITS.md');
  const credits = existsSync(creditsPath) ? readFileSync(creditsPath, 'utf8') : '';
  let soundTotal = 0;
  for (const file of SOUND_FILES) {
    const path = resolve(ROOT, 'public', SOUND_DIR, file);
    const bytes = existsSync(path) ? readFileSync(path) : null;
    const problems: string[] = [];
    if (!bytes) problems.push('missing (run npm run sounds)');
    else {
      soundTotal += bytes.length;
      // An MP3 frame header (its sync bits) or an ID3 tag at the start.
      const mp3 = (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) || bytes.subarray(0, 3).toString('latin1') === 'ID3';
      if (!mp3) problems.push('not an MP3');
      if (bytes.length > SOUND_BUDGET.fileBytes) problems.push(`${(bytes.length / 1024).toFixed(1)} KB, over ${SOUND_BUDGET.fileBytes / 1024} KB`);
    }
    if (!credits.includes('`' + file + '`')) problems.push('not in CREDITS.md');
    const size = bytes ? `${(bytes.length / 1024).toFixed(1)} KB` : 'missing';
    console.log(`Sound: public/${SOUND_DIR}/${file} ${size}; limit ${SOUND_BUDGET.fileBytes / 1024} KB: ${problems.length ? 'FAIL' : 'pass'}`);
    for (const p of problems) failures.push(`public/${SOUND_DIR}/${file}: ${p}`);
  }
  const over = soundTotal > SOUND_BUDGET.totalBytes;
  console.log(`Sounds: ${(soundTotal / 1024).toFixed(1)} KB in all; limit ${SOUND_BUDGET.totalBytes / 1024} KB: ${over ? 'FAIL' : 'pass'}`);
  if (over) failures.push(`public/${SOUND_DIR}: ${(soundTotal / 1024).toFixed(1)} KB, over ${SOUND_BUDGET.totalBytes / 1024} KB`);

  if (failures.length) {
    console.error(`assets:check failed: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('assets:check passed.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
