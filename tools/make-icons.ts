// Builds the PWA icon set (public/icons) from the icon already inside the
// game's ReksioUfo.exe — no new artwork, no filters: the 32x32 bitmap is
// decoded from the executable's PE resources and scaled up with
// nearest-neighbour at whole-number factors (5x, 12x, 15x), so every pixel
// stays square and the original dither reads as crisp retro shading.
//
//   node tools/make-icons.ts [path/to/ReksioUfo.exe]
//
// The generated PNGs are committed, so builds never need the game files.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.ts';

const BG = [0x0b, 0x0d, 0x12]; // app background (theme-color), for opaque icons

interface Bitmap {
  w: number;
  h: number;
  /** Straight-alpha RGBA. */
  rgba: Uint8ClampedArray;
}

// --- PE resource extraction --------------------------------------------------

function rvaToOffset(exe: Buffer, sections: number, optSize: number, lfanew: number, rva: number): number {
  for (let i = 0; i < sections; i++) {
    const s = lfanew + 24 + optSize + i * 40;
    const va = exe.readUInt32LE(s + 12);
    const vsize = exe.readUInt32LE(s + 8);
    const rawSize = exe.readUInt32LE(s + 16);
    const raw = exe.readUInt32LE(s + 20);
    if (rva >= va && rva < va + Math.max(vsize, rawSize)) return rva - va + raw;
  }
  throw new Error(`RVA 0x${rva.toString(16)} is not in any section`);
}

/** Every RT_ICON image in the executable, decoded to RGBA. */
function exeIcons(exe: Buffer): Bitmap[] {
  const lfanew = exe.readUInt32LE(0x3c);
  if (exe.toString('latin1', lfanew, lfanew + 4) !== 'PE\0\0') throw new Error('not a PE executable');
  const sections = exe.readUInt16LE(lfanew + 6);
  const optSize = exe.readUInt16LE(lfanew + 20);
  const opt = lfanew + 24;
  const dirs = opt + (exe.readUInt16LE(opt) === 0x20b ? 112 : 96);
  const resRva = exe.readUInt32LE(dirs + 2 * 8);
  if (!resRva) throw new Error('no resource directory');
  const root = rvaToOffset(exe, sections, optSize, lfanew, resRva);

  const entries = (base: number): { id: number; off: number; dir: boolean }[] => {
    const n = exe.readUInt16LE(base + 12) + exe.readUInt16LE(base + 14);
    const out: { id: number; off: number; dir: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const p = base + 16 + i * 8;
      const off = exe.readUInt32LE(p + 4);
      out.push({ id: exe.readUInt32LE(p), off: off & 0x7fffffff, dir: !!(off & 0x80000000) });
    }
    return out;
  };

  const icons: Bitmap[] = [];
  for (const type of entries(root)) {
    if (type.id !== 3 /* RT_ICON */ || !type.dir) continue;
    for (const name of entries(root + type.off)) {
      if (!name.dir) continue;
      for (const lang of entries(root + name.off)) {
        if (lang.dir) continue; // the language level holds the data entries
        const entry = root + lang.off; // IMAGE_RESOURCE_DATA_ENTRY
        const size = exe.readUInt32LE(entry + 4);
        const off = rvaToOffset(exe, sections, optSize, lfanew, exe.readUInt32LE(entry));
        icons.push(decodeDib(exe.subarray(off, off + size)));
      }
    }
  }
  if (!icons.length) throw new Error('no RT_ICON resources');
  return icons;
}

