// PIK image format, as read by CImage::Load (0x10030890) and
// decompressed by CGraphicsObject::DeCompress (0x1002c5d0) / DeCompressRLE2 (0x1002c820).
//
// 40-byte header (little endian):
//   0x00 "PIK\0"   0x04 width   0x08 height   0x0C bpp (always 16 here)
//   0x10 colorSize 0x14 unused  0x18 compression  0x1C alphaSize
//   0x20 x        0x24 y
// followed by colorSize bytes of RGB565 data and alphaSize bytes of 8-bit alpha.

import { decodeLzoBlob } from './lzo.ts';
import { rleDecompress16, rleDecompress8 } from './rle.ts';

export const Compression = {
  None: 0,
  Lzo: 2,
  LzoRle: 3,
  Rle: 4,
  Jpeg: 5,
} as const;

export interface DecodedImage {
  width: number;
  height: number;
  x: number;
  y: number;
  /** RGBA8888, length width*height*4. */
  rgba: Uint8ClampedArray;
}

/**
 * Decode one color plane + optional alpha plane into RGBA. Shared by IMG files
 * and ANN frames, which use the same compression codes.
 */
export function decodeGraphics(
  width: number,
  height: number,
  compression: number,
  color: Uint8Array,
  alpha: Uint8Array | null,
): Uint8ClampedArray {
  const pixels = width * height;
  let c: Uint8Array;
  let a: Uint8Array | null = alpha && alpha.length > 0 ? alpha : null;

  switch (compression) {
    case Compression.None:
      c = color;
      break;
    case Compression.Lzo:
      c = decodeLzoBlob(color);
      if (a) a = decodeLzoBlob(a);
      break;
    case Compression.LzoRle: {
      // DeCompress turns type 3 into type 4 after the LZO pass.
      const lc = decodeLzoBlob(color);
      c = rleDecompress16(lc, pixels * 2);
      if (a) a = rleDecompress8(decodeLzoBlob(a), pixels);
      break;
    }
    case Compression.Rle:
      // Some type-4 images are stored unpacked; CImage::Load compares the plane
      // size with __get_data_size before deciding, so do the same per plane.
      c = color.length === pixels * 2 ? color : rleDecompress16(color, pixels * 2);
      if (a && a.length !== pixels) a = rleDecompress8(a, pixels);
      break;
    default:
      throw new Error(`Unsupported graphics compression ${compression}`);
  }

  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let i = 0, j = 0; i < pixels; i++, j += 4) {
    const p = c[i * 2] | (c[i * 2 + 1] << 8);
    const r = (p >> 11) & 0x1f;
    const g = (p >> 5) & 0x3f;
    const b = p & 0x1f;
    rgba[j] = (r << 3) | (r >> 2);
    rgba[j + 1] = (g << 2) | (g >> 4);
    rgba[j + 2] = (b << 3) | (b >> 2);
    rgba[j + 3] = a ? a[i] : 255;
  }
  return rgba;
}

export function decodeImg(buf: Uint8Array): DecodedImage {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x004b4950) throw new Error('Not a PIK image');
  const width = dv.getInt32(0x04, true);
  const height = dv.getInt32(0x08, true);
  const colorSize = dv.getUint32(0x10, true);
  const compression = dv.getUint32(0x18, true);
  const alphaSize = dv.getUint32(0x1c, true);
  const x = dv.getInt32(0x20, true);
  const y = dv.getInt32(0x24, true);

  const color = buf.subarray(40, 40 + colorSize);
  const alpha = alphaSize ? buf.subarray(40 + colorSize, 40 + colorSize + alphaSize) : null;
  return { width, height, x, y, rgba: decodeGraphics(width, height, compression, color, alpha) };
}
