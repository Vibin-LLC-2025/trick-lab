// Builds the GLBs in memory: geometry from src/asset/, procedural textures
// (src/asset/textures.ts, shoeTextures.ts, groundTextures.ts), the deck
// graphic rasterized from assets/source/deck-graphic.svg, then meshopt
// compression and quantization. Deterministic: the same sources give the
// same bytes (tested). Four assets share one builder: the medium board (the
// original board.glb, unchanged), the high board and the shoe (quality tiers
// and feet, 2026-11-04), and the concrete ground (ground pass, 2026-11-04).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO, TextureInfo, type Material, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { Resvg } from '@resvg/resvg-js';
import { MeshoptEncoder } from 'meshoptimizer';
import type { BufferGeometry } from 'three';
import { buildBoard, triangleCount } from '../../src/asset/board';
import { buildGround } from '../../src/asset/ground';
import { BAY, GROUND_MATERIAL, GROUND_NORMAL_SCALE, GROUND_PARTS, GROUND_TEXTURES, PLANE_BAYS, groundRepeat } from '../../src/asset/groundSpec';
import { concreteColor, concreteNormal, concreteRoughness, concreteTint } from '../../src/asset/groundTextures';
import { buildShoe } from '../../src/asset/shoe';
import { SHOE_MATERIALS, SHOE_PARTS, SHOE_TEXTURES } from '../../src/asset/shoeSpec';
import { solePixels, upperPixels, upperTint } from '../../src/asset/shoeTextures';
import {
  GRIP_NORMAL_SCALE,
  MATERIALS,
  OUTLINE,
  PARTS,
  REST_Y,
  TEXTURES,
  TEXTURES_HIGH,
  type AssetKey,
  type DetailLevel,
} from '../../src/asset/spec';
import {
  downsample2,
  gripGrey,
  gripHigh,
  gripTint,
  greyFromField,
  hexToRgb,
  normalMapFromHeight,
  plyPixels,
  plyPixelsHigh,
  wheelPixels,
  wearDeckBottom,
  wheelPixelsHigh,
  type Pixels,
} from '../../src/asset/textures';
import { encodePng } from './png';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPHIC_SVG = resolve(ROOT, 'assets/source/deck-graphic.svg');

/** glTF colour factors are linear; the design gives sRGB hex. */
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearFactor = (hex: string): [number, number, number, number] => {
  const [r, g, b] = hexToRgb(hex).map((c) => Number(srgbToLinear(c / 255).toFixed(6)));
  return [r!, g!, b!, 1];
};

const png = (p: Pixels) => encodePng(p.width, p.height, 3, p.rgb);

/** Rasterize the design's SVG at the texture size and drop the alpha (the field is opaque). */
function deckGraphic(T: { width: number; height: number }): Pixels {
  const svg = readFileSync(GRAPHIC_SVG, 'utf8');
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: T.width } }).render();
  if (img.width !== T.width || img.height !== T.height) throw new Error(`deck graphic rasterized at ${img.width} x ${img.height}`);
  const rgba = img.pixels;
  const rgb = new Uint8Array(T.width * T.height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!;
    rgb[j + 1] = rgba[i + 1]!;
    rgb[j + 2] = rgba[i + 2]!;
  }
  return { width: T.width, height: T.height, rgb };
}

/** The graphic with the deck wear baked over it (ADR-40), and the wear's roughness field. */
function wornDeckBottom(T: { width: number; height: number }) {
  return wearDeckBottom(deckGraphic(T));
}

export interface BuildReport {
  triangles: Record<string, number>;
  droppedTriangles: number;
  /** PNG bytes per texture file name. */
  textureBytes: Record<string, number>;
}

/** What one asset is made of, in glTF creation order (the order fixes the bytes). */
interface AssetSpec {
  rootName: string;
  extras: Record<string, unknown>;
  /** `repeat`: a KHR_texture_transform scale for a tiling map (UVs stay in [0, 1] so they quantize). */
  textures: { key: string; file: string; png: Uint8Array; wrap: 'repeat' | 'clamp'; repeat?: [number, number] }[];
  materials: {
    key: string;
    name: string;
    baseColor: [number, number, number, number];
    roughness: number;
    metalness: number;
    map?: string;
    normalMap?: { key: string; scale: number };
    /** glTF metallicRoughnessTexture (green is roughness, blue metalness). */
    roughnessMap?: string;
    /** Render both faces (the shoe upper: its inside shows through the opening). */
    doubleSided?: boolean;
  }[];
  parts: { node: string; material: string; geometry: BufferGeometry }[];
  droppedTriangles: number;
}

