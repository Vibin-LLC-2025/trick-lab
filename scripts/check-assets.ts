// npm run assets:check (also the last step of npm run verify): reads the
// committed GLBs in public/models and fails if any file exceeds its budget
// (src/asset/spec.ts BUDGETS, from docs/BRIEF-BOARD.md and the quality tiers
// pass of 2026-11-04). Prints one table per file either way.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_FILES, type AssetKey } from '../src/asset/spec';
import { evaluateBudget, formatTable } from './lib/budget';
import { inspectGlb } from './lib/inspect';

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
