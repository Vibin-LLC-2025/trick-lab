// A static server for scripts/measure that compresses like GitHub Pages, the
// live host (ADR-49): gzip for HTML, CSS, JS, JSON, SVG, WebAssembly and the
// GLBs (checked on 2026-11-09: Pages sends `.wasm` and `.glb` gzipped),
// `Cache-Control: max-age=600`, nothing else. `vite preview` gzips only the
// text files, so it overstates what a student downloads for the models.
//
//   node scripts/measure/serve.mjs [dir=dist] [port=4173] [base=/]
//
// Only node:http, node:fs and node:zlib: no server package (CLAUDE.md).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';

const [dir = 'dist', port = '4173', base = '/'] = process.argv.slice(2);
const root = resolve(dir);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.glb']);

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (!path.startsWith(base)) {
    res.writeHead(404).end();
    return;
  }
  path = path.slice(base.length);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const ext = extname(file);
  const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' };
  const gzip = GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  if (gzip) headers['Content-Encoding'] = 'gzip';
  else headers['Content-Length'] = statSync(file).size;
  res.writeHead(200, headers);
  const body = createReadStream(file);
  (gzip ? body.pipe(createGzip({ level: 6 })) : body).pipe(res);
}).listen(Number(port), () => console.log(`serving ${root} at http://localhost:${port}${base} (gzip like GitHub Pages)`));
