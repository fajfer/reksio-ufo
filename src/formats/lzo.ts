// LZO1X decompressor. PIKLIB8.dll ships this as sub_100eaaa0, reached through
// CLZWCompression2::decompress (0x10034cb0), which reads a header of
// [u32 decompressedSize][u32 compressedSize] followed by the LZO1X stream.

export function lzo1xDecompress(src: Uint8Array, outSize: number, start = 0, end = src.length): Uint8Array {
  const out = new Uint8Array(outSize);
  let ip = start;
  let op = 0;
  let t = 0;
  let mPos = 0;

  const copyMatch = (len: number) => {
    // Byte-by-byte on purpose: overlapping matches replicate recent output.
    for (let i = 0; i < len; i++) out[op++] = out[mPos++];
  };
  const copyLiterals = (len: number) => {
    out.set(src.subarray(ip, ip + len), op);
    op += len;
    ip += len;
  };
  const extendedLength = (base: number) => {
    let n = 0;
    while (src[ip] === 0) {
      n += 255;
      ip++;
    }
    return n + base + src[ip++];
  };

  type State = 'loop' | 'firstLiteralRun' | 'match' | 'matchDone' | 'matchNext';
  let state: State = 'loop';

  if (src[ip] > 17) {
    t = src[ip++] - 17;
    if (t < 4) {
      state = 'matchNext';
    } else {
      copyLiterals(t);
      state = 'firstLiteralRun';
    }
  }

  while (ip < end) {
    switch (state) {
      case 'loop':
        t = src[ip++];
        if (t >= 16) {
          state = 'match';
          break;
        }
        if (t === 0) t = extendedLength(15);
        copyLiterals(t + 3);
        state = 'firstLiteralRun';
        break;

      case 'firstLiteralRun':
        t = src[ip++];
        if (t >= 16) {
          state = 'match';
          break;
        }
        mPos = op - (1 + 0x0800) - (t >> 2) - (src[ip++] << 2);
        copyMatch(3);
        state = 'matchDone';
        break;

      case 'match':
        if (t >= 64) {
          mPos = op - 1 - ((t >> 2) & 7) - (src[ip++] << 3);
          t = (t >> 5) - 1;
        } else if (t >= 32) {
          t &= 31;
          if (t === 0) t = extendedLength(31);
          mPos = op - 1 - ((src[ip] | (src[ip + 1] << 8)) >> 2);
          ip += 2;
        } else if (t >= 16) {
          mPos = op - ((t & 8) << 11);
          t &= 7;
          if (t === 0) t = extendedLength(7);
          mPos -= (src[ip] | (src[ip + 1] << 8)) >> 2;
          ip += 2;
          if (mPos === op) return out; // end-of-stream marker
          mPos -= 0x4000;
        } else {
          mPos = op - 1 - (t >> 2) - (src[ip++] << 2);
          copyMatch(2);
          state = 'matchDone';
          break;
        }
        copyMatch(t + 2);
        state = 'matchDone';
        break;

      case 'matchDone':
        t = src[ip - 2] & 3;
        state = t === 0 ? 'loop' : 'matchNext';
        break;

      case 'matchNext':
        copyLiterals(t);
        t = src[ip++];
        state = 'match';
        break;
    }
  }
  return out;
}

/** Decode a CLZWCompression2 blob: [u32 outSize][u32 inSize][lzo1x data]. */
export function decodeLzoBlob(blob: Uint8Array): Uint8Array {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const outSize = dv.getUint32(0, true);
  const inSize = dv.getUint32(4, true);
  return lzo1xDecompress(blob, outSize, 8, Math.min(blob.length, 8 + inSize));
}
