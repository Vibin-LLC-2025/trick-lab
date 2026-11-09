// @vitest-environment node
// The measurement server serves only what is inside its folder (review of
// Phase A, 2026-11-09): a string-prefix check let `/..%2fdist-private/...`
// out into a sibling folder.
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileFor } from './serve';

const root = resolve('some', 'dist');

describe('fileFor', () => {
  it('maps paths inside the folder, under the base', () => {
    expect(fileFor(root, '/')).toBe(root);
    expect(fileFor(root, '/models/board.glb')).toBe(resolve(root, 'models', 'board.glb'));
    expect(fileFor(root, '/trick-lab/basis/x.wasm', '/trick-lab/')).toBe(resolve(root, 'basis', 'x.wasm'));
    expect(fileFor(root, '/assets/a%20b.js')).toBe(resolve(root, 'assets', 'a b.js'));
  });

  it.each([
    ['a parent folder', '/../secret.txt'],
    ['an encoded slash into a sibling sharing the prefix', '/..%2fdist-private%2fexample.txt'],
    ['an encoded backslash', '/..%5cdist-private%5cexample.txt'],
    ['encoded dots', '/%2e%2e/%2e%2e/etc/passwd'],
    ['a NUL', '/index.html%00.js'],
    ['bad percent encoding', '/%E0%A4%A'],
    ['a path outside the base', '/elsewhere/index.html'],
  ])('refuses %s', (_name, path) => {
    expect(fileFor(root, path, path === '/elsewhere/index.html' ? '/trick-lab/' : '/')).toBeNull();
  });

  it('refuses another drive or an absolute path where the platform has them', () => {
    expect(fileFor(root, sep === '\\' ? '/C:%5cWindows%5cwin.ini' : '//etc/passwd')).not.toBe('C:\\Windows\\win.ini');
    const p = fileFor(root, '//etc/passwd');
    expect(p === null || p.startsWith(root)).toBe(true);
  });
});
