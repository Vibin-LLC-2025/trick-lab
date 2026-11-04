// npm run assets: builds public/models/board.glb (see scripts/lib/build.ts)
// and prints what went into it. The GLB is committed; npm run assets:check
// (part of npm run verify) enforces the budget on the committed file.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_GLB } from '../src/asset/spec';
import { buildBoardGlb } from './lib/build';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public', BOARD_GLB);

async function main() {
  const t0 = performance.now();
  const { glb, report } = await buildBoardGlb();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, glb);
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const total = Object.values(report.triangles).reduce((a, b) => a + b, 0);
  console.log(`board.glb: ${kb(glb.length)}, ${total.toLocaleString('en-US')} triangles, built in ${Math.round(performance.now() - t0)} ms`);
  console.log(`  triangles: ${Object.entries(report.triangles).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  zero-area triangles dropped at the deck spine tips: ${report.droppedTriangles}`);
  console.log(`  textures (PNG): ${Object.entries(report.textureBytes).map(([k, v]) => `${k} ${kb(v)}`).join(', ')}`);
  console.log(`  wrote ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
