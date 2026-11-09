// Writes the loading pictures (ADR-56) from scripts/still/capture.js's output:
//
//   npx tsx scripts/still/write.ts stills.json
//
// Each theme's WebP is checked against src/asset/stillSpec.ts (WebP, the
// size, the byte budget) before anything is written, so a bad capture leaves
// the committed files alone. npm run assets:check holds them to the same.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STILL, STILL_THEMES, stillFile } from '../../src/asset/stillSpec';
import { readWebp, stillProblems } from '../lib/webp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('usage: npx tsx scripts/still/write.ts stills.json');
  // playwright-cli --raw prints the returned object as JSON (older versions as a JSON string of it).
  let parsed: unknown = JSON.parse(readFileSync(input, 'utf8'));
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  const { meta, files } = parsed as { meta: unknown; files: Record<string, string> };

  const out = STILL_THEMES.map((theme) => {
    const b64 = files[theme];
    const bytes = b64 ? Buffer.from(b64, 'base64') : null;
    const problems = stillProblems(bytes, STILL);
    if (problems.length) throw new Error(`${theme}: ${problems.join(', ')}`);
    return { theme, bytes: bytes!, path: resolve(ROOT, 'public', stillFile(theme)) };
  });

  for (const { theme, bytes, path } of out) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    const info = readWebp(bytes)!;
    console.log(`${theme}: public/${stillFile(theme)} ${info.width} x ${info.height} ${info.format}, ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  console.log(JSON.stringify(meta));
}

main();
