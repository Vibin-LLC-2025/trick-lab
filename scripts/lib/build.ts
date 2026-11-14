// Builds the GLBs in memory: geometry from src/asset/, procedural textures
// (src/asset/textures.ts, shoeTextures.ts, groundTextures.ts), the deck
// graphic rasterized from assets/source/deck-graphic.svg, each texture
// encoded as KTX2 (Basis Universal ETC1S with its mip chain, ADR-49), then
// meshopt compression and quantization. Deterministic: the same sources give
// the same bytes (tested). Four assets share one builder: the medium board (the
// original board.glb, unchanged), the high board and the shoe (quality tiers
// and feet, 2026-11-04), and the concrete ground (ground pass, 2026-11-04).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO, TextureInfo, type Material, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsSheen, KHRTextureBasisu, KHRTextureTransform } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { Resvg } from '@resvg/resvg-js';
import { encodeToKTX2 } from 'ktx2-encoder';
import { MeshoptEncoder } from 'meshoptimizer';
import type { BufferGeometry } from 'three';
import { buildBoard, triangleCount } from '../../src/asset/board';
import { buildGround } from '../../src/asset/ground';
import { BAY, GROUND_MATERIAL, GROUND_NORMAL_SCALE, GROUND_PARTS, GROUND_TEXTURES, PLANE_BAYS, groundRepeat } from '../../src/asset/groundSpec';
import { concreteColor, concreteNormal, concreteRoughness, concreteTint } from '../../src/asset/groundTextures';
import { buildRider } from '../../src/asset/rider';
import { fitRider, RIDER_HIGH_LEAF } from '../../src/asset/riderFit';
import { RIDER_HIGH_ATLAS, RIDER_HIGH_MATERIAL, RIDER_MATERIAL, RIDER_PARTS, RIDER_ROOT, RIDER_UV } from '../../src/asset/riderSpec';
import { newBodyPose, RIDER_BONES, writeBindPose } from '../../src/sim/body';
import { readRiderSource } from './riderSource';
import { buildShoe } from '../../src/asset/shoe';
import { SHOE_MATERIALS, SHOE_PARTS, SHOE_TEXTURES, UPPER_SHEEN } from '../../src/asset/shoeSpec';
import { DECKS, type FileDeck } from '../../src/asset/deckSpec';
import { deckTexture } from '../../src/asset/deckTexture';
import { buildSpot } from '../../src/asset/spot';
import { SPOT_MATERIAL, SPOT_PARTS, SPOT_STEEL_MATERIAL, SPOT_TEXTURES } from '../../src/asset/spotSpec';
import { spotColor, spotNormal } from '../../src/asset/spotTextures';
import { solePixels, upperPixels, upperTint } from '../../src/asset/shoeTextures';
import {
  GRAPHIC_CLEARCOAT,
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPHIC_SVG = resolve(ROOT, 'assets/source/deck-graphic.svg');

/** glTF colour factors are linear; the design gives sRGB hex. */
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearFactor = (hex: string): [number, number, number, number] => {
  const [r, g, b] = hexToRgb(hex).map((c) => Number(srgbToLinear(c / 255).toFixed(6)));
  return [r!, g!, b!, 1];
};

/** A texture's pixels before encoding: RGB, one grey channel, or RGBA (the detailed rider's atlas, cut out where its alpha is low, ADR-94). */
export interface Raster {
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  data: Uint8Array;
}
const rgb = (p: Pixels): Raster => ({ width: p.width, height: p.height, channels: 3, data: p.rgb });
const grey = (width: number, height: number, data: Uint8Array): Raster => ({ width, height, channels: 1, data });

/** What a texture feeds decides how it is encoded: colour is sRGB and perceptual, a normal map gets Basis's normal-map preset, data stays linear. */
export type TextureRole = 'color' | 'normal' | 'data';

/**
 * The texture settings (ADR-49): ETC1S, the smaller of Basis's two modes, at
 * its top quality level, which held the grip, the deck graphic, the shoes and
 * the concrete against the PNGs in side-by-side crops (UASTC normal maps,
 * tried with it, added 200 KB to the high board for no visible difference).
 * The mip chain is in the file, as compressed textures cannot be mipmapped
 * on the GPU. three transcodes it to BC7 on a desktop GPU (1 byte a pixel, a
 * quarter of RGBA8) and to ETC on most phones.
 */
export const KTX2_OPTIONS = { isUASTC: false, qualityLevel: 255, compressionLevel: 2, generateMipmap: true, isKTX2File: true } as const;

/**
 * The Basis WASM binds console.log once, when its module is created, and
 * prints a line per mip level through it. The first encode creates it, so
 * that one runs with a silent console.log; errors still go to console.error.
 */
let quiet: Promise<unknown> | null = null;
function quietEncoder() {
  if (quiet) return quiet;
  const log = console.log;
  console.log = () => {};
  const px = new Uint8Array(4 * 4 * 4).fill(255);
  quiet = encodeToKTX2(px, { ...KTX2_OPTIONS, imageDecoder: async () => ({ width: 4, height: 4, data: px }) }).finally(() => {
    console.log = log;
  });
  return quiet;
}

/** One texture as KTX2: the raster goes in as RGBA, top row first and not flipped (glTF's UV origin is the top left). */
export async function encodeKtx2(r: Raster, role: TextureRole): Promise<Uint8Array> {
  await quietEncoder();
  const n = r.width * r.height;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = r.data[i * r.channels + (r.channels === 1 ? 0 : c)]!;
    rgba[i * 4 + 3] = r.channels === 4 ? r.data[i * 4 + 3]! : 255;
  }
  return encodeToKTX2(rgba, {
    ...KTX2_OPTIONS,
    isPerceptual: role === 'color',
    isSetKTX2SRGBTransferFunc: role === 'color',
    isNormalMap: role === 'normal',
    // The raster is already decoded: hand it straight to the encoder.
    imageDecoder: async () => ({ width: r.width, height: r.height, data: rgba }),
  });
}

