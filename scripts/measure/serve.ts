// A static server for scripts/measure that compresses like GitHub Pages, the
// live host (ADR-49): gzip for HTML, CSS, JS, JSON, SVG, WebAssembly and the
// GLBs (checked on 2026-11-09: Pages sends `.wasm` and `.glb` gzipped),
// `Cache-Control: max-age=600`, nothing else. `vite preview` gzips only the
// text files, so it overstates what a student downloads for the models.
//
//   npx tsx scripts/measure/serve.ts [dir=dist] [port=4173] [base=/]
//
// Only node:http, node:fs and node:zlib: no server package (CLAUDE.md).
// Loopback only, and only files inside `dir`.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';

const TYPES: Record<string, string> = {
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
/** What GitHub Pages gzips, of what this app serves. */
export const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.glb']);

/**
 * The file a request path names under `root`, or null when it would leave
 * `root`: a `..` (plain or percent-encoded, either separator), a NUL, another
 * drive, or a path outside `base`. Containment is checked on the resolved
 * path relative to `root`, not on a string prefix (a sibling folder such as
 * `dist-private` shares the prefix).
 */
export function fileFor(root: string, pathname: string, base = '/'): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!path.startsWith(base) || path.includes('\0')) return null;
  const file = resolve(root, `.${sep}${path.slice(base.length)}`);
  const rel = relative(root, file);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return file;
  return null;
}

export function serve(dir: string, port: number, base: string) {
  const root = resolve(dir);
  return createServer((req, res) => {
    let file = fileFor(root, new URL(req.url ?? '/', 'http://localhost').pathname, base);
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const ext = extname(file);
    const headers: Record<string, string | number> = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' };
    const gzip = GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (gzip) headers['Content-Encoding'] = 'gzip';
    else headers['Content-Length'] = statSync(file).size;
    res.writeHead(200, headers);
    const body = createReadStream(file);
    (gzip ? body.pipe(createGzip({ level: 6 })) : body).pipe(res);
  }).listen(port, 'localhost', () => console.log(`serving ${root} at http://localhost:${port}${base} (gzip like GitHub Pages)`));
}

// Run, not imported (the tests import fileFor).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = 'dist', port = '4173', base = '/'] = process.argv.slice(2);
  serve(dir, Number(port), base);
}
