// The asset budget as a pure function: stats in, table rows out. The CLI
// (scripts/check-assets.ts) prints the rows and fails on any miss; the tests
// feed it hand-made stats. The asset key picks the limits (BUDGETS), the
// expected nodes and the size checks: the two boards share the deck's outline
// and rest height, the shoe has its own footprint, the ground its plane.
import { BAY, GROUND_PARTS } from '../../src/asset/groundSpec';
import { SHOE, SHOE_PARTS } from '../../src/asset/shoeSpec';
import { BUDGETS, OUTLINE, PARTS, REST_Y, type AssetKey } from '../../src/asset/spec';

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
/** The ground plane's smallest side, metres (the ground brief, 2026-11-04). */
export const GROUND_MIN_SIZE = 24;
/** RGBA8 on the GPU, plus a third for the mip chain. */
export const gpuBytes = (t: { width: number; height: number }) => (t.width * t.height * 4 * 4) / 3;
const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;

/** Physical size rows per asset: the boards must match the deck outline and rest height, the shoe its footprint. */
function sizeRows(s: AssetStats, key: AssetKey): BudgetRow[] {
  const length = s.bounds.max[0] - s.bounds.min[0];
  const width = s.bounds.max[2] - s.bounds.min[2];
  if (key === 'ground') {
    // At least 24 m each way (so it reaches the fog from every allowed orbit),
    // a whole odd number of bays (a bay centre, not a joint, under the board),
    // flat on y = 0 and centred on the origin.
    const bays = (size: number, bay: number) => {
      const n = size / bay;
      return { n, ok: size >= GROUND_MIN_SIZE && Math.abs(n - Math.round(n)) * bay <= 0.001 && Math.round(n) % 2 === 1 };
    };
    const bx = bays(length, BAY.x);
    const bz = bays(width, BAY.z);
    const limit = (bay: number) => `>= ${GROUND_MIN_SIZE} m, odd bays of ${bay} m`;
    const flat = Math.max(Math.abs(s.bounds.min[1]), Math.abs(s.bounds.max[1]));
    const off = Math.max(Math.abs(s.bounds.max[0] + s.bounds.min[0]), Math.abs(s.bounds.max[2] + s.bounds.min[2])) / 2;
    return [
      { check: 'Size x (bays)', value: `${length.toFixed(3)} m (${bx.n.toFixed(2)})`, limit: limit(BAY.x), ok: bx.ok },
      { check: 'Size z (bays)', value: `${width.toFixed(3)} m (${bz.n.toFixed(2)})`, limit: limit(BAY.z), ok: bz.ok },
      { check: 'Surface height (y)', value: mm(flat), limit: '0.0 mm +- 0.5 mm', ok: flat <= 0.0005 },
      { check: 'Centred on the origin', value: mm(off), limit: '0.0 mm +- 1 mm', ok: off <= 0.001 },
    ];
  }
  if (key === 'shoes') {
    return [
      { check: 'Length (x)', value: mm(length), limit: `${mm(SHOE.length)} +- 3 mm`, ok: Math.abs(length - SHOE.length) <= 0.003 },
      { check: 'Width (z)', value: mm(width), limit: `${mm(SHOE.width)} +- 3 mm`, ok: Math.abs(width - SHOE.width) <= 0.003 },
      { check: 'Sole bottom (min y)', value: mm(s.bounds.min[1]), limit: '0.0 mm +- 0.5 mm', ok: Math.abs(s.bounds.min[1]) <= 0.0005 },
    ];
  }
  return [
    { check: 'Length (x)', value: mm(length), limit: `${mm(OUTLINE.length)} +- 2 mm`, ok: Math.abs(length - OUTLINE.length) <= 0.002 },
    { check: 'Width (z)', value: mm(width), limit: `${mm(OUTLINE.width)} +- 2 mm`, ok: Math.abs(width - OUTLINE.width) <= 0.002 },
    {
      check: 'Wheel bottoms (min y)',
      value: mm(s.bounds.min[1]),
      limit: `${mm(-REST_Y)} +- 0.5 mm`,
      ok: Math.abs(s.bounds.min[1] + REST_Y) <= 0.0005,
    },
  ];
}

export function evaluateBudget(s: AssetStats, key: AssetKey = 'board'): BudgetRow[] {
  const BUDGET = BUDGETS[key];
  const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
  const texBytes = s.textures.reduce((n, t) => n + t.bytes, 0);
  const gpu = s.textures.reduce((n, t) => n + gpuBytes(t), 0);
  const maxSide = Math.max(0, ...s.textures.map((t) => Math.max(t.width, t.height)));
  const expectedNodes: readonly string[] = (key === 'shoes' ? SHOE_PARTS : key === 'ground' ? GROUND_PARTS : PARTS).map((p) => p.node);
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
    ...sizeRows(s, key),
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
