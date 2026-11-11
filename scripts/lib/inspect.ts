// Reads a GLB with glTF-Transform (meshopt decoder registered) and collects
// the numbers the budget is about. Counts what the renderer will see: one draw
// call per primitive per node instance, triangles from the index count.
import { readFileSync } from 'node:fs';
import { ImageUtils, NodeIO, Primitive, TextureInfo, getBounds, type Node, type Root } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { KHR_DF_TRANSFER_SRGB, KHR_SUPERCOMPRESSION_ZSTD, read as readKtx2 } from 'ktx-parse';
import { MeshoptDecoder } from 'meshoptimizer';
import type { AssetStats, DeckTextureStat, TextureStat } from './budget';

const F = TextureInfo.MinFilter;
const MIPMAP_FILTERS = new Set<number>([
  F.NEAREST_MIPMAP_NEAREST!,
  F.LINEAR_MIPMAP_NEAREST!,
  F.NEAREST_MIPMAP_LINEAR!,
  F.LINEAR_MIPMAP_LINEAR!,
]);

/**
 * The bind pose's bounds of a skinned mesh (the rider, ADR-85). glTF ignores
 * a skinned mesh node's own transform, so quantization (meshopt) puts the
 * positions' scale and offset into the inverse bind matrices instead: a
 * joint's world matrix times its inverse bind matrix is that transform, and
 * it takes the stored positions to the bind pose. Null with no skin.
 */
function skinnedBounds(root: Root): { min: [number, number, number]; max: [number, number, number] } | null {
  const node = root.listNodes().find((n) => n.getSkin() && n.getMesh());
  const skin = node?.getSkin();
  const joint = skin?.listJoints()[0];
  const ibm = skin?.getInverseBindMatrices();
  if (!node || !joint || !ibm) return null;
  const w = joint.getWorldMatrix();
  const i = ibm.getElement(0, []);
  // Column-major 4 x 4 product w * i.
  const t = Array.from({ length: 16 }, (_, k) => {
    const col = Math.floor(k / 4);
    const row = k % 4;
    let sum = 0;
    for (let n = 0; n < 4; n++) sum += w[n * 4 + row]! * i[col * 4 + n]!;
    return sum;
  });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!;
    const el: number[] = [];
    for (let v = 0; v < pos.getCount(); v++) {
      pos.getElement(v, el);
      for (let a = 0; a < 3; a++) {
        const x = t[a]! * el[0]! + t[4 + a]! * el[1]! + t[8 + a]! * el[2]! + t[12 + a]!;
        min[a] = Math.min(min[a]!, x);
        max[a] = Math.max(max[a]!, x);
      }
    }
  }
  return { min: min as [number, number, number], max: max as [number, number, number] };
}

export async function inspectGlb(path: string): Promise<AssetStats> {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(path);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(bytes));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${path}: no scene`);

  let drawCalls = 0;
  let triangles = 0;
  const nodeNames: string[] = [];
  scene.traverse((node: Node) => {
    nodeNames.push(node.getName());
    const mesh = node.getMesh();
    if (!mesh) return;
    for (const prim of mesh.listPrimitives()) {
      drawCalls++;
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      triangles += count / 3;
    }
  });

  // A texture is mipmapped if every material slot that samples it (base colour,
  // normal, metallic-roughness, occlusion, emissive) asks for a mipmap min filter.
  const mipmapped = new Map<string, boolean>();
  for (const material of root.listMaterials()) {
    const slots: [ReturnType<typeof material.getBaseColorTexture>, ReturnType<typeof material.getBaseColorTextureInfo>][] = [
      [material.getBaseColorTexture(), material.getBaseColorTextureInfo()],
      [material.getNormalTexture(), material.getNormalTextureInfo()],
      [material.getMetallicRoughnessTexture(), material.getMetallicRoughnessTextureInfo()],
      [material.getOcclusionTexture(), material.getOcclusionTextureInfo()],
      [material.getEmissiveTexture(), material.getEmissiveTextureInfo()],
    ];
    for (const [tex, info] of slots) {
      if (!tex || !info) continue;
      const ok = MIPMAP_FILTERS.has(info.getMinFilter() ?? -1);
      mipmapped.set(tex.getName(), (mipmapped.get(tex.getName()) ?? true) && ok);
    }
  }
  // A KTX2 texture (ADR-49) carries its own mip chain: its header gives the
  // size and the levels stored. Any other image has one level in the file.
  const textures: TextureStat[] = root.listTextures().map((t) => {
    const image = t.getImage();
    const mimeType = t.getMimeType();
    const ktx2 = image && mimeType === 'image/ktx2' ? readKtx2(image) : null;
    const size = ktx2 ? [ktx2.pixelWidth, ktx2.pixelHeight] : image ? ImageUtils.getSize(image, mimeType) : null;
    return {
      name: t.getName(),
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
      bytes: image?.byteLength ?? 0,
      mipmapped: mipmapped.get(t.getName()) ?? false,
      mimeType,
      levels: ktx2 ? ktx2.levels.length : 1,
      zstd: ktx2?.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD,
    };
  });

  const b = skinnedBounds(root) ?? getBounds(scene);
  return {
    fileBytes: bytes.byteLength,
    drawCalls,
    triangles,
    materials: root.listMaterials().length,
    textures,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
    extensionsRequired: root.listExtensionsRequired().map((e) => e.extensionName),
    nodeNames,
    joints: root.listSkins().map((sk) => sk.listJoints().map((j) => j.getName())),
    bounds: { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] },
  };
}

/** A deck texture's KTX2 header (step 16, ADR-71); a file that is not KTX2 reads as no size. */
export function inspectDeckTexture(path: string): DeckTextureStat {
  const bytes = readFileSync(path);
  try {
    const k = readKtx2(new Uint8Array(bytes));
    const srgb = k.dataFormatDescriptor[0]?.transferFunction === KHR_DF_TRANSFER_SRGB;
    const zstd = k.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD;
    return { bytes: bytes.byteLength, width: k.pixelWidth, height: k.pixelHeight, levels: k.levels.length, srgb, zstd };
  } catch {
    return { bytes: bytes.byteLength, width: null, height: null, levels: 0, srgb: false, zstd: false };
  }
}
