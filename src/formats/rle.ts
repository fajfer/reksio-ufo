// Run-length codecs from CRLECompression (PIKLIB8.dll).
// Control byte b: if b & 0x80, repeat the next unit (b & 0x7f) times;
// otherwise copy b literal units. Decoding stops once outBytes are produced.

/** CRLECompression::__decompress (0x10019e80): 16-bit units. */
export function rleDecompress16(src: Uint8Array, outBytes: number, start = 0): Uint8Array {
  const out = new Uint8Array(outBytes);
  let ip = start;
  let op = 0;
  while (op < outBytes && ip < src.length) {
    const b = src[ip++];
    if (b & 0x80) {
      const n = b & 0x7f;
      const lo = src[ip++];
      const hi = src[ip++];
      for (let i = 0; i < n && op + 1 < outBytes; i++) {
        out[op++] = lo;
        out[op++] = hi;
      }
    } else {
      const len = Math.min(b * 2, outBytes - op);
      out.set(src.subarray(ip, ip + len), op);
      ip += b * 2;
      op += len;
    }
  }
  return out;
}

/** CRLECompression::__decompresschar (0x10019ef0): 8-bit units. */
export function rleDecompress8(src: Uint8Array, outBytes: number, start = 0): Uint8Array {
  const out = new Uint8Array(outBytes);
  let ip = start;
  let op = 0;
  while (op < outBytes && ip < src.length) {
    const b = src[ip++];
    if (b & 0x80) {
      const n = Math.min(b & 0x7f, outBytes - op);
      out.fill(src[ip++], op, op + n);
      op += n;
    } else {
      const len = Math.min(b, outBytes - op);
      out.set(src.subarray(ip, ip + len), op);
      ip += b;
      op += len;
    }
  }
  return out;
}