/** Rasterize a deck drawing (today's by default) at the texture size and drop the alpha (the field is opaque). */
function deckGraphic(T: { width: number; height: number }, svgPath: string = GRAPHIC_SVG): Pixels {
  const svg = readFileSync(svgPath, 'utf8');
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

/**
 * One deck's texture for a board level (step 16, ADR-71): its drawing at that
 * GLB's deck-bottom size with the same wear baked over it, encoded as that
 * GLB's deck bottom is (colour, KTX2, full mip chain), so it can stand in for
 * the Graphic material's map. The wear's roughness map stays the GLB's.
 */
export function buildDeckTexture(deck: FileDeck, level: DetailLevel): Promise<Uint8Array> {
  const T = deckTexture(level);
  return encodeKtx2(rgb(wearDeckBottom(deckGraphic(T, resolve(ROOT, DECKS[deck].svg))).color), 'color');
}

export interface BuildReport {
  triangles: Record<string, number>;
  droppedTriangles: number;
  /** KTX2 bytes per texture file name. */
  textureBytes: Record<string, number>;
}

/** What one asset is made of, in glTF creation order (the order fixes the bytes). */
interface AssetSpec {
  rootName: string;
  extras: Record<string, unknown>;
  /** `repeat`: a KHR_texture_transform scale for a tiling map (UVs stay in [0, 1] so they quantize). */
  textures: { key: string; file: string; pixels: Raster; wrap: 'repeat' | 'clamp'; repeat?: [number, number] }[];
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
    /** KHR_materials_clearcoat (ADR-53): the High deck print's lacquer. */
    clearcoat?: { factor: number; roughness: number };
    /** KHR_materials_sheen (ADR-53): the suede upper's rim, a linear colour. */
    sheen?: { color: [number, number, number]; roughness: number };
    /** Cut out where the map's alpha is under this (glTF alphaMode MASK): the detailed rider's hair and lashes (ADR-94). */
    alphaCutoff?: number;
  }[];
  parts: { node: string; material: string; geometry: BufferGeometry }[];
  droppedTriangles: number;
  /**
   * A skin (the rider, ADR-85): its joints in skinning order, each a node
   * under the root at its bind frame, and their inverse bind matrices
   * (column-major 4 x 4 each). The parts then carry JOINTS_0 and WEIGHTS_0
   * (from skinIndex and skinWeight) and the custom `_REGION` (from region).
   */
  skin?: { joints: { name: string; translation: [number, number, number]; rotation: [number, number, number, number] }[]; inverseBind: Float32Array };
  /** Overrides for the meshopt step (the rider keeps 16-bit cloth coordinates). */
  meshopt?: { quantizeTexcoord?: number };
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
      { key: 'grip', file: T.grip.file, pixels: grey(grip.width, grip.height, grip.grey), wrap: T.grip.wrap, repeat: deckRepeat(T.grip.tile) },
      { key: 'deckBottom', file: T.deckBottom.file, pixels: rgb(wornDeckBottom(T.deckBottom).color), wrap: T.deckBottom.wrap },
      { key: 'ply', file: T.ply.file, pixels: rgb(plyPixels()), wrap: T.ply.wrap },
      { key: 'wheel', file: T.wheel.file, pixels: rgb(wheelPixels()), wrap: T.wheel.wrap },
    );
  } else {
    const T = TEXTURES_HIGH;
    const grip = gripHigh();
    const deck = wornDeckBottom(T.deckBottom);
    const rough = greyFromField(deck.roughness, T.deckBottom.width, T.deckBottom.height, T.deckRoughness.width, T.deckRoughness.height);
    textures.push(
      { key: 'grip', file: T.grip.file, pixels: rgb(grip.color), wrap: T.grip.wrap, repeat: deckRepeat(T.grip.tile) },
      {
        key: 'gripNormal',
        file: T.gripNormal.file,
        pixels: rgb(normalMapFromHeight(downsample2(grip.lift, T.grip.width, T.grip.height), T.gripNormal.width, T.gripNormal.height)),
        wrap: T.gripNormal.wrap,
        repeat: deckRepeat(T.gripNormal.tile),
      },
      { key: 'deckBottom', file: T.deckBottom.file, pixels: rgb(deck.color), wrap: T.deckBottom.wrap },
      { key: 'deckRoughness', file: T.deckRoughness.file, pixels: grey(rough.width, rough.height, rough.grey), wrap: T.deckRoughness.wrap },
      { key: 'ply', file: T.ply.file, pixels: rgb(plyPixelsHigh()), wrap: T.ply.wrap },
      { key: 'wheel', file: T.wheel.file, pixels: rgb(wheelPixelsHigh()), wrap: T.wheel.wrap },
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
      clearcoat: key === 'graphic' && level === 'high' ? { ...GRAPHIC_CLEARCOAT } : undefined,
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
      { key: 'sole', file: T.sole.file, pixels: rgb(solePixels()), wrap: T.sole.wrap },
      { key: 'upper', file: T.upper.file, pixels: grey(upper.width, upper.height, upper.grey), wrap: T.upper.wrap },
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
        sheen: key === 'upper' ? { color: linearFactor(UPPER_SHEEN.color).slice(0, 3) as [number, number, number], roughness: UPPER_SHEEN.roughness } : undefined,
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
      { key: 'color', file: T.color.file, pixels: grey(color.width, color.height, color.grey), wrap: 'repeat', repeat: groundRepeat('color') },
      { key: 'normal', file: T.normal.file, pixels: rgb(concreteNormal()), wrap: 'repeat', repeat: groundRepeat('normal') },
      {
        key: 'roughness',
        file: T.roughness.file,
        pixels: grey(rough.width, rough.height, rough.grey),
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

  // What each texture feeds decides its encoding (here a texture feeds one slot).
  const roles = new Map<string, TextureRole>();
  for (const M of spec.materials) {
    if (M.map) roles.set(M.map, 'color');
    if (M.normalMap) roles.set(M.normalMap.key, 'normal');
    if (M.roughnessMap) roles.set(M.roughnessMap, 'data');
  }
  const textures = new Map<string, Texture>();
  const textureSpec = new Map<string, AssetSpec['textures'][number]>();
  const encoded = new Map<string, Uint8Array>();
  // One at a time: the encoder is one WASM instance, and a fixed order keeps the build deterministic.
  for (const t of spec.textures) {
    const ktx2 = await encodeKtx2(t.pixels, roles.get(t.key) ?? 'data');
    // The spec names the files .png; inside the GLB they are KTX2 (ADR-49).
    const uri = t.file.replace(/\.png$/, '.ktx2');
    encoded.set(uri, ktx2);
    textures.set(t.key, doc.createTexture(t.key).setImage(ktx2).setMimeType('image/ktx2').setURI(uri));
    textureSpec.set(t.key, t);
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);

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
    if (M.alphaCutoff !== undefined) m.setAlphaMode('MASK').setAlphaCutoff(M.alphaCutoff);
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
    if (M.clearcoat) {
      const ext = doc.createExtension(KHRMaterialsClearcoat);
      m.setExtension('KHR_materials_clearcoat', ext.createClearcoat().setClearcoatFactor(M.clearcoat.factor).setClearcoatRoughnessFactor(M.clearcoat.roughness));
    }
    if (M.sheen) {
      const ext = doc.createExtension(KHRMaterialsSheen);
      m.setExtension('KHR_materials_sheen', ext.createSheen().setSheenColorFactor(M.sheen.color).setSheenRoughnessFactor(M.sheen.roughness));
    }
    materials.set(M.key, m);
  }

  const accessor = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4' | 'SCALAR', array: Float32Array | Uint8Array | Uint16Array | Uint32Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  const root = doc.createNode(spec.rootName).setExtras(spec.extras);
  const scene = doc.createScene(spec.rootName).addChild(root);
  doc.getRoot().setDefaultScene(scene);

  // The skin's joints, flat under the root, at their bind frames, in skinning order.
  const skin = spec.skin
    ? (() => {
        const sk = doc.createSkin(`${spec.rootName}Skin`).setSkeleton(root);
        for (const j of spec.skin.joints) {
          const n = doc.createNode(j.name).setTranslation(j.translation).setRotation(j.rotation);
          root.addChild(n);
          sk.addJoint(n);
        }
        return sk.setInverseBindMatrices(accessor('MAT4', spec.skin.inverseBind));
      })()
    : null;

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
    if (skin) {
      prim.setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(g.getAttribute('skinIndex').array)));
      prim.setAttribute('WEIGHTS_0', accessor('VEC4', g.getAttribute('skinWeight').array as Float32Array));
      prim.setAttribute('_REGION', accessor('SCALAR', g.getAttribute('region').array as Uint8Array));
      if (uv && !textured.has(material)) prim.setAttribute('TEXCOORD_0', accessor('VEC2', uv.array as Float32Array));
    }
    const count = g.getAttribute('position').count;
    const index = Array.from(g.index!.array);
    prim.setIndices(accessor('SCALAR', count < 65536 ? new Uint16Array(index) : new Uint32Array(index)));
    const meshNode = doc.createNode(node).setMesh(doc.createMesh(node).addPrimitive(prim));
    if (skin) meshNode.setSkin(skin);
    root.addChild(meshNode);
  }

  await MeshoptEncoder.ready;
  // meshopt() = reorder for size + KHR_mesh_quantization (14-bit positions,
  // 8-bit octahedral normals, 12-bit UVs) + EXT_meshopt_compression filters.
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high', ...spec.meshopt }));

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(doc);
  const report: BuildReport = {
    triangles: Object.fromEntries(spec.parts.map((p) => [p.node, triangleCount(p.geometry)])),
    droppedTriangles: spec.droppedTriangles,
    textureBytes: Object.fromEntries([...encoded].map(([file, b]) => [file, b.length])),
  };
  return { glb, report };
}

