// The loading picture's checks (ADR-56): WebP headers built by hand for each
// of the three formats, and files that are not one.
import { describe, expect, it } from 'vitest';
import { readWebp, stillProblems } from './webp';

/** A RIFF WebP whose first chunk is `fourcc` with `payload`, padded to `total` bytes overall. */
function webp(fourcc: string, payload: number[], total = 64): Uint8Array {
  const bytes = new Uint8Array(total);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  put(0, 'RIFF');
  new DataView(bytes.buffer).setUint32(4, total - 8, true);
  put(8, 'WEBP');
  put(12, fourcc);
  new DataView(bytes.buffer).setUint32(16, total - 20, true);
  bytes.set(payload, 20);
  return bytes;
}

const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

describe('readWebp', () => {
  it('reads a lossy (VP8) key frame: 14-bit width and height after the start code', () => {
    const f = webp('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(1600), ...le16(800)]);
    expect(readWebp(f)).toEqual({ width: 1600, height: 800, format: 'VP8' });
  });

  it('reads a lossless (VP8L) header: width and height minus one in 14 bits each', () => {
    const bits = (1600 - 1) | ((800 - 1) << 14);
    const f = webp('VP8L', [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff]);
    expect(readWebp(f)).toEqual({ width: 1600, height: 800, format: 'VP8L' });
  });

  it('reads an extended (VP8X) header: 24-bit canvas width and height minus one', () => {
    const f = webp('VP8X', [0x10, 0, 0, 0, ...le24(1600 - 1), ...le24(800 - 1)]);
    expect(readWebp(f)).toEqual({ width: 1600, height: 800, format: 'VP8X' });
  });

  it('refuses a PNG, a cut-off file and a lossy frame without its start code', () => {
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(readWebp(png)).toBeNull();
    const whole = webp('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(1600), ...le16(800)]);
    expect(readWebp(whole.subarray(0, 48))).toBeNull();
    expect(readWebp(webp('VP8 ', [0x10, 0x02, 0x00, 0, 0, 0, ...le16(1600), ...le16(800)]))).toBeNull();
  });
});

describe('stillProblems', () => {
  const limits = { width: 1600, height: 800, maxBytes: 100 };
  const good = webp('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(1600), ...le16(800)]);

  it('passes a WebP of the right size within the budget', () => {
    expect(stillProblems(good, limits)).toEqual([]);
  });

  it('names each fault: missing, not WebP, the wrong size, over budget', () => {
    expect(stillProblems(null, limits)).toEqual(['missing']);
    expect(stillProblems(new Uint8Array(64), limits)).toEqual(['not a WebP file']);
    const small = webp('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...le16(800), ...le16(400)]);
    expect(stillProblems(small, limits)).toEqual(['800 x 400, not 1600 x 800']);
    expect(stillProblems(good, { ...limits, maxBytes: 32 })).toEqual(['0.1 KB, over 0 KB']);
  });
});
