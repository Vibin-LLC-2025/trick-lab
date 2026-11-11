import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { budgetKey, checkBundle, compressedSize, FILE_BUDGETS, FONT, inventory, type Manifest } from './bundleBudget';

// A build shaped like the real one (dist/.vite/manifest.json on 2026-11-09), with hashed names.
const MANIFEST: Manifest = {
  '_artDirection-AAAA1111.js': { file: 'assets/artDirection-AAAA1111.js', imports: ['index.html'] },
  '_shoeSpec-BBBB2222.js': { file: 'assets/shoeSpec-BBBB2222.js' },
  'index.html': { file: 'assets/index-CCCC3333.js', css: ['assets/index-DDDD4444.css'], assets: ['assets/bungee-latin-400-normal-EEEE.woff2'] },
  'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js': { file: 'assets/basis_transcoder-LLLL.js' },
  'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm': { file: 'assets/basis_transcoder-FFFF.wasm' },
  'src/scene/Spare.tsx': { file: 'assets/Spare-MMMM.js' },
  'src/scene/BoardModel.tsx': {
    file: 'assets/BoardModel-GGGG.js',
    imports: ['index.html', 'src/scene/TrickScene.tsx', '_artDirection-AAAA1111.js'],
    assets: ['assets/basis_transcoder-FFFF.wasm', 'assets/basis_transcoder-LLLL.js'],
  },
  'src/scene/GroundModel.tsx': { file: 'assets/GroundModel-HHHH.js', imports: ['index.html', 'src/scene/BoardModel.tsx'] },
  'src/scene/ShoesModel.tsx': { file: 'assets/ShoesModel-IIII.js', imports: ['_shoeSpec-BBBB2222.js', 'src/scene/BoardModel.tsx'] },
  'src/scene/RiderModel.tsx': { file: 'assets/RiderModel-NNNN.js', imports: ['index.html', 'src/scene/BoardModel.tsx'] },
  'src/scene/TrickScene.tsx': { file: 'assets/TrickScene-JJJJ.js', imports: ['index.html', '_artDirection-AAAA1111.js', '_shoeSpec-BBBB2222.js'] },
  'src/scene/nodeRenderer.ts': { file: 'assets/nodeRenderer-KKKK.js', imports: ['_artDirection-AAAA1111.js', 'src/scene/TrickScene.tsx'] },
  [FONT]: { file: 'assets/bungee-latin-400-normal-EEEE.woff2' },
};

const COMMON = [
  'index.html',
  'assets/index-CCCC3333.js',
  'assets/index-DDDD4444.css',
  'assets/bungee-latin-400-normal-EEEE.woff2',
  'assets/TrickScene-JJJJ.js',
  'assets/artDirection-AAAA1111.js',
  'assets/shoeSpec-BBBB2222.js',
];
const MODELS = ['assets/nodeRenderer-KKKK.js', 'assets/BoardModel-GGGG.js', 'assets/GroundModel-HHHH.js'];
const TRANSCODER = ['assets/basis_transcoder-LLLL.js', 'assets/basis_transcoder-FFFF.wasm'];
const sorted = (xs: string[]) => [...xs].sort();

/** Every file of the fixture build, small and compressible. */
function fixture(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const m of Object.values(MANIFEST)) {
    files.set(m.file, new Uint8Array(200).fill(97));
    for (const c of m.css ?? []) files.set(c, new Uint8Array(200).fill(98));
  }
  for (const f of ['index.html', 'models/board-high.glb', 'models/board.glb', 'models/ground.glb', 'models/shoes.glb', 'models/rider.glb', 'stills/welcome-dark.webp', 'stills/welcome-light.webp'])
    files.set(f, new Uint8Array(200).fill(99));
  return files;
}

const buildOf = (files: Map<string, Uint8Array>) => ({
  manifest: MANIFEST,
  size: (path: string) => {
    const b = files.get(path);
    if (!b) throw new Error(`missing ${path}`);
    return compressedSize(path, b);
  },
});