/** The board GLB at a detail level ('medium' is public/models/board.glb, 'high' is board-high.glb). */
export const buildBoardGlb = (level: DetailLevel = 'medium') => buildGlb(boardSpec(level));

/** The right shoe GLB (public/models/shoes.glb). */
export const buildShoesGlb = () => buildGlb(shoeSpec());

/**
 * The skate spot (step 14, ADR-69): two meshes since ADR-102, the concrete
 * and the steel, each painted by its vertex colour over the same near-white
 * map, one tile repeated over the group by a texture transform; the concrete
 * also takes the normal map, the steel a metal's roughness and metalness.
 */
function spotSpec(): AssetSpec {
  const T = SPOT_TEXTURES;
  const repeat: [number, number] = [T.uvSpan / T.tile, T.uvSpan / T.tile];
  const color = spotColor();
  const geometry = buildSpot();
  return {
    rootName: 'Spot',
    extras: { units: 'metres', source: 'procedural, scripts/build-board.ts', design: 'src/asset/spotSpec.ts' },
    textures: [
      { key: 'color', file: T.color.file, pixels: grey(color.width, color.height, color.grey), wrap: 'repeat', repeat },
      { key: 'normal', file: T.normal.file, pixels: rgb(spotNormal()), wrap: 'repeat', repeat },
    ],
    materials: [
      {
        key: SPOT_PARTS[0].material,
        name: SPOT_MATERIAL.name,
        baseColor: [1, 1, 1, 1],
        roughness: SPOT_MATERIAL.roughness,
        metalness: SPOT_MATERIAL.metalness,
        map: 'color',
        normalMap: { key: 'normal', scale: 1 },
      },
      {
        key: SPOT_PARTS[1].material,
        name: SPOT_STEEL_MATERIAL.name,
        baseColor: [1, 1, 1, 1],
        roughness: SPOT_STEEL_MATERIAL.roughness,
        metalness: SPOT_STEEL_MATERIAL.metalness,
        map: 'color',
      },
    ],
    parts: [
      { node: SPOT_PARTS[0].node, material: SPOT_PARTS[0].material, geometry: geometry.concrete },
      { node: SPOT_PARTS[1].node, material: SPOT_PARTS[1].material, geometry: geometry.steel },
    ],
    droppedTriangles: 0,
  };
}

