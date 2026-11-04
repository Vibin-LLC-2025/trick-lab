// Builds the board GLB in memory: geometry from src/asset/, procedural
// textures (src/asset/textures.ts), the deck graphic rasterized from
// assets/source/deck-graphic.svg, then meshopt compression and quantization.
// Deterministic: the same sources give the same bytes (tested).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO, TextureInfo, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { Resvg } from '@resvg/resvg-js';
import { MeshoptEncoder } from 'meshoptimizer';
import type { BufferGeometry } from 'three';
import { buildBoard, triangleCount } from '../../src/asset/board';
import { MATERIALS, OUTLINE, PARTS, REST_Y, TEXTURES, type MaterialKey, type PartName, type TextureKey } from '../../src/asset/spec';
import { gripGrey, gripTint, hexToRgb, plyPixels, wheelPixels, type Pixels } from '../../src/asset/textures';
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
function deckBottomPng(): Uint8Array {
  const T = TEXTURES.deckBottom;
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
  return encodePng(T.width, T.height, 3, rgb);
}

export interface BuildReport {
  triangles: Record<PartName, number>;
  droppedTriangles: number;
  /** PNG bytes per texture file name. */
  textureBytes: Record<string, number>;
}

export async function buildBoardGlb(): Promise<{ glb: Uint8Array; report: BuildReport }> {
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  doc.getRoot().getAsset().generator = 'trick-lab scripts/build-board.ts (glTF-Transform 4.5.1)';
  const buffer = doc.createBuffer();
  const textureTransform = doc.createExtension(KHRTextureTransform);

  const images: Record<TextureKey, Uint8Array> = {
    grip: (({ width, height, grey }) => encodePng(width, height, 1, grey))(gripGrey()),
    deckBottom: deckBottomPng(),
    ply: png(plyPixels()),
    wheel: png(wheelPixels()),
  };
  const textures = {} as Record<TextureKey, Texture>;
  for (const key of Object.keys(TEXTURES) as TextureKey[]) {
    textures[key] = doc.createTexture(key).setImage(images[key]).setMimeType('image/png').setURI(TEXTURES[key].file);
  }

  const materials = {} as Record<MaterialKey, ReturnType<Document['createMaterial']>>;
  for (const key of Object.keys(MATERIALS) as MaterialKey[]) {
    const M = MATERIALS[key];
    const m = doc
      .createMaterial(M.name)
      .setBaseColorFactor(key === 'grip' ? gripTint() : linearFactor(M.color))
      .setRoughnessFactor(M.roughness)
      .setMetallicFactor(M.metalness);
    if ('map' in M) {
      const T = TEXTURES[M.map];
      m.setBaseColorTexture(textures[M.map]);
      const info = m.getBaseColorTextureInfo()!;
      const wrap = T.wrap === 'repeat' ? TextureInfo.WrapMode.REPEAT! : TextureInfo.WrapMode.CLAMP_TO_EDGE!;
      info
        .setWrapS(wrap)
        .setWrapT(wrap)
        .setMagFilter(TextureInfo.MagFilter.LINEAR!)
        .setMinFilter(TextureInfo.MinFilter.LINEAR_MIPMAP_LINEAR!);
      if (key === 'grip') {
        // Grip UVs are stored in [0, 1] over the deck (so they can be quantized);
        // the transform repeats the 512 px tile every 0.2 m.
        const tile = TEXTURES.grip.tile;
        info.setExtension(
          'KHR_texture_transform',
          textureTransform.createTransform().setScale([OUTLINE.length / tile, OUTLINE.width / tile]),
        );
      }
    }
    materials[key] = m;
  }

  const accessor = (type: 'VEC2' | 'VEC3' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  const board = buildBoard();
  const root = doc
    .createNode('Board')
    .setExtras({ units: 'metres', restY: REST_Y, source: 'procedural, scripts/build-board.ts', design: 'docs/DESIGN.md section 7' });
  const scene = doc.createScene('Board').addChild(root);
  doc.getRoot().setDefaultScene(scene);

  for (const { node, material } of PARTS) {
    const g: BufferGeometry = board.parts[node];
    const prim = doc
      .createPrimitive()
      .setMaterial(materials[material])
      .setAttribute('POSITION', accessor('VEC3', g.getAttribute('position').array as Float32Array))
      .setAttribute('NORMAL', accessor('VEC3', g.getAttribute('normal').array as Float32Array));
    const uv = g.getAttribute('uv');
    if (uv && 'map' in MATERIALS[material]) prim.setAttribute('TEXCOORD_0', accessor('VEC2', uv.array as Float32Array));
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
    triangles: Object.fromEntries(PARTS.map((p) => [p.node, triangleCount(board.parts[p.node])])) as Record<PartName, number>,
    droppedTriangles: board.droppedTriangles,
    textureBytes: Object.fromEntries((Object.keys(images) as TextureKey[]).map((k) => [TEXTURES[k].file, images[k].length])),
  };
  return { glb, report };
}
