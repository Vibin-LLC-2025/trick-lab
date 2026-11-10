// Reads a GLB with glTF-Transform (meshopt decoder registered) and collects
// the numbers the budget is about. Counts what the renderer will see: one draw
// call per primitive per node instance, triangles from the index count.
import { readFileSync } from 'node:fs';
import { ImageUtils, NodeIO, Primitive, TextureInfo, getBounds, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { KHR_DF_TRANSFER_SRGB, read as readKtx2 } from 'ktx-parse';
import { MeshoptDecoder } from 'meshoptimizer';
import type { AssetStats, DeckTextureStat, TextureStat } from './budget';

const F = TextureInfo.MinFilter;
const MIPMAP_FILTERS = new Set<number>([
  F.NEAREST_MIPMAP_NEAREST!,
  F.LINEAR_MIPMAP_NEAREST!,
  F.NEAREST_MIPMAP_LINEAR!,
  F.LINEAR_MIPMAP_LINEAR!,
]);

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
    };
  });

  const b = getBounds(scene);
  return {
    fileBytes: bytes.byteLength,
    drawCalls,
    triangles,
    materials: root.listMaterials().length,
    textures,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
    extensionsRequired: root.listExtensionsRequired().map((e) => e.extensionName),
    nodeNames,
    bounds: { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] },
  };
}

/** A deck texture's KTX2 header (step 16, ADR-71); a file that is not KTX2 reads as no size. */
export function inspectDeckTexture(path: string): DeckTextureStat {
  const bytes = readFileSync(path);
  try {
    const k = readKtx2(new Uint8Array(bytes));
    const srgb = k.dataFormatDescriptor[0]?.transferFunction === KHR_DF_TRANSFER_SRGB;
    return { bytes: bytes.byteLength, width: k.pixelWidth, height: k.pixelHeight, levels: k.levels.length, srgb };
  } catch {
    return { bytes: bytes.byteLength, width: null, height: null, levels: 0, srgb: false };
  }
}
