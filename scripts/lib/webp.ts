// The loading picture's files (ADR-56): a WebP's size and format from its
// RIFF container, without decoding it, and the checks scripts/still/write.ts
// and npm run assets:check hold each file to (src/asset/stillSpec.ts).

export interface WebpInfo {
  width: number;
  height: number;
  /** The first chunk: lossy (VP8), lossless (VP8L) or extended (VP8X). */
  format: 'VP8' | 'VP8L' | 'VP8X';
}

/** The size and format of a WebP file, or null if it is not one (or is cut short). */
export function readWebp(bytes: Uint8Array): WebpInfo | null {
  if (bytes.length < 30) return null;
  const ascii = (at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
  const u16 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8);
  const u24 = (at: number) => u16(at) | (bytes[at + 2]! << 16);
  const u32 = (at: number) => (u24(at) | (bytes[at + 3]! << 24)) >>> 0;
  if (ascii(0) !== 'RIFF' || ascii(8) !== 'WEBP') return null;
  // The RIFF size counts everything after its own field: a shorter file was cut off.
  if (u32(4) + 8 !== bytes.length) return null;
  const data = 20;
  switch (ascii(12)) {
    case 'VP8 ':
      // A key frame: a 3-byte frame tag, the start code 9d 01 2a, then 14-bit width and height.
      if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
      return { width: u16(data + 6) & 0x3fff, height: u16(data + 8) & 0x3fff, format: 'VP8' };
    case 'VP8L': {
      if (bytes[data] !== 0x2f) return null;
      const bits = u32(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, format: 'VP8L' };
    }
    case 'VP8X':
      return { width: u24(data + 4) + 1, height: u24(data + 7) + 1, format: 'VP8X' };
    default:
      return null;
  }
}

export interface StillLimits {
  width: number;
  height: number;
  maxBytes: number;
}

/** What is wrong with one loading picture against its spec; empty when nothing is. */
export function stillProblems(bytes: Uint8Array | null, limits: StillLimits): string[] {
  if (!bytes) return ['missing'];
  const info = readWebp(bytes);
  if (!info) return ['not a WebP file'];
  const problems: string[] = [];
  if (info.width !== limits.width || info.height !== limits.height) {
    problems.push(`${info.width} x ${info.height}, not ${limits.width} x ${limits.height}`);
  }
  if (bytes.length > limits.maxBytes) {
    problems.push(`${(bytes.length / 1024).toFixed(1)} KB, over ${(limits.maxBytes / 1024).toFixed(0)} KB`);
  }
  return problems;
}
