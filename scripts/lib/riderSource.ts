// Reads the detailed rider's source (ADR-94): assets/source/models/rider/
// rider-source.glb, made in Blender by make_rider.py. Its arrays go to
// src/asset/riderFit.ts; its one texture, the atlas (PNG), is decoded here
// with resvg (already the deck drawings' rasterizer), so the build needs no
// image library of its own.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Resvg } from '@resvg/resvg-js';
import type { RiderSource } from '../../src/asset/riderFit';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RIDER_SOURCE_GLB = resolve(ROOT, 'assets/source/models/rider/rider-source.glb');

export interface RiderSourceFile {
  source: RiderSource;
  /** The atlas, RGBA, top row first. */
  atlas: { width: number; height: number; rgba: Uint8Array };
}

/** A PNG decoded to RGBA, top row first, through resvg (the deck drawings' rasterizer), so the build needs no image library. */
function decodePng(png: Uint8Array, width: number, height: number, what: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><image width="${width}" height="${height}" xlink:href="data:image/png;base64,${Buffer.from(png).toString('base64')}"/></svg>`;
  const img = new Resvg(svg, { fitTo: { mode: 'original' } }).render();
  if (img.width !== width || img.height !== height) throw new Error(`the rider ${what} decoded at ${img.width} x ${img.height}`);
  return { width, height, rgba: new Uint8Array(img.pixels) };
}

/**
 * A joint's rest position from its inverse bind matrix (a 4 x 4, column-major).
 * Only for a rigid one, a turn and a move: m = [R | t], whose inverse's
 * translation is -R^T t. A scaled bind (a rig exported with its scale not
 * applied) is refused, not misread: -R^T t would put its joints in the wrong
 * place without a word (2026-11-13).
 */
function positionOfInverseBind(m: ArrayLike<number>): [number, number, number] {
  const r = (row: number, col: number) => m[col * 4 + row]!;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const d = r(0, i) * r(0, j) + r(1, i) * r(1, j) + r(2, i) * r(2, j);
      if (Math.abs(d - (i === j ? 1 : 0)) > 1e-4) throw new Error('the rider source has a scaled inverse bind matrix: apply the rig scale in Blender (Ctrl+A) and export again');
    }
  }
  const t = [m[12]!, m[13]!, m[14]!];
  return [0, 1, 2].map((i) => -(r(0, i) * t[0]! + r(1, i) * t[1]! + r(2, i) * t[2]!)) as [number, number, number];
}

export async function readRiderSource(path = RIDER_SOURCE_GLB): Promise<RiderSourceFile> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(readFileSync(path)));
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const root = doc.getRoot();
  const skins = root.listSkins();
  const meshes = root.listMeshes();
  if (skins.length !== 1 || meshes.length !== 1 || meshes[0]!.listPrimitives().length !== 1) throw new Error('the rider source must be one skinned mesh with one primitive');
  const skin = skins[0]!;
  const prim = meshes[0]!.listPrimitives()[0]!;
  const jointNames = skin.listJoints().map((j) => j.getName());
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const jointPositions = jointNames.map((_, i) => positionOfInverseBind(Array.from(ibm.slice(i * 16, i * 16 + 16))));

  const attr = (name: string) => {
    const a = prim.getAttribute(name);
    if (!a) throw new Error(`the rider source has no ${name}`);
    return a;
  };
  const floats = (name: string) => {
    const a = attr(name);
    const n = a.getCount() * a.getElementSize();
    const out = new Float32Array(n);
    const el: number[] = [];
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, el);
      for (let k = 0; k < a.getElementSize(); k++) out[i * a.getElementSize() + k] = el[k]!;
    }
    return out;
  };
  const colour = floats('COLOR_0');
  const count = attr('POSITION').getCount();
  const regions = new Uint8Array(count);
  for (let i = 0; i < count; i++) regions[i] = Math.round(colour[i * 4]! * 10);
  const joints = floats('JOINTS_0');

  const tex = prim.getMaterial()?.getBaseColorTexture();
  const png = tex?.getImage();
  const size = tex?.getSize();
  if (!png || !size || tex!.getMimeType() !== 'image/png') throw new Error('the rider source has no PNG atlas');
  const atlas = decodePng(png, size[0], size[1], 'atlas');

  return {
    source: {
      positions: floats('POSITION'),
      normals: floats('NORMAL'),
      uvs: floats('TEXCOORD_0'),
      joints,
      weights: floats('WEIGHTS_0'),
      regions,
      index: new Uint32Array(prim.getIndices()!.getArray()!),
      jointNames,
      jointPositions,
    },
    atlas,
  };
}