describe('the download budget (PLAN-PLAY-POLISH-REACH step 3)', () => {
  it('lists each first visit explicitly: the entry and its imports once, the tier lazy chunks, its public files', () => {
    const paths = (tier: 'high' | 'medium' | 'low', feet = true, theme: 'dark' | 'light' = 'dark') =>
      sorted(inventory({ tier, theme, feet }, MANIFEST).map((f) => f.path));
    expect(paths('low')).toEqual(sorted([...COMMON, 'stills/welcome-dark.webp']));
    // The whole rider (ADR-85) on the welcome screen's preview, Medium and High with the feet.
    const RIDER = ['assets/RiderModel-NNNN.js', 'models/rider.glb'];
    expect(paths('medium')).toEqual(sorted([...COMMON, ...MODELS, ...RIDER, ...TRANSCODER, 'models/board.glb', 'models/ground.glb', 'stills/welcome-dark.webp']));
    expect(paths('high')).toEqual(
      sorted([...COMMON, ...MODELS, 'assets/ShoesModel-IIII.js', ...RIDER, ...TRANSCODER, 'models/board-high.glb', 'models/ground.glb', 'models/shoes.glb', 'stills/welcome-dark.webp']),
    );
    // The feet off: no shoe chunk and no shoes on High, and no rider; the theme picks the picture.
    expect(paths('high', false, 'light')).toEqual(
      sorted([...COMMON, ...MODELS, ...TRANSCODER, 'models/board-high.glb', 'models/ground.glb', 'stills/welcome-light.webp']),
    );
  });

  it('keys build files by name without the hash, so a rebuild keeps its budgets', () => {
    expect(budgetKey('_artDirection-AAAA1111.js')).toBe('_artDirection');
    expect(budgetKey('assets/index-DDDD4444.css')).toBe('assets/index.css');
    expect(budgetKey('src/scene/TrickScene.tsx')).toBe('src/scene/TrickScene.tsx');
    for (const v of ['high', 'medium', 'low'] as const)
      for (const f of inventory({ tier: v, theme: 'light', feet: true }, MANIFEST)) expect(FILE_BUDGETS[f.name], f.name).toBeGreaterThan(0);
  });

  it('passes a small build and counts an emitted file nobody fetches nowhere', () => {
    const files = fixture();
    const r = checkBundle(buildOf(files), [...files.keys()]);
    expect(r.failures).toEqual([]);
    expect(r.unused).toEqual(['assets/Spare-MMMM.js']);
    // Shared files count once per visit.
    const high = r.visits.find((v) => v.visit.tier === 'high' && v.visit.feet)!;
    expect(new Set(high.files.map((f) => f.path)).size).toBe(high.files.length);
  });

  it('fails on a file whose compressed size is over its budget, naming it, even when the raw size looks small', () => {
    const files = fixture();
    // Random bytes do not compress: gzip makes them a little larger.
    const budget = FILE_BUDGETS['models/board.glb']!;
    const noise = randomBytes(budget);
    expect(compressedSize('models/board.glb', noise)).toBeGreaterThan(budget);
    files.set('models/board.glb', noise);
    const r = checkBundle(buildOf(files), [...files.keys()]);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatch(/^models\/board\.glb .* over its/);
  });

  it('fails a visit whose total is over the tier limit, and a file with no budget', () => {
    const files = fixture();
    const r = checkBundle(buildOf(files), [...files.keys()], { ...FILE_BUDGETS, 'stills/welcome-dark.webp': undefined as unknown as number }, { high: 10, medium: 1e9, low: 1e9 });
    expect(r.failures.some((f) => f.startsWith('stills/welcome-dark.webp') && f.includes('no budget'))).toBe(true);
    expect(r.failures.some((f) => f.startsWith('a first visit (high'))).toBe(true);
    expect(r.failures.some((f) => f.startsWith('a first visit (medium'))).toBe(false);
  });
});
