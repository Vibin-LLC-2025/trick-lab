// Reads a GLB with glTF-Transform (meshopt decoder registered) and collects
// the numbers the budget is about. Counts what the renderer will see: one draw
// call per primitive per node instance, triangles from the index count.
import { readFileSync } from 'node:fs';
import { ImageUtils, NodeIO, Primitive, TextureInfo, getBounds, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import type { AssetStats, TextureStat } from './budget';

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

  // A texture is mipmapped if every material slot that samples it asks for a mipmap min filter.
  const mipmapped = new Map<string, boolean>();
  for (const material of root.listMaterials()) {
    const tex = material.getBaseColorTexture();
    const info = material.getBaseColorTextureInfo();
    if (!tex || !info) continue;
    const ok = MIPMAP_FILTERS.has(info.getMinFilter() ?? -1);
    mipmapped.set(tex.getName(), (mipmapped.get(tex.getName()) ?? true) && ok);
  }
  const textures: TextureStat[] = root.listTextures().map((t) => {
    const image = t.getImage();
    const size = image ? ImageUtils.getSize(image, t.getMimeType()) : null;
    return {
      name: t.getName(),
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
      bytes: image?.byteLength ?? 0,
      mipmapped: mipmapped.get(t.getName()) ?? false,
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
