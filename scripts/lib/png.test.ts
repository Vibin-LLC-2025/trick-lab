// @vitest-environment node
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng, pngSize } from './png';

/** Reads back an encoded PNG (IHDR, CRCs, IDAT, filters) to prove the encoder is lossless. */
function decode(png: Uint8Array) {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let o = 8;
  let width = 0, height = 0, channels = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = v.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    expect(v.getUint32(o + 8 + len), `${type} CRC`).toBe(crc32(png.subarray(o + 4, o + 8 + len)));
    if (type === 'IHDR') {
      width = v.getUint32(o + 8);
      height = v.getUint32(o + 12);
      channels = data[9] === 0 ? 1 : 3;
    }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? out[y * stride + i - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type]!;
      out[y * stride + i] = (x + pred) & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

describe('PNG encoder', () => {
  it('round-trips RGB and grey images exactly', () => {
    const rgb = Uint8Array.from({ length: 7 * 5 * 3 }, (_, i) => (i * 37) % 256);
    const a = decode(encodePng(7, 5, 3, rgb));
    expect([a.width, a.height, a.channels]).toEqual([7, 5, 3]);
    expect(a.data).toEqual(rgb);
    const grey = Uint8Array.from({ length: 16 * 4 }, (_, i) => (i * i) % 256);
    expect(decode(encodePng(16, 4, 1, grey)).data).toEqual(grey);
  });

  it('is deterministic and reports its size', () => {
    const data = new Uint8Array(32 * 8 * 3).fill(200);
    expect(encodePng(32, 8, 3, data)).toEqual(encodePng(32, 8, 3, data));
    expect(pngSize(encodePng(32, 8, 3, data))).toEqual({ width: 32, height: 8 });
  });

  it('rejects data of the wrong size', () => {
    expect(() => encodePng(4, 4, 3, new Uint8Array(10))).toThrow();
  });
});
