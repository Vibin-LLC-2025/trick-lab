// npm run assets: builds public/models/board.glb (medium), board-high.glb
// (high), shoes.glb and ground.glb (see scripts/lib/build.ts) and prints what
// went into each. They are committed; npm run assets:check (part of npm run
// verify) enforces each file's budget on the committed bytes. The KTX2
// textures' transcoder is three's own, emitted by Vite into the build (ADR-49,
// updated by PLAN-PLAY-POLISH-REACH step 4), so nothing is copied here.
// `npm run assets -- ground` (asset keys from src/asset/spec.ts) builds only
// those files; the build is deterministic, so the others would not change.
// It also writes the deck textures (public/models/decks, step 16, ADR-71);
// `npm run assets -- decks` builds only those.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECK_FILES } from '../src/asset/deckSpec';
import { ASSET_FILES, type AssetKey } from '../src/asset/spec';
import { buildAsset, buildDeckTexture } from './lib/build';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const all = Object.keys(ASSET_FILES) as AssetKey[];
  const asked = process.argv.slice(2);
  const decks = asked.length === 0 || asked.includes('decks');
  const keys = asked.filter((k) => k !== 'decks');
  const unknown = keys.filter((k) => !all.includes(k as AssetKey));
  if (unknown.length) throw new Error(`unknown asset key(s) ${unknown.join(', ')}; use ${all.join(', ')} or decks`);
  for (const key of asked.length ? (keys as AssetKey[]) : all) {
    const file = ASSET_FILES[key];
    const out = resolve(ROOT, 'public', file);
    const t0 = performance.now();
    const { glb, report } = await buildAsset(key);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, glb);
    const total = Object.values(report.triangles).reduce((a, b) => a + b, 0);
    console.log(`${file}: ${kb(glb.length)}, ${total.toLocaleString('en-US')} triangles, built in ${Math.round(performance.now() - t0)} ms`);
    console.log(`  triangles: ${Object.entries(report.triangles).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`  zero-area triangles dropped at the spine tips: ${report.droppedTriangles}`);
    console.log(`  textures (KTX2): ${Object.entries(report.textureBytes).map(([k, v]) => `${k} ${kb(v)}`).join(', ')}`);
    console.log(`  wrote ${out}`);
  }
  if (!decks) return;
  for (const { deck, level, file } of DECK_FILES) {
    const out = resolve(ROOT, 'public', file);
    const t0 = performance.now();
    const ktx2 = await buildDeckTexture(deck, level);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, ktx2);
    console.log(`${file}: ${kb(ktx2.length)}, built in ${Math.round(performance.now() - t0)} ms`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
