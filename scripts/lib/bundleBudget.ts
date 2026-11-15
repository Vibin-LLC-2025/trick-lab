// The download budget (PLAN-PLAY-POLISH-REACH step 3): what each first visit
// downloads, listed explicitly per tier, theme and feet setting, and the most
// each file and each visit may weigh. `npm run bundle:check` (scripts/check-bundle.ts)
// reads a production build against it, at the end of `npm run verify`.
//
// A first visit is the welcome screen, cold. It fetches:
// - the page, the entry chunk with its static imports, its stylesheet and the
//   display face;
// - the 3D chunk (TrickScene) and, on the tiers that have them, the model
//   chunks and the WebGPURenderer's (ADR-50), each with its static imports;
// - on Medium and High, the KTX2 transcoder (three's own, emitted by Vite, ADR-49);
// - public files at run time: the tier's models (modelFiles.ts) and the theme's
//   loading picture (stillSpec.ts).
// Shared files count once per visit. An emitted file no visit lists counts
// nowhere (the check prints it). Sizes are compressed the way the live host
// sends them (serve.ts's GZIP set, gzip level 6); WebP and WOFF2 as they are.
import { gzipSync } from 'node:zlib';
import { extname } from 'node:path';
import { stillFile, STILL_THEMES, type StillTheme } from '../../src/asset/stillSpec';
import { modelFilesFor } from '../../src/scene/modelFiles';
import { GZIP } from '../measure/serve';

export type Tier = 'high' | 'medium' | 'low';
export const TIERS: readonly Tier[] = ['high', 'medium', 'low'];

export interface Visit {
  tier: Tier;
  theme: StillTheme;
  feet: boolean;
}

/** Every visit the budget covers: each tier in each theme, feet on and off. */
export const VISITS: readonly Visit[] = TIERS.flatMap((tier) => STILL_THEMES.flatMap((theme) => [true, false].map((feet) => ({ tier, theme, feet }))));

/** One downloaded file: a build output by its manifest key, or a file from public/ by its path. */
export type Item = { manifest: string } | { public: string } | { page: true };

/** The entry, its stylesheet and assets come from the manifest; the display face is named so a stray asset is not counted. */
export const ENTRY = 'index.html';
export const FONT = 'src/styles/fonts/bungee-latin-400-normal.woff2';

/** The lazy chunks a tier fetches on a first visit to the welcome screen, by source module (manifest key). */
export function lazyChunks(v: Visit): string[] {
  if (v.tier === 'low') return ['src/scene/TrickScene.tsx'];
  const chunks = ['src/scene/TrickScene.tsx', 'src/scene/nodeRenderer.ts', 'src/scene/BoardModel.tsx', 'src/scene/GroundModel.tsx'];
  // The shoe model on High with the feet shown (shoesFromModel); the primitive shoe otherwise.
  if (v.tier === 'high' && v.feet) chunks.push('src/scene/ShoesModel.tsx');
  // The whole rider (ADR-85) on the welcome screen's preview, with the feet
  // shown and the Rider switch at its default (on for Medium and High).
  if (v.feet) chunks.push('src/scene/RiderModel.tsx');
  return chunks;
}

/**
 * The KTX2 transcoder (ADR-49), fetched on Medium and High: its JavaScript
 * loader and its WebAssembly, three's own files, which KTX2Loader names with
 * `new URL(..., import.meta.url)`, so Vite emits them (manifest keys).
 */
export const TRANSCODER: readonly string[] = [
  'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js',
  'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm',
];

/** The public files a visit fetches at run time. */
export function publicItems(v: Visit): Item[] {
  const items: Item[] = modelFilesFor(v.tier, v.feet, v.tier !== 'low').map((f) => ({ public: f }));
  items.push({ public: stillFile(v.theme) });
  return items;
}

/** The name a file goes by in the table and the budgets: the manifest key, or the public path. */
export const itemName = (i: Item): string => ('page' in i ? 'index.html (the page)' : 'manifest' in i ? i.manifest : i.public);

const KB = 1024;