/** The board's tiling maps (the grip) repeat every `tile` metres over the deck's outline. */
const deckRepeat = (tile: number): [number, number] => [OUTLINE.length / tile, OUTLINE.width / tile];

function boardSpec(level: DetailLevel): AssetSpec {
  const board = buildBoard(level);
  const textures: AssetSpec['textures'] = [];
  if (level === 'medium') {
    const T = TEXTURES;
    const grip = gripGrey();
    textures.push(
      { key: 'grip', file: T.grip.file, png: encodePng(grip.width, grip.height, 1, grip.grey), wrap: T.grip.wrap, repeat: deckRepeat(T.grip.tile) },
      { key: 'deckBottom', file: T.deckBottom.file, png: png(wornDeckBottom(T.deckBottom).color), wrap: T.deckBottom.wrap },
      { key: 'ply', file: T.ply.file, png: png(plyPixels()), wrap: T.ply.wrap },
      { key: 'wheel', file: T.wheel.file, png: png(wheelPixels()), wrap: T.wheel.wrap },
    );
  } else {
    const T = TEXTURES_HIGH;
    const grip = gripHigh();
    const deck = wornDeckBottom(T.deckBottom);
    const rough = greyFromField(deck.roughness, T.deckBottom.width, T.deckBottom.height, T.deckRoughness.width, T.deckRoughness.height);
    textures.push(
      { key: 'grip', file: T.grip.file, png: png(grip.color), wrap: T.grip.wrap, repeat: deckRepeat(T.grip.tile) },
      {
        key: 'gripNormal',
        file: T.gripNormal.file,
        png: png(normalMapFromHeight(downsample2(grip.lift, T.grip.width, T.grip.height), T.gripNormal.width, T.gripNormal.height)),
        wrap: T.gripNormal.wrap,
        repeat: deckRepeat(T.gripNormal.tile),
      },
      { key: 'deckBottom', file: T.deckBottom.file, png: png(deck.color), wrap: T.deckBottom.wrap },
      { key: 'deckRoughness', file: T.deckRoughness.file, png: encodePng(rough.width, rough.height, 1, rough.grey), wrap: T.deckRoughness.wrap },
      { key: 'ply', file: T.ply.file, png: png(plyPixelsHigh()), wrap: T.ply.wrap },
      { key: 'wheel', file: T.wheel.file, png: png(wheelPixelsHigh()), wrap: T.wheel.wrap },
    );
  }
  const materials: AssetSpec['materials'] = (Object.keys(MATERIALS) as (keyof typeof MATERIALS)[]).map((key) => {
    const M = MATERIALS[key];
    return {
      key,
      name: M.name,
      // The medium grip is a grey map tinted by the base colour factor; the high grip is RGB.
      baseColor: key === 'grip' && level === 'medium' ? gripTint() : linearFactor(M.color),
      // The high graphic's roughness is the wear map's (glTF multiplies it by this factor).
      roughness: key === 'graphic' && level === 'high' ? 1 : M.roughness,
      metalness: M.metalness,
      map: 'map' in M ? M.map : undefined,
      normalMap: key === 'grip' && level === 'high' ? { key: 'gripNormal', scale: GRIP_NORMAL_SCALE } : undefined,
      roughnessMap: key === 'graphic' && level === 'high' ? 'deckRoughness' : undefined,
    };
  });
  return {
    rootName: 'Board',
    extras: {
      units: 'metres',
      restY: REST_Y,
      source: 'procedural, scripts/build-board.ts',
      design: 'docs/DESIGN.md section 7',
      // Only the high file says so, so the medium file's bytes stay as first committed.
      ...(level === 'high' ? { level } : {}),
    },
    textures,
    materials,
    parts: PARTS.map((p) => ({ node: p.node, material: p.material, geometry: board.parts[p.node] })),
    droppedTriangles: board.droppedTriangles,
  };
}

