// The asset budget as a pure function: stats in, table rows out. The CLI
// (scripts/check-assets.ts) prints the rows and fails on any miss; the tests
// feed it hand-made stats.
import { BUDGET, OUTLINE, PARTS, REST_Y } from '../../src/asset/spec';

export interface TextureStat {
  name: string;
  width: number;
  height: number;
  bytes: number;
  mipmapped: boolean;
}

export interface AssetStats {
  fileBytes: number;
  drawCalls: number;
  triangles: number;
  materials: number;
  textures: TextureStat[];
  extensionsUsed: string[];
  extensionsRequired: string[];
  nodeNames: string[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export interface BudgetRow {
  check: string;
  value: string;
  limit: string;
  ok: boolean;
}

const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
/** RGBA8 on the GPU, plus a third for the mip chain. */
export const gpuBytes = (t: { width: number; height: number }) => (t.width * t.height * 4 * 4) / 3;
const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;

export function evaluateBudget(s: AssetStats): BudgetRow[] {
  const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
  const texBytes = s.textures.reduce((n, t) => n + t.bytes, 0);
  const gpu = s.textures.reduce((n, t) => n + gpuBytes(t), 0);
  const maxSide = Math.max(0, ...s.textures.map((t) => Math.max(t.width, t.height)));
  const length = s.bounds.max[0] - s.bounds.min[0];
  const width = s.bounds.max[2] - s.bounds.min[2];
  const expectedNodes = PARTS.map((p) => p.node);
  const missing = expectedNodes.filter((n) => !s.nodeNames.includes(n));
  const rows: BudgetRow[] = [
    { check: 'GLB file size', value: kb(s.fileBytes), limit: `<= ${kb(BUDGET.fileBytes)}`, ok: s.fileBytes <= BUDGET.fileBytes },
    { check: '  of which textures (PNG)', value: kb(texBytes), limit: 'info', ok: true },
    { check: 'Draw calls (primitives)', value: String(s.drawCalls), limit: `<= ${BUDGET.drawCalls}`, ok: s.drawCalls <= BUDGET.drawCalls },
    { check: 'Triangles', value: s.triangles.toLocaleString('en-US'), limit: `<= ${BUDGET.triangles.toLocaleString('en-US')}`, ok: s.triangles <= BUDGET.triangles },
    { check: 'Materials', value: String(s.materials), limit: 'info', ok: true },
    { check: 'Textures', value: String(s.textures.length), limit: `<= ${BUDGET.textures}`, ok: s.textures.length <= BUDGET.textures },
    { check: 'Texture long side', value: `${maxSide} px`, limit: `<= ${BUDGET.textureMaxSide} px`, ok: maxSide <= BUDGET.textureMaxSide },
    {
      check: 'Textures power of two',
      value: s.textures.map((t) => `${t.width}x${t.height}`).join(', '),
      limit: 'all',
      ok: s.textures.every((t) => isPow2(t.width) && isPow2(t.height)),
    },
    {
      check: 'Textures mipmapped (sampler)',
      value: `${s.textures.filter((t) => t.mipmapped).length} of ${s.textures.length}`,
      limit: 'all',
      ok: s.textures.every((t) => t.mipmapped),
    },
    { check: 'Texture GPU memory (est.)', value: `${(gpu / 1024 / 1024).toFixed(2)} MB`, limit: 'info, RGBA8 + mips', ok: true },
    {
      check: 'EXT_meshopt_compression',
      value: s.extensionsRequired.includes('EXT_meshopt_compression') ? 'required' : 'missing',
      limit: 'required',
      ok: s.extensionsRequired.includes('EXT_meshopt_compression'),
    },
    {
      check: 'KHR_mesh_quantization',
      value: s.extensionsRequired.includes('KHR_mesh_quantization') ? 'required' : 'missing',
      limit: 'required',
      ok: s.extensionsRequired.includes('KHR_mesh_quantization'),
    },
    {
      check: 'No Draco (CDN decoder)',
      value: s.extensionsUsed.includes('KHR_draco_mesh_compression') ? 'used' : 'not used',
      limit: 'not used',
      ok: !s.extensionsUsed.includes('KHR_draco_mesh_compression'),
    },
    { check: 'Part nodes', value: missing.length ? `missing ${missing.join(', ')}` : `${expectedNodes.length} of ${expectedNodes.length}`, limit: 'all', ok: missing.length === 0 },
    { check: 'Length (x)', value: mm(length), limit: `${mm(OUTLINE.length)} +- 2 mm`, ok: Math.abs(length - OUTLINE.length) <= 0.002 },
    { check: 'Width (z)', value: mm(width), limit: `${mm(OUTLINE.width)} +- 2 mm`, ok: Math.abs(width - OUTLINE.width) <= 0.002 },
    {
      check: 'Wheel bottoms (min y)',
      value: mm(s.bounds.min[1]),
      limit: `${mm(-REST_Y)} +- 0.5 mm`,
      ok: Math.abs(s.bounds.min[1] + REST_Y) <= 0.0005,
    },
  ];
  return rows;
}

export function formatTable(rows: BudgetRow[]): string {
  const head = ['Check', 'Value', 'Limit', 'Result'];
  const body = rows.map((r) => [r.check, r.value, r.limit, r.limit === 'info' || r.limit.startsWith('info') ? '' : r.ok ? 'pass' : 'FAIL']);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}
