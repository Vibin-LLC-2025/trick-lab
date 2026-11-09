// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { boardTriangles, buildBoard, triangleCount } from '../../src/asset/board';
import { buildGround } from '../../src/asset/ground';
import { PLANE } from '../../src/asset/groundSpec';
import { buildShoe, shoeTriangles } from '../../src/asset/shoe';
import { SHOE } from '../../src/asset/shoeSpec';
import { ASSET_FILES, BUDGET, BUDGETS, OUTLINE, REST_Y, type AssetKey } from '../../src/asset/spec';
import { evaluateBudget, formatTable, fullMipLevels, gpuBytes, type AssetStats } from './budget';
import { buildAsset } from './build';
import { inspectGlb } from './inspect';

const good: AssetStats = {
  fileBytes: 200 * 1024,
  drawCalls: 7,
  triangles: 13000,
  materials: 7,
  textures: [
    { name: 'grip', width: 512, height: 512, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 10 },
    { name: 'deckBottom', width: 1024, height: 256, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 11 },
  ],
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'],
  nodeNames: ['Board', 'Deck_Grip', 'Deck_Wood', 'Deck_Graphic', 'Truck_Aluminium', 'Truck_Steel', 'Truck_Bushings', 'Wheels'],
  bounds: { min: [OUTLINE.tailTip, -REST_Y, -OUTLINE.width / 2], max: [OUTLINE.noseTip, 0.05, OUTLINE.width / 2] },
};

const goodShoe: AssetStats = {
  fileBytes: 200 * 1024,
  drawCalls: 3,
  triangles: 9000,
  materials: 3,
  textures: [
    { name: 'sole', width: 16, height: 64, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 7 },
    { name: 'upper', width: 512, height: 512, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 10 },
  ],
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
  extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'],
  nodeNames: ['Shoe', 'Shoe_Sole', 'Shoe_Upper', 'Shoe_Laces'],
  bounds: { min: [-SHOE.length / 2, 0, -0.055], max: [SHOE.length / 2, 0.085, 0.05] },
};

const goodGround: AssetStats = {
  fileBytes: 400 * 1024,
  drawCalls: 1,
  triangles: 2,
  materials: 1,
  textures: [
    { name: 'color', width: 1024, height: 1024, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 11 },
    { name: 'normal', width: 1024, height: 1024, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 11 },
    { name: 'roughness', width: 256, height: 256, bytes: 100, mipmapped: true, mimeType: 'image/ktx2', levels: 9 },
  ],
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_transform'],
  extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'],
  nodeNames: ['Ground', 'Ground_Concrete'],
  bounds: { min: [-PLANE.x / 2, 0, -PLANE.z / 2], max: [PLANE.x / 2, 0, PLANE.z / 2] },
};

const failing = (s: AssetStats, key: AssetKey = 'board') => evaluateBudget(s, key).filter((r) => !r.ok).map((r) => r.check);