/**
 * The most each file may weigh, compressed, in bytes: the sizes in
 * PERF-BUDGET.md's step 14 tables (a0a2c86, 2026-11-09) plus about 5 percent,
 * rounded up to the KB, except the main script and its stylesheet, loosened
 * on 2026-11-10 (ADR-79) from 106 and 8 KB so the game's interface can grow.
 * A file not listed here fails the check: a new file needs a budget of its own.
 * The rider (ADR-85, 2026-11-11) adds its chunk and its GLB, each measured
 * plus about 5 percent; a second model chunk importing gltf.ts made Vite
 * split it out of BoardModel's chunk into a shared one (`_gltf`), so
 * BoardModel's 49 KB became 1 KB and `_gltf` 29 KB: moved, not added.
 * The 3D chunk goes from 83 to 84 KB with the polish pass (ADR-86,
 * 2026-11-11): the camera's rest framing and rise, the clear part of the
 * stage and the rider's wind-up came to 83.0 KB, a whisker over.
 */
export const FILE_BUDGETS: Record<string, number> = {
  'index.html (the page)': 2 * KB,
  'index.html': 160 * KB,
  'assets/index.css': 16 * KB,
  [FONT]: 16 * KB,
  _artDirection: 202 * KB,
  _shoeSpec: 2 * KB,
  // 85 KB since ADR-103 (2026-11-13): the lost-context watcher took it 27 bytes past 84.
  'src/scene/TrickScene.tsx': 85 * KB,
  'src/scene/nodeRenderer.ts': 185 * KB,
  'src/scene/BoardModel.tsx': 1 * KB,
  _gltf: 29 * KB,
  'src/scene/GroundModel.tsx': 1 * KB,
  'src/scene/ShoesModel.tsx': 1 * KB,
  'src/scene/RiderModel.tsx': 1 * KB,
  [TRANSCODER[0]!]: 17 * KB,
  [TRANSCODER[1]!]: 255 * KB,
  'models/board-high.glb': 470 * KB,
  'models/board.glb': 140 * KB,
  'models/ground.glb': 148 * KB,
  'models/shoes.glb': 176 * KB,
  'models/rider.glb': 51 * KB,
  // The detailed rider (ADR-94), High only: MakeHuman's body and its atlas (KTX2). ADR-101 (2026-11-13) gave the
  // jeans twice the pixels across in the same 2048 atlas: 573.4 KB compressed, from 430.3.
  'models/rider-high.glb': 574 * KB,
  'stills/welcome-dark.webp': 27 * KB,
  'stills/welcome-light.webp': 28 * KB,
};

/**
 * The most a first visit may download, per tier, whatever the theme and the
 * feet: step 14's "everything on a first visit" (High 1,639, Medium 1,158,
 * Low 410 KB) plus 5 percent, then loosened on 2026-11-10 (ADR-79) from
 * 1,721, 1,216 and 431 KB to leave room for the game, the graphics and how
 * the game feels. High raised from 1,900 to 2,300 KB on 2026-11-13 (ADR-94)
 * for its lifelike rider, which the owner chose for the machines the game is
 * designed for: the visit came to 2,118 KB.
 */
export const VISIT_BUDGETS: Record<Tier, number> = { high: 2300 * KB, medium: 1350 * KB, low: 500 * KB };

/** A build's manifest (dist/.vite/manifest.json): the fields the budget reads. */
export type Manifest = Record<string, { file: string; imports?: string[]; css?: string[]; assets?: string[] }>;

/**
 * The budget key of a build file: its manifest key, except a shared chunk
 * (`_name-hash.js`), which goes by `_name`, and a stylesheet, which goes by
 * its unhashed path, so a rebuild with new hashes keeps its budget.
 */
export const budgetKey = (name: string): string => {
  const shared = /^(_[A-Za-z0-9]+)-[A-Za-z0-9_-]+\.js$/.exec(name);
  if (shared) return shared[1]!;
  const css = /^(assets\/[A-Za-z0-9]+)-[A-Za-z0-9_-]+\.css$/.exec(name);
  if (css) return `${css[1]!}.css`;
  return name;
};

export interface FileRow {
  name: string;
  /** Where it is in the build (dist-relative). */
  path: string;
  bytes: number;
  budget: number | null;
}

/** What the check needs from a build: its manifest and each file's compressed size. */
export interface Build {
  manifest: Manifest;
  /** Compressed size of a dist-relative file; throws if it is missing. */
  size: (path: string) => number;
}

