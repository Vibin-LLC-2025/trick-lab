// npm run assets:check (also the last step of npm run verify): reads the
// committed public/models/board.glb and fails if any budget in
// docs/BRIEF-BOARD.md is exceeded. Prints the table either way.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_GLB } from '../src/asset/spec';
import { evaluateBudget, formatTable } from './lib/budget';
import { inspectGlb } from './lib/inspect';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(ROOT, 'public', BOARD_GLB);

async function main() {
  if (!existsSync(path)) {
    console.error(`assets:check: ${path} is missing. Run npm run assets.`);
    process.exit(1);
  }
  const rows = evaluateBudget(await inspectGlb(path));
  console.log(`Asset budget: public/${BOARD_GLB}\n`);
  console.log(formatTable(rows));
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\nassets:check failed: ${failed.map((r) => r.check.trim()).join(', ')}`);
    process.exit(1);
  }
  console.log('\nassets:check passed.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