describe('asset budget rules', () => {
  it('passes a board inside every budget', () => {
    expect(failing(good)).toEqual([]);
  });

  it.each<[string, Partial<AssetStats>, string]>([
    ['a file over 300 KB', { fileBytes: BUDGET.fileBytes + 1 }, 'GLB file size'],
    ['a ninth draw call', { drawCalls: 9 }, 'Draw calls (primitives)'],
    ['too many triangles', { triangles: 25001 }, 'Triangles'],
    ['a missing meshopt extension', { extensionsRequired: ['KHR_mesh_quantization', 'KHR_texture_basisu'] }, 'EXT_meshopt_compression'],
    ['KTX2 textures without KHR_texture_basisu', { extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'] }, 'Textures KTX2 (Basis)'],
    ['Draco', { extensionsUsed: ['KHR_draco_mesh_compression'] }, 'No Draco (CDN decoder)'],
    ['a missing part', { nodeNames: ['Board', 'Deck_Grip'] }, 'Part nodes'],
    ['wheels below the pad', { bounds: { min: [OUTLINE.tailTip, -REST_Y - 0.001, -0.1016], max: [OUTLINE.noseTip, 0.05, 0.1016] } }, 'Wheel bottoms (min y)'],
  ])('fails %s', (_name, patch, check) => {
    expect(failing({ ...good, ...patch })).toEqual([check]);
  });

  it('fails textures that are too many, too big, not power of two or not mipmapped', () => {
    const t = good.textures[0]!;
    expect(failing({ ...good, textures: [t, t, t, t, t] })).toEqual(['Textures']);
    expect(failing({ ...good, textures: [{ ...t, width: 2048, levels: 12 }] })).toEqual(['Texture long side']);
    expect(failing({ ...good, textures: [{ ...t, width: 500 }] })).toEqual(['Textures power of two']);
    expect(failing({ ...good, textures: [{ ...t, mipmapped: false }] })).toEqual(['Textures mipmapped (sampler)']);
  });

  it('fails a texture that is not KTX2, or a KTX2 without its whole mip chain (ADR-49)', () => {
    const t = good.textures[0]!;
    expect(failing({ ...good, textures: [{ ...t, mimeType: 'image/png', levels: 1 }] })).toEqual(['Textures KTX2 (Basis)', 'Mip chains in the file']);
    expect(failing({ ...good, textures: [{ ...t, levels: 9 }] })).toEqual(['Mip chains in the file']);
    expect(fullMipLevels({ width: 2048, height: 512 })).toBe(12);
    expect(fullMipLevels({ width: 16, height: 128 })).toBe(8);
  });

  it('gives the high board its own limits: 2048 px textures, six of them, 120,000 triangles, 2.5 MB', () => {
    const t = good.textures[0]!;
    const high: AssetStats = { ...good, fileBytes: 2 * 1024 * 1024, triangles: 100000, textures: [t, t, t, t, t, { ...t, width: 2048, levels: 12 }] };
    expect(failing(high, 'boardHigh')).toEqual([]);
    expect(failing(high, 'board')).toEqual(['GLB file size', 'Triangles', 'Textures', 'Texture long side']);
    expect(failing({ ...high, fileBytes: BUDGETS.boardHigh.fileBytes + 1 }, 'boardHigh')).toEqual(['GLB file size']);
    expect(failing({ ...high, triangles: BUDGETS.boardHigh.triangles + 1 }, 'boardHigh')).toEqual(['Triangles']);
  });

  it('checks the shoe against its own nodes and footprint, not the deck', () => {
    expect(failing(goodShoe, 'shoes')).toEqual([]);
    expect(failing(goodShoe, 'board')).toContain('Part nodes');
    expect(failing({ ...goodShoe, drawCalls: 4 }, 'shoes')).toEqual(['Draw calls (primitives)']);
    expect(failing({ ...goodShoe, nodeNames: ['Shoe', 'Shoe_Sole'] }, 'shoes')).toEqual(['Part nodes']);
    expect(failing({ ...goodShoe, bounds: { min: [-0.15, 0, -0.055], max: [0.15, 0.085, 0.05] } }, 'shoes')).toEqual(['Length (x)']);
    expect(failing({ ...goodShoe, bounds: { min: [-SHOE.length / 2, -0.001, -0.055], max: [SHOE.length / 2, 0.085, 0.05] } }, 'shoes')).toEqual([
      'Sole bottom (min y)',
    ]);
    expect(evaluateBudget(goodShoe, 'shoes').map((r) => r.check)).not.toContain('Wheel bottoms (min y)');
  });

  it('checks the ground against its own limits and plane: 1 draw call, at least 24 m, odd bays, flat on y = 0', () => {
    expect(failing(goodGround, 'ground')).toEqual([]);
    expect(failing({ ...goodGround, drawCalls: 2 }, 'ground')).toEqual(['Draw calls (primitives)']);
    expect(failing({ ...goodGround, fileBytes: BUDGETS.ground.fileBytes + 1 }, 'ground')).toEqual(['GLB file size']);
    expect(failing({ ...goodGround, triangles: 65 }, 'ground')).toEqual(['Triangles']);
    // 15 bays of 1.6 m is 24 m but even counts put a joint under the board; 14 is too small and even.
    expect(failing({ ...goodGround, bounds: { min: [-12.8, 0, -PLANE.z / 2], max: [12.8, 0, PLANE.z / 2] } }, 'ground')).toEqual(['Size x (bays)']);
    expect(failing({ ...goodGround, bounds: { min: [-11.2, 0, -PLANE.z / 2], max: [11.2, 0, PLANE.z / 2] } }, 'ground')).toEqual(['Size x (bays)']);
    expect(failing({ ...goodGround, bounds: { min: [-PLANE.x / 2, -0.001, -PLANE.z / 2], max: [PLANE.x / 2, 0, PLANE.z / 2] } }, 'ground')).toEqual([
      'Surface height (y)',
    ]);
    expect(failing({ ...goodGround, bounds: { min: [-PLANE.x / 2 + 0.8, 0, -PLANE.z / 2], max: [PLANE.x / 2 + 0.8, 0, PLANE.z / 2] } }, 'ground')).toEqual([
      'Centred on the origin',
    ]);
    expect(failing({ ...goodGround, nodeNames: ['Ground'] }, 'ground')).toEqual(['Part nodes']);
  });

  it('estimates GPU memory plus a third for mips: RGBA8, or 1 byte a pixel for KTX2 (BC7)', () => {
    expect(gpuBytes({ width: 512, height: 512 })).toBeCloseTo((512 * 512 * 4 * 4) / 3, 6);
    expect(gpuBytes({ width: 512, height: 512, mimeType: 'image/ktx2' })).toBeCloseTo((512 * 512 * 4) / 3, 6);
  });

  it('prints one table row per check', () => {
    const table = formatTable(evaluateBudget(good));
    expect(table.split('\n')).toHaveLength(evaluateBudget(good).length + 2);
    expect(table).toContain('pass');
    expect(table).not.toContain('FAIL');
  });
});

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('the committed GLBs', () => {
  it('board.glb meets the budget and matches the geometry source (run npm run assets if this fails)', async () => {
    const stats = await inspectGlb(resolve(PUBLIC, ASSET_FILES.board));
    expect(failing(stats, 'board')).toEqual([]);
    expect(stats.triangles).toBe(sum(boardTriangles(buildBoard('medium'))));
    expect(stats.drawCalls).toBe(7);
    expect(stats.textures).toHaveLength(4);
  });

  it('board-high.glb meets the high budget, matches the source and carries the grip normal map and the deck wear roughness map', async () => {
    const stats = await inspectGlb(resolve(PUBLIC, ASSET_FILES.boardHigh));
    expect(failing(stats, 'boardHigh')).toEqual([]);
    expect(stats.triangles).toBe(sum(boardTriangles(buildBoard('high'))));
    expect(stats.drawCalls).toBe(7);
    expect(stats.textures.map((t) => t.name)).toEqual(['grip', 'gripNormal', 'deckBottom', 'deckRoughness', 'ply', 'wheel']);
    expect(stats.textures.every((t) => t.mipmapped && t.mimeType === 'image/ktx2' && t.levels === fullMipLevels(t))).toBe(true);
  });

  it('shoes.glb meets the shoe budget and matches the source', async () => {
    const stats = await inspectGlb(resolve(PUBLIC, ASSET_FILES.shoes));
    expect(failing(stats, 'shoes')).toEqual([]);
    expect(stats.triangles).toBe(sum(shoeTriangles(buildShoe())));
    expect(stats.drawCalls).toBe(3);
  });

  it('ground.glb meets the ground budget, matches the source and carries its three repeating maps', async () => {
    const stats = await inspectGlb(resolve(PUBLIC, ASSET_FILES.ground));
    expect(failing(stats, 'ground')).toEqual([]);
    expect(stats.triangles).toBe(triangleCount(buildGround()));
    expect(stats.drawCalls).toBe(1);
    expect(stats.textures.map((t) => t.name)).toEqual(['color', 'normal', 'roughness']);
    expect(stats.textures.every((t) => t.mipmapped)).toBe(true);
    expect(stats.extensionsUsed).toContain('KHR_texture_transform');
  });

  it.each(Object.keys(ASSET_FILES) as AssetKey[])('%s is built deterministically and the committed file is byte for byte that build', async (key) => {
    const [a, b] = await Promise.all([buildAsset(key), buildAsset(key)]);
    expect(a.glb.length).toBeGreaterThan(0);
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
    // Triangle counts miss a change that keeps them (a reversed winding, a moved vertex, a texel); the bytes do not.
    expect(Buffer.from(a.glb).equals(readFileSync(resolve(PUBLIC, ASSET_FILES[key]))), `run npm run assets -- ${key}`).toBe(true);
  });
});
