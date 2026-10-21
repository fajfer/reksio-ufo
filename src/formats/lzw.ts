// Legacy CLZWCompression::decompress (0x10034a40) container:
// [u32 decompressedSize][u32 compressedSize][u32 codeCount] + LSB-first
// 9..16-bit LZW codes; 0x100 clears the table, first free code is 0x101.
// Only PRZYGODA/Droga/kura.ann uses it.

export function decodeLzwBlob(buf: Uint8Array): Uint8Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const outSize = dv.getUint32(0, true);
  const codeCount = dv.getUint32(8, true);
  const src = new Uint8Array(buf.length - 12 + 4);
  src.set(buf.subarray(12));

  const out = new Uint8Array(outSize);
  let op = 0;
  let bitPos = 0;
  let width = 9;
  let mask = 0x1ff;
  let next = 0x101;
  let table: Uint8Array[] = [];
  let prev: Uint8Array | null = null;

  for (let n = 0; n < codeCount; n++) {
    const b = bitPos >> 3;
    const v = (src[b] | (src[b + 1] << 8) | (src[b + 2] << 16) | (src[b + 3] << 24)) >>> 0;
    const code = (v >>> (bitPos & 7)) & mask;
    bitPos += width;
    if (code === 0x100) {
      width = 9;
      mask = 0x1ff;
      next = 0x101;
      table = [];
      prev = null;
      continue;
    }
    let entry: Uint8Array;
    if (code < 0x100) entry = Uint8Array.of(code);
    else if (table[code]) entry = table[code];
    else if (prev) entry = Uint8Array.of(...prev, prev[0]);
    else throw new Error(`Bad LZW code ${code}`);

    const len = Math.min(entry.length, outSize - op);
    out.set(entry.subarray(0, len), op);
    op += len;
    if (prev && next < 0x10000) table[next++] = Uint8Array.of(...prev, entry[0]);
    prev = entry;
    if (width < 16 && next & ~mask) {
      width++;
      mask = mask * 2 + 1;
    }
  }
  return out;
}
