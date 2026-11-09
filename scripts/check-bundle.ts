// The download budget (PLAN-PLAY-POLISH-REACH step 3, docs/PERF-BUDGET.md):
// reads a production build (dist/, built with build.manifest) and checks what
// every first visit downloads, per file and per visit, against
// scripts/lib/bundleBudget.ts. The last step of `npm run verify`, after `vite build`.
//
//   npx tsx scripts/check-bundle.ts [dist]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { checkBundle, compressedSize, formatReport, type Manifest } from './lib/bundleBudget';

const dist = process.argv[2] ?? 'dist';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(dist, p).split(sep).join('/')];
  });
}

const manifestPath = join(dist, '.vite', 'manifest.json');
let manifest: Manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
} catch {
  console.error(`bundle:check: no ${manifestPath}. Build first (vite build, with build.manifest on).`);
  process.exit(1);
}

const report = checkBundle({ manifest, size: (path) => compressedSize(path, readFileSync(join(dist, path))) }, walk(dist));
console.log(formatReport(report));
if (report.failures.length) {
  console.error(`bundle:check failed:\n${report.failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('bundle:check passed.');
