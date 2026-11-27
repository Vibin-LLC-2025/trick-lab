// Writes the product shots that scripts/shot/capture.js returned (2026-11-22):
// `<name>.png` at the shot's size and `<name>@2x.png` at twice it, into the
// given folder. Usage: npx tsx scripts/shot/write.ts shots.json <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Shots {
  meta: Record<string, unknown>;
  files: Record<string, { x1: string; x2?: string }>;
}

const [input, out] = process.argv.slice(2);
if (!input || !out) {
  console.error('Usage: npx tsx scripts/shot/write.ts shots.json <out dir>');
  process.exit(1);
}
// playwright-cli --raw prints the returned value; tolerate anything before the JSON.
const text = readFileSync(input, 'utf8');
const shots = JSON.parse(text.slice(text.indexOf('{'))) as Shots;
mkdirSync(out, { recursive: true });
for (const [name, f] of Object.entries(shots.files)) {
  for (const [suffix, b64] of [['', f.x1], ['@2x', f.x2]] as const) {
    if (!b64) continue;
    const path = join(out, `${name.replace(/[^a-z0-9@.-]+/gi, '-')}${suffix}.png`);
    const bytes = Buffer.from(b64, 'base64');
    writeFileSync(path, bytes);
    console.log(`${path}  ${Math.round(bytes.length / 1024)} KB`);
  }
}
console.log(JSON.stringify(shots.meta, null, 2));