/** The skate spot GLB (public/models/spot.glb). */
export const buildSpotGlb = () => buildGlb(spotSpec());

/**
 * The rider (ADR-85): one skinned mesh round the bind pose of src/sim/body.ts
 * (src/asset/rider.ts), its joints flat under the root. Its material has no
 * texture: the scene gives it the twill normal map and the colours by region.
 */
function riderSpec(): AssetSpec {
  const r = buildRider();
  const ibm = new Float32Array(RIDER_BONES.length * 16);
  const joints = RIDER_BONES.map((name, i) => {
    const f = r.bind.bones[i]!;
    // The bind matrix is [x y z | o]; its inverse is [R^T | -R^T o].
    const R = [f.x, f.y, f.z];
    const o = f.o;
    const m = new Float32Array(16);
    for (let row = 0; row < 3; row++) {
      const ax = R[row]!;
      m[0 * 4 + row] = ax.x;
      m[1 * 4 + row] = ax.y;
      m[2 * 4 + row] = ax.z;
      m[3 * 4 + row] = -(ax.x * o.x + ax.y * o.y + ax.z * o.z);
    }
    m[15] = 1;
    ibm.set(m, i * 16);
    const round = (n: number) => Number(n.toFixed(7));
    return {
      name,
      translation: [round(o.x), round(o.y), round(o.z)] as [number, number, number],
      rotation: [round(f.q.x), round(f.q.y), round(f.q.z), round(f.q.w)] as [number, number, number, number],
    };
  });
  return {
    rootName: RIDER_ROOT,
    extras: { units: 'metres', bones: RIDER_BONES.length, uvSpan: RIDER_UV.span, source: 'procedural, scripts/build-board.ts', design: 'src/asset/riderSpec.ts' },
    textures: [],
    materials: [{ key: RIDER_PARTS[0].material, name: RIDER_MATERIAL.name, baseColor: [1, 1, 1, 1], roughness: RIDER_MATERIAL.roughness, metalness: RIDER_MATERIAL.metalness }],
    parts: RIDER_PARTS.map((p) => ({ node: p.node, material: p.material, geometry: r.geometry })),
    droppedTriangles: 0,
    skin: { joints, inverseBind: ibm },
    meshopt: { quantizeTexcoord: RIDER_UV.bits },
  };
}

