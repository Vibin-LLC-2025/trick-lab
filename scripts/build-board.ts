// npm run assets: builds public/models/board.glb (medium), board-high.glb
// (high), shoes.glb and ground.glb (see scripts/lib/build.ts) and prints what
// went into each. The GLBs are committed; npm run assets:check (part of npm
// run verify) enforces each file's budget on the committed bytes.
// `npm run assets -- ground` (asset keys from src/asset/spec.ts) builds only
// those files; the build is deterministic, so the others would not change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_FILES, type AssetKey } from '../src/asset/spec';
import { buildAsset } from './lib/build';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const all = Object.keys(ASSET_FILES) as AssetKey[];
  const asked = process.argv.slice(2);
  const unknown = asked.filter((k) => !all.includes(k as AssetKey));
  if (unknown.length) throw new Error(`unknown asset key(s) ${unknown.join(', ')}; use ${all.join(', ')}`);
  for (const key of asked.length ? (asked as AssetKey[]) : all) {
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
    console.log(`  textures (PNG): ${Object.entries(report.textureBytes).map(([k, v]) => `${k} ${kb(v)}`).join(', ')}`);
    console.log(`  wrote ${out}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