function shoeSpec(): AssetSpec {
  const shoe = buildShoe();
  const T = SHOE_TEXTURES;
  const upper = upperPixels();
  return {
    rootName: 'Shoe',
    extras: { units: 'metres', foot: 'right', source: 'procedural, scripts/build-board.ts', design: 'src/asset/shoeSpec.ts' },
    textures: [
      { key: 'sole', file: T.sole.file, png: png(solePixels()), wrap: T.sole.wrap },
      { key: 'upper', file: T.upper.file, png: encodePng(upper.width, upper.height, 1, upper.grey), wrap: T.upper.wrap },
    ],
    materials: (Object.keys(SHOE_MATERIALS) as (keyof typeof SHOE_MATERIALS)[]).map((key) => {
      const M = SHOE_MATERIALS[key];
      return {
        key,
        name: M.name,
        // The upper is a grey map tinted by the base colour factor (like the medium grip).
        baseColor: key === 'upper' ? upperTint() : linearFactor(M.color),
        roughness: M.roughness,
        metalness: M.metalness,
        map: 'map' in M ? M.map : undefined,
        doubleSided: 'doubleSided' in M ? M.doubleSided : undefined,
      };
    }),
    parts: SHOE_PARTS.map((p) => ({ node: p.node, material: p.material, geometry: shoe.parts[p.node] })),
    droppedTriangles: shoe.droppedTriangles,
  };
}

/**
 * The concrete ground: one plane, one material with colour, normal and
 * roughness maps, each a tile of its own number of bays with its own repeat
 * (groundSpec.ts GROUND_TEXTURES, ADR-40).
 */
function groundSpec(): AssetSpec {
  const T = GROUND_TEXTURES;
  const color = concreteColor();
  const rough = concreteRoughness();
  return {
    rootName: 'Ground',
    extras: {
      units: 'metres',
      bay: [BAY.x, BAY.z],
      bays: [PLANE_BAYS.x, PLANE_BAYS.z],
      source: 'procedural, scripts/build-board.ts',
      design: 'src/asset/groundSpec.ts',
    },
    textures: [
      { key: 'color', file: T.color.file, png: encodePng(color.width, color.height, 1, color.grey), wrap: 'repeat', repeat: groundRepeat('color') },
      { key: 'normal', file: T.normal.file, png: png(concreteNormal()), wrap: 'repeat', repeat: groundRepeat('normal') },
      {
        key: 'roughness',
        file: T.roughness.file,
        png: encodePng(rough.width, rough.height, 1, rough.grey),
        wrap: 'repeat',
        repeat: groundRepeat('roughness'),
      },
    ],
    materials: [
      {
        key: GROUND_PARTS[0].material,
        name: GROUND_MATERIAL.name,
        // The colour map is grey; the factor tints its mean onto CONCRETE.color.
        baseColor: concreteTint(),
        roughness: GROUND_MATERIAL.roughness,
        metalness: GROUND_MATERIAL.metalness,
        map: 'color',
        normalMap: { key: 'normal', scale: GROUND_NORMAL_SCALE },
        roughnessMap: 'roughness',
      },
    ],
    parts: GROUND_PARTS.map((p) => ({ node: p.node, material: p.material, geometry: buildGround() })),
    droppedTriangles: 0,
  };
}