/** The rider GLB (public/models/rider.glb). */
export const buildRiderGlb = () => buildGlb(riderSpec());

/**
 * The detailed rider (ADR-94), High only: MakeHuman's body from
 * assets/source/models/rider fitted onto the same 19 bones and bind pose
 * (src/asset/riderFit.ts), with the source's atlas as its one texture, cut
 * out where the hair and the lashes thin. Its joints and inverse bind
 * matrices are the procedural rider's, so the same pose drives either.
 */
async function riderHighSpec(): Promise<AssetSpec> {
  const base = riderSpec();
  const file = await readRiderSource();
  const { geometry } = fitRider(file.source, writeBindPose(newBodyPose()), RIDER_HIGH_LEAF);
  const { width, height, rgba } = file.atlas;
  return {
    ...base,
    extras: { units: 'metres', bones: RIDER_BONES.length, source: 'MakeHuman (CC0) via assets/source/models/rider, fitted by src/asset/riderFit.ts', design: 'src/asset/riderSpec.ts' },
    textures: [{ key: 'atlas', file: RIDER_HIGH_ATLAS, pixels: { width, height, channels: 4, data: rgba }, wrap: 'clamp' }],
    materials: [
      {
        key: RIDER_PARTS[0].material,
        name: RIDER_MATERIAL.name,
        baseColor: [1, 1, 1, 1],
        roughness: RIDER_HIGH_MATERIAL.roughness,
        metalness: 0,
        map: 'atlas',
        alphaCutoff: RIDER_HIGH_MATERIAL.alphaCutoff,
        doubleSided: RIDER_HIGH_MATERIAL.doubleSided,
      },
    ],
    parts: RIDER_PARTS.map((p) => ({ node: p.node, material: p.material, geometry })),
    meshopt: {},
  };
}

/** The detailed rider GLB (public/models/rider-high.glb). */
export const buildRiderHighGlb = async () => buildGlb(await riderHighSpec());

/** The concrete ground GLB (public/models/ground.glb). */
export const buildGroundGlb = () => buildGlb(groundSpec());

/** Build any asset by its key. */
export function buildAsset(key: AssetKey): Promise<{ glb: Uint8Array; report: BuildReport }> {
  if (key === 'board') return buildBoardGlb('medium');
  if (key === 'boardHigh') return buildBoardGlb('high');
  if (key === 'ground') return buildGroundGlb();
  if (key === 'spot') return buildSpotGlb();
  if (key === 'rider') return buildRiderGlb();
  if (key === 'riderHigh') return buildRiderHighGlb();
  return buildShoesGlb();
}
