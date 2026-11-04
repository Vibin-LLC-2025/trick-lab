// @vitest-environment node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { boardTriangles, buildBoard } from '../../src/asset/board';
import { BOARD_GLB, BUDGET, OUTLINE, REST_Y } from '../../src/asset/spec';
import { evaluateBudget, formatTable, gpuBytes, type AssetStats } from './budget';
import { buildBoardGlb } from './build';
import { inspectGlb } from './inspect';

const good: AssetStats = {
  fileBytes: 200 * 1024,
  drawCalls: 7,
  triangles: 13000,
  materials: 7,
  textures: [
    { name: 'grip', width: 512, height: 512, bytes: 100, mipmapped: true },
    { name: 'deckBottom', width: 1024, height: 256, bytes: 100, mipmapped: true },
  ],
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  nodeNames: ['Board', 'Deck_Grip', 'Deck_Wood', 'Deck_Graphic', 'Truck_Aluminium', 'Truck_Steel', 'Truck_Bushings', 'Wheels'],
  bounds: { min: [OUTLINE.tailTip, -REST_Y, -OUTLINE.width / 2], max: [OUTLINE.noseTip, 0.05, OUTLINE.width / 2] },
};

const failing = (s: AssetStats) => evaluateBudget(s).filter((r) => !r.ok).map((r) => r.check);

describe('asset budget rules', () => {
  it('passes a board inside every budget', () => {
    expect(failing(good)).toEqual([]);
  });

  it.each<[string, Partial<AssetStats>, string]>([
    ['a file over 300 KB', { fileBytes: BUDGET.fileBytes + 1 }, 'GLB file size'],
    ['a ninth draw call', { drawCalls: 9 }, 'Draw calls (primitives)'],
    ['too many triangles', { triangles: 25001 }, 'Triangles'],
    ['a missing meshopt extension', { extensionsRequired: ['KHR_mesh_quantization'] }, 'EXT_meshopt_compression'],
    ['Draco', { extensionsUsed: ['KHR_draco_mesh_compression'] }, 'No Draco (CDN decoder)'],
    ['a missing part', { nodeNames: ['Board', 'Deck_Grip'] }, 'Part nodes'],
    ['wheels below the pad', { bounds: { min: [OUTLINE.tailTip, -REST_Y - 0.001, -0.1016], max: [OUTLINE.noseTip, 0.05, 0.1016] } }, 'Wheel bottoms (min y)'],
  ])('fails %s', (_name, patch, check) => {
    expect(failing({ ...good, ...patch })).toEqual([check]);
  });

  it('fails textures that are too many, too big, not power of two or not mipmapped', () => {
    const t = good.textures[0]!;
    expect(failing({ ...good, textures: [t, t, t, t, t] })).toEqual(['Textures']);
    expect(failing({ ...good, textures: [{ ...t, width: 2048 }] })).toEqual(['Texture long side']);
    expect(failing({ ...good, textures: [{ ...t, width: 500 }] })).toEqual(['Textures power of two']);
    expect(failing({ ...good, textures: [{ ...t, mipmapped: false }] })).toEqual(['Textures mipmapped (sampler)']);
  });

  it('estimates GPU memory as RGBA8 plus a third for mips', () => {
    expect(gpuBytes({ width: 512, height: 512 })).toBeCloseTo((512 * 512 * 4 * 4) / 3, 6);
  });

  it('prints one table row per check', () => {
    const table = formatTable(evaluateBudget(good));
    expect(table.split('\n')).toHaveLength(evaluateBudget(good).length + 2);
    expect(table).toContain('pass');
    expect(table).not.toContain('FAIL');
  });
});

describe('the committed board.glb', () => {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../public', BOARD_GLB);

  it('meets the budget and matches the geometry source (run npm run assets if this fails)', async () => {
    const stats = await inspectGlb(path);
    expect(failing(stats)).toEqual([]);
    const expected = Object.values(boardTriangles(buildBoard())).reduce((a, b) => a + b, 0);
    expect(stats.triangles).toBe(expected);
    expect(stats.drawCalls).toBe(7);
  });

  it('is built deterministically', async () => {
    const [a, b] = await Promise.all([buildBoardGlb(), buildBoardGlb()]);
    expect(a.glb.length).toBeGreaterThan(0);
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
  });
});