/** Decodes a .ico image payload: BITMAPINFOHEADER + palette + pixels + AND mask. */
function decodeDib(dib: Buffer): Bitmap {
  const header = dib.readUInt32LE(0);
  const w = dib.readInt32LE(4);
  const h = dib.readInt32LE(8) >> 1; // stored height counts the AND mask
  const bpp = dib.readUInt16LE(14);
  if (dib.readUInt32LE(16) !== 0) throw new Error('compressed icon DIBs are not supported');
  const clrUsed = dib.readUInt32LE(32);

  let paletteOff = header;
  const palette: [number, number, number][] = [];
  if (bpp <= 8) {
    const n = clrUsed || 1 << bpp;
    for (let i = 0; i < n; i++) {
      const p = paletteOff + i * 4;
      palette.push([dib[p + 2], dib[p + 1], dib[p]]); // BGRA -> RGB
    }
    paletteOff += n * 4;
  }

  const xorStride = (((w * bpp) + 31) >> 5) * 4;
  const andStride = ((w + 31) >> 5) * 4;
  const andOff = paletteOff + xorStride * h;
  const hasAlpha = bpp === 32 && (() => {
    for (let i = 3; i < xorStride * h; i += 4) {
      const a = dib[paletteOff + i];
      if (a !== 0 && a !== 255) return true;
    }
    return false;
  })();

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y; // DIB rows are bottom-up
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;
      if (bpp === 32) {
        const p = paletteOff + sy * xorStride + x * 4;
        [b, g, r] = [dib[p], dib[p + 1], dib[p + 2]];
        if (hasAlpha) a = dib[p + 3];
      } else if (bpp === 24) {
        const p = paletteOff + sy * xorStride + x * 3;
        [b, g, r] = [dib[p], dib[p + 1], dib[p + 2]];
      } else {
        const byte = dib[paletteOff + sy * xorStride + ((x * bpp) >> 3)];
        const idx = bpp === 8 ? byte : bpp === 4 ? (byte >> (x & 1 ? 0 : 4)) & 0xf : (byte >> (7 - (x & 7))) & 1;
        [r, g, b] = palette[idx] ?? [0, 0, 0];
      }
      const maskBit = dib[andOff + sy * andStride + (x >> 3)] & (0x80 >> (x & 7));
      if (maskBit && !hasAlpha) a = 0;
      const o = (y * w + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
  return { w, h, rgba };
}

// --- output helpers ----------------------------------------------------------

/** Nearest-neighbour scale by an integer factor. */
function zoom(src: Bitmap, factor: number): Bitmap {
  const w = src.w * factor;
  const h = src.h * factor;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / factor) * src.w + Math.floor(x / factor)) * 4;
      const o = (y * w + x) * 4;
      rgba[o] = src.rgba[s];
      rgba[o + 1] = src.rgba[s + 1];
      rgba[o + 2] = src.rgba[s + 2];
      rgba[o + 3] = src.rgba[s + 3];
    }
  }
  return { w, h, rgba };
}

/**
 * Zoom by `factor` and centre it on a `size` square canvas. With a background
 * colour the icon is opaque (apple-touch, maskable); without, the padding is
 * transparent.
 */
function compose(src: Bitmap, factor: number, size: number, bg: number[] | null): Bitmap {
  const inner = zoom(src, factor);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const off = Math.floor((size - inner.w) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const sx = x - off;
      const sy = y - off;
      if (sx < 0 || sy < 0 || sx >= inner.w || sy >= inner.h) {
        if (bg) {
          rgba[o] = bg[0];
          rgba[o + 1] = bg[1];
          rgba[o + 2] = bg[2];
          rgba[o + 3] = 255;
        }
        continue;
      }
      const s = (sy * inner.w + sx) * 4;
      const a = bg ? inner.rgba[s + 3] / 255 : 1;
      if (bg) {
        rgba[o] = Math.round(inner.rgba[s] * a + bg[0] * (1 - a));
        rgba[o + 1] = Math.round(inner.rgba[s + 1] * a + bg[1] * (1 - a));
        rgba[o + 2] = Math.round(inner.rgba[s + 2] * a + bg[2] * (1 - a));
        rgba[o + 3] = 255;
      } else {
        rgba[o] = inner.rgba[s];
        rgba[o + 1] = inner.rgba[s + 1];
        rgba[o + 2] = inner.rgba[s + 2];
        rgba[o + 3] = inner.rgba[s + 3];
      }
    }
  }
  return { w: size, h: size, rgba };
}

// --- main --------------------------------------------------------------------

const exePath = process.argv[2] ?? join('game', 'ReksioUfo.exe');
if (!existsSync(exePath)) {
  console.error(`ReksioUfo.exe not found at ${exePath} (pass the path, or symlink the install to ./game)`);
  process.exit(1);
}

const icons = exeIcons(readFileSync(exePath));
const source = icons.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
console.log(`icon source: ${source.w}x${source.h} (${icons.length} image(s) in the exe)`);

const out = 'public/icons';
mkdirSync(out, { recursive: true });
const write = (name: string, bmp: Bitmap): void => {
  writeFileSync(join(out, name), encodePng(bmp.w, bmp.h, bmp.rgba));
  console.log(`${out}/${name} (${bmp.w}x${bmp.h})`);
};

// Integer zoom factors keep every source pixel square.
write('favicon-32.png', source);
write('icon-192.png', compose(source, 5, 192, null)); // transparent "any" icons
write('icon-512.png', compose(source, 15, 512, null));
write('icon-180.png', compose(source, 5, 180, BG)); // apple-touch: opaque
write('maskable-512.png', compose(source, 12, 512, BG)); // 75%: inside the safe circle