async function buildGlb(spec: AssetSpec): Promise<{ glb: Uint8Array; report: BuildReport }> {
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  doc.getRoot().getAsset().generator = 'trick-lab scripts/build-board.ts (glTF-Transform 4.5.1)';
  const buffer = doc.createBuffer();
  const textureTransform = doc.createExtension(KHRTextureTransform);

  const textures = new Map<string, Texture>();
  const textureSpec = new Map<string, AssetSpec['textures'][number]>();
  for (const t of spec.textures) {
    textures.set(t.key, doc.createTexture(t.key).setImage(t.png).setMimeType('image/png').setURI(t.file));
    textureSpec.set(t.key, t);
  }

  /** Sampler and (for a tiling map) the repeat transform; UVs are stored in [0, 1] so they quantize. */
  const configure = (info: TextureInfo, key: string) => {
    const T = textureSpec.get(key)!;
    const wrap = T.wrap === 'repeat' ? TextureInfo.WrapMode.REPEAT! : TextureInfo.WrapMode.CLAMP_TO_EDGE!;
    info
      .setWrapS(wrap)
      .setWrapT(wrap)
      .setMagFilter(TextureInfo.MagFilter.LINEAR!)
      .setMinFilter(TextureInfo.MinFilter.LINEAR_MIPMAP_LINEAR!);
    if (T.repeat) info.setExtension('KHR_texture_transform', textureTransform.createTransform().setScale(T.repeat));
  };

  const materials = new Map<string, Material>();
  for (const M of spec.materials) {
    const m = doc.createMaterial(M.name).setBaseColorFactor(M.baseColor).setRoughnessFactor(M.roughness).setMetallicFactor(M.metalness);
    if (M.doubleSided) m.setDoubleSided(true);
    if (M.map) {
      m.setBaseColorTexture(textures.get(M.map)!);
      configure(m.getBaseColorTextureInfo()!, M.map);
    }
    if (M.normalMap) {
      m.setNormalTexture(textures.get(M.normalMap.key)!).setNormalScale(M.normalMap.scale);
      configure(m.getNormalTextureInfo()!, M.normalMap.key);
    }
    if (M.roughnessMap) {
      m.setMetallicRoughnessTexture(textures.get(M.roughnessMap)!);
      configure(m.getMetallicRoughnessTextureInfo()!, M.roughnessMap);
    }
    materials.set(M.key, m);
  }

  const accessor = (type: 'VEC2' | 'VEC3' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  const root = doc.createNode(spec.rootName).setExtras(spec.extras);
  const scene = doc.createScene(spec.rootName).addChild(root);
  doc.getRoot().setDefaultScene(scene);

  const textured = new Set(spec.materials.filter((m) => m.map).map((m) => m.key));
  for (const { node, material, geometry: g } of spec.parts) {
    const prim = doc
      .createPrimitive()
      .setMaterial(materials.get(material)!)
      .setAttribute('POSITION', accessor('VEC3', g.getAttribute('position').array as Float32Array))
      .setAttribute('NORMAL', accessor('VEC3', g.getAttribute('normal').array as Float32Array));
    const uv = g.getAttribute('uv');
    if (uv && textured.has(material)) prim.setAttribute('TEXCOORD_0', accessor('VEC2', uv.array as Float32Array));
    // A linear vertex colour multiplies the base colour (the board's dark bolts in the steel group, ADR-40).
    const color = g.getAttribute('color');
    if (color) prim.setAttribute('COLOR_0', accessor('VEC3', color.array as Float32Array));
    const count = g.getAttribute('position').count;
    const index = Array.from(g.index!.array);
    prim.setIndices(accessor('SCALAR', count < 65536 ? new Uint16Array(index) : new Uint32Array(index)));
    root.addChild(doc.createNode(node).setMesh(doc.createMesh(node).addPrimitive(prim)));
  }

  await MeshoptEncoder.ready;
  // meshopt() = reorder for size + KHR_mesh_quantization (14-bit positions,
  // 8-bit octahedral normals, 12-bit UVs) + EXT_meshopt_compression filters.
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(doc);
  const report: BuildReport = {
    triangles: Object.fromEntries(spec.parts.map((p) => [p.node, triangleCount(p.geometry)])),
    droppedTriangles: spec.droppedTriangles,
    textureBytes: Object.fromEntries(spec.textures.map((t) => [t.file, t.png.length])),
  };
  return { glb, report };
}

/** The board GLB at a detail level ('medium' is public/models/board.glb, 'high' is board-high.glb). */
export const buildBoardGlb = (level: DetailLevel = 'medium') => buildGlb(boardSpec(level));

/** The right shoe GLB (public/models/shoes.glb). */
export const buildShoesGlb = () => buildGlb(shoeSpec());

/** The concrete ground GLB (public/models/ground.glb). */
export const buildGroundGlb = () => buildGlb(groundSpec());

/** Build any asset by its key. */
export function buildAsset(key: AssetKey): Promise<{ glb: Uint8Array; report: BuildReport }> {
  if (key === 'board') return buildBoardGlb('medium');
  if (key === 'boardHigh') return buildBoardGlb('high');
  if (key === 'ground') return buildGroundGlb();
  return buildShoesGlb();
}