/** The files a visit downloads, in order, each once: (budget key, dist-relative path). */
export function inventory(v: Visit, manifest: Manifest): { name: string; path: string }[] {
  const out = new Map<string, string>();
  const add = (name: string, path: string) => {
    if (!out.has(path)) out.set(path, name);
  };
  add('index.html (the page)', 'index.html');
  const chunk = (key: string) => {
    const m = manifest[key];
    if (!m) throw new Error(`the manifest has no ${key}`);
    if (out.has(m.file)) return;
    add(key, m.file);
    for (const css of m.css ?? []) add(css, css);
    for (const i of m.imports ?? []) chunk(i);
  };
  chunk(ENTRY);
  const font = manifest[FONT];
  if (!font) throw new Error(`the manifest has no ${FONT}`);
  add(FONT, font.file);
  for (const key of lazyChunks(v)) chunk(key);
  if (v.tier !== 'low')
    for (const key of TRANSCODER) {
      const m = manifest[key];
      if (!m) throw new Error(`the manifest has no ${key}`);
      add(key, m.file);
    }
  for (const i of publicItems(v)) add(itemName(i), itemName(i));
  return [...out].map(([path, name]) => ({ name: budgetKey(name), path }));
}

/** Compressed size, as serve.ts sends the file: gzip level 6 for its GZIP set, as is otherwise. */
export const compressedSize = (path: string, bytes: Uint8Array): number => (GZIP.has(extname(path)) ? gzipSync(bytes, { level: 6 }).length : bytes.length);

export interface VisitRow {
  visit: Visit;
  files: FileRow[];
  total: number;
  budget: number;
}

export interface Report {
  visits: VisitRow[];
  /** Each failure names its file or its visit. */
  failures: string[];
  /** Build files no visit downloads (counted nowhere). */
  unused: string[];
}

const kb = (b: number) => `${(b / KB).toFixed(1)} KB`;
export const visitName = (v: Visit) => `${v.tier}, ${v.theme}, feet ${v.feet ? 'on' : 'off'}`;

/** Checks every visit of a build against the budgets. `files` is every dist-relative file the build has. */
export function checkBundle(build: Build, files: readonly string[], budgets = FILE_BUDGETS, visitBudgets = VISIT_BUDGETS): Report {
  const failures = new Set<string>();
  const used = new Set<string>();
  const visits = VISITS.map((visit) => {
    const rows = inventory(visit, build.manifest).map(({ name, path }) => {
      used.add(path);
      const bytes = build.size(path);
      const budget = budgets[name] ?? null;
      if (budget === null) failures.add(`${path} (${name}) has no budget in scripts/lib/bundleBudget.ts`);
      else if (bytes > budget) failures.add(`${path} (${name}) is ${kb(bytes)} compressed, over its ${kb(budget)}`);
      return { name, path, bytes, budget };
    });
    const total = rows.reduce((t, r) => t + r.bytes, 0);
    const budget = visitBudgets[visit.tier];
    if (total > budget) failures.add(`a first visit (${visitName(visit)}) downloads ${kb(total)}, over its ${kb(budget)}`);
    return { visit, files: rows, total, budget };
  });
  // The manifest's own file and source maps are never fetched by the app.
  const unused = files.filter((f) => !used.has(f) && !f.startsWith('.vite/') && !f.endsWith('.map'));
  return { visits, failures: [...failures], unused };
}

/** The report as text: a table per tier, then the failures. */
export function formatReport(r: Report): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);
  for (const tier of TIERS) {
    const rows = r.visits.filter((v) => v.visit.tier === tier);
    const first = rows[0]!;
    lines.push(`First visit, ${tier} (${rows.map((v) => `${v.visit.theme}/feet ${v.visit.feet ? 'on' : 'off'} ${kb(v.total)}`).join(', ')}; limit ${kb(first.budget)})`);
    const seen = new Set<string>();
    for (const v of rows)
      for (const f of v.files) {
        if (seen.has(f.path)) continue;
        seen.add(f.path);
        const ok = f.budget !== null && f.bytes <= f.budget;
        lines.push(`  ${pad(f.path, 52)} ${pad(kb(f.bytes), 10)} ${pad(f.budget === null ? 'no budget' : kb(f.budget), 10)} ${ok ? 'pass' : 'FAIL'}`);
      }
    lines.push('');
  }
  if (r.unused.length) lines.push(`Built but never downloaded on a first visit (not counted): ${r.unused.join(', ')}`, '');
  return lines.join('\n');
}
