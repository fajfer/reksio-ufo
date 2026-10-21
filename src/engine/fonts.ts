// Bitmap fonts (.FNT, CSimpleFont6) and the FONT object. See
// docs/filters-fonts.md for the format and metric rules (PIKLIB8.dll
// addresses cited inline).

import type { ObjectDef } from '../formats/cnv.ts';
import type { Engine } from './engine.ts';
import { GameObject } from './object.ts';
import { makeSprite, type Sprite } from './renderer.ts';

export interface FntFont {
  /** Header dword 0 (create writes 0x46; Load ignores it). */
  magic: number;
  /** Atlas size: all glyphs side by side. */
  width: number;
  height: number;
  /** Header dword 3 (create writes 16). 15 selects RGB555, anything else RGB565. */
  bpp: number;
  /** Glyph cell width = width / count. */
  cellWidth: number;
  /** Character codes (Windows-1250 bytes), one per glyph. */
  chars: Uint8Array;
  /** kern[prev * count + cur], signed. */
  kern: Int8Array;
  /** Empty columns on the left / right of each glyph cell, signed. */
  left: Int8Array;
  right: Int8Array;
  rgba: Uint8ClampedArray;
}

/**
 * Decode a .FNT file (CSimpleFont6::Load(CFile*) 0x100d2a80):
 * int32 magic, width, height, bpp, count; u8 chars[count]; i8 kern[count^2];
 * i8 left[count]; i8 right[count]; u16 pixels[width*height]; u8 alpha[width*height].
 */
export function decodeFnt(buf: Uint8Array): FntFont {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 20) throw new Error('FNT: truncated header');
  const magic = dv.getInt32(0, true);
  const width = dv.getInt32(4, true);
  const height = dv.getInt32(8, true);
  const bpp = dv.getInt32(12, true);
  const count = dv.getInt32(16, true);
  if (width < 0 || height < 0 || count <= 0 || count > 256) throw new Error(`FNT: bad header ${width}x${height} n=${count}`);
  let p = 20;
  const take = (n: number) => {
    if (p + n > buf.length) throw new Error('FNT: truncated');
    const s = buf.subarray(p, p + n);
    p += n;
    return s;
  };
  const chars = take(count).slice();
  const kern = new Int8Array(take(count * count).slice().buffer);
  const left = new Int8Array(take(count).slice().buffer);
  const right = new Int8Array(take(count).slice().buffer);
  const px = take(width * height * 2);
  const alpha = p + width * height <= buf.length ? take(width * height) : null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const r555 = bpp === 15;
  for (let i = 0; i < width * height; i++) {
    const v = px[i * 2] | (px[i * 2 + 1] << 8);
    let r: number, g: number, b: number;
    if (r555) {
      r = (v >> 10) & 0x1f;
      g = (v >> 5) & 0x1f;
      b = v & 0x1f;
      g = (g << 3) | (g >> 2);
    } else {
      r = (v >> 11) & 0x1f;
      g = (v >> 5) & 0x3f;
      b = v & 0x1f;
      g = (g << 2) | (g >> 4);
    }
    rgba[i * 4] = (r << 3) | (r >> 2);
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = (b << 3) | (b >> 2);
    rgba[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return { magic, width, height, bpp, cellWidth: Math.trunc(width / count), chars, kern, left, right, rgba };
}

// Windows-1250 upper half, for mapping JS strings to the font's byte codes.
const CP1250_HIGH =
  '€�‚�„…†‡�‰Š‹ŚŤŽŹ' +
  '�‘’“”•–—�™š›śťžź' +
  ' ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż' +
  '°±˛ł´µ¶·¸ąş»Ľ˝ľż' +
  'ŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎ' +
  'ĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢß' +
  'ŕáâăäĺćçčéęëěíîď' +
  'đńňóôőö÷řůúűüýţ˙';
const CP1250_MAP = new Map<string, number>([...CP1250_HIGH].map((ch, i) => [ch, 0x80 + i]));

/** Byte code of a character in Windows-1250 (0 if unmappable). */
export function cp1250Code(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 0x80) return c;
  return CP1250_MAP.get(ch) ?? 0;
}

/** Metric and drawing logic of CSimpleFont6 over a decoded .FNT. */
export class BitmapFont {
  readonly fnt: FntFont;
  private index = new Map<number, number>();
  private sprite: Sprite | null = null;

  constructor(fnt: FntFont) {
    this.fnt = fnt;
    // findLetter (0x100d36c0) is a linear search: the first match wins.
    fnt.chars.forEach((c, i) => {
      if (!this.index.has(c)) this.index.set(c, i);
    });
  }

  get height(): number {
    return this.fnt.height;
  }

  findLetter(code: number): number {
    return this.index.get(code) ?? -1;
  }

  /** getRealLetterWidth (0x100d3ba0): trimmed cell width, no kerning. */
  realLetterWidth(code: number): number {
    if (code === 0x20) return this.letterWidth(0, 0x6c);
    if (code === 0x7e) return 1;
    const i = this.findLetter(code);
    if (i < 0 || code === 0) return 0;
    return this.fnt.cellWidth - this.fnt.right[i] - this.fnt.left[i];
  }

  /** getLetterWidth(prev, ch) (0x100d3930). ' ' is as wide as 'l'; '~' is 1. */
  letterWidth(prev: number, code: number): number {
    if (code === 0x20) return this.letterWidth(0, 0x6c);
    if (code === 0x7e) return 1;
    const i = code ? this.findLetter(code) : -1;
    if (i < 0) return 0;
    const p = prev ? this.findLetter(prev) : -1;
    const k = p >= 0 ? this.fnt.kern[p * this.fnt.chars.length + i] : 0;
    return this.fnt.cellWidth - this.fnt.right[i] - this.fnt.left[i] - k;
  }

  /** Pen advance after drawing `code` = drawLetter's return (0x100d3700). */
  advance(prev: number, code: number): number {
    return this.letterWidth(prev, code) + 2;
  }

  /** CText6::getLength (0x100de5a0): sum of letterWidth + 2. */
  measure(text: string): number {
    let w = 0;
    let prev = 0;
    for (const ch of text) {
      const c = cp1250Code(ch);
      w += this.advance(prev, c);
      prev = c;
    }
    return w;
  }

  private atlas(): Sprite {
    this.sprite ??= makeSprite(this.fnt.width, this.fnt.height, this.fnt.rgba);
    return this.sprite;
  }

  /**
   * Draw one glyph with its visible columns starting at screen x - kern
   * (drawLetter 0x100d3700). Returns the pen advance.
   */
  drawLetter(ctx: CanvasRenderingContext2D, x: number, y: number, prev: number, code: number): number {
    const i = code && code !== 0x20 && code !== 0x7e ? this.findLetter(code) : -1;
    if (i >= 0) {
      const f = this.fnt;
      const srcX = i * f.cellWidth + f.left[i];
      const w = f.cellWidth - f.right[i] - f.left[i];
      const p = prev ? this.findLetter(prev) : -1;
      const k = p >= 0 ? f.kern[p * f.chars.length + i] : 0;
      if (w > 0 && f.height > 0) ctx.drawImage(this.atlas().bitmap, srcX, 0, w, f.height, x - k, y, w, f.height);
    }
    return this.advance(prev, code);
  }

  /** CText6::Redraw (0x100de000), multifont path: one line from (x, y). */
  drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    let pen = x;
    let prev = 0;
    for (const ch of text) {
      const c = cp1250Code(ch);
      pen += this.drawLetter(ctx, pen, y, prev, c);
      prev = c;
    }
  }
}

export type HJustify = 'LEFT' | 'RIGHT' | 'CENTER';
export type VJustify = 'TOP' | 'BOTTOM' | 'CENTER';

/**
 * Text origin inside RECT (CText6::setJustify 0x100de620). Divisions
 * truncate toward zero as in the original.
 */
export function justify(
  rect: [number, number, number, number],
  width: number,
  height: number,
  h: HJustify,
  v: VJustify,
): { x: number; y: number } {
  const [l, t, r, b] = rect;
  const x = h === 'RIGHT' ? r - width : h === 'CENTER' ? l + Math.trunc((r - l - width) / 2) : l;
  const y = v === 'BOTTOM' ? b - height : v === 'CENTER' ? t + Math.trunc((b - t - height) / 2) : t;
  return { x, y };
}

/** Script HJUSTIFY/VJUSTIFY values -> justification (inferred mapping). */
export function parseJustify(hProp: string, vProp: string): { h: HJustify; v: VJustify } {
  const hv = hProp.trim().toUpperCase();
  const vv = vProp.trim().toUpperCase();
  const h: HJustify = hv === 'RIGHT' ? 'RIGHT' : hv === 'CENTER' ? 'CENTER' : 'LEFT';
  const v: VJustify = vv === 'TRUE' || vv === 'CENTER' ? 'CENTER' : vv === 'BOTTOM' ? 'BOTTOM' : 'TOP';
  return { h, v };
}

/** One DEF_<FAMILY>_<STYLE>_<SIZE>=<file> entry of a FONT object. */
export interface FontDef {
  family: string;
  style: string;
  size: number;
  file: string;
}

export function parseFontDefs(props: Map<string, string>): FontDef[] {
  const out: FontDef[] = [];
  for (const [k, v] of props) {
    const m = /^DEF_([^_]+)_([^_]+)_(\d+)$/i.exec(k);
    if (m) out.push({ family: m[1].toUpperCase(), style: m[2].toUpperCase(), size: Number(m[3]), file: v.trim() });
  }
  return out;
}

/**
 * FONT object (CMC_Font holding a CFontCollection). The first loadable
 * DEF_* entry becomes the base font. When the .FNT is missing (ARIAL14.FNT
 * is not shipped with this game) text falls back to a canvas font of the
 * declared family and size.
 */
export class Font extends GameObject {
  readonly defs: FontDef[];
  bitmap: BitmapFont | null = null;
  color = '#fff';

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.defs = parseFontDefs(def.props);
  }

  async load(): Promise<void> {
    for (const d of this.defs) {
      const path = this.engine.resolver.resolve(d.file);
      if (!path) continue;
      try {
        this.bitmap = new BitmapFont(decodeFnt(await this.engine.fs.read(path)));
        return;
      } catch (e) {
        this.engine.warn(`FONT ${this.name}: ${d.file}: ${(e as Error).message}`);
      }
    }
    if (this.defs.length) this.engine.warnOnce(`FONT ${this.name}: ${this.defs[0].file} missing, using canvas font`);
  }

  private cssFont(): string {
    const d = this.defs[0];
    const family = d ? d.family.charAt(0) + d.family.slice(1).toLowerCase() : 'Arial';
    const bold = d?.style === 'BOLD' ? 'bold ' : '';
    return `${bold}${d?.size ?? 14}px ${family}, sans-serif`;
  }

  height(): number {
    return this.bitmap ? this.bitmap.height : (this.defs[0]?.size ?? 14);
  }

  measure(ctx: CanvasRenderingContext2D | null, text: string): number {
    if (this.bitmap) return this.bitmap.measure(text);
    if (!ctx) return text.length * Math.round(this.height() * 0.55);
    ctx.save();
    ctx.font = this.cssFont();
    const w = ctx.measureText(text).width;
    ctx.restore();
    return Math.round(w);
  }

  /** Draw text with its top-left at (x, y). */
  drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    if (this.bitmap) {
      this.bitmap.drawText(ctx, text, x, y);
      return;
    }
    ctx.save();
    ctx.font = this.cssFont();
    ctx.fillStyle = this.color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /** Lay out and draw a TEXT object's string inside RECT. */
  drawInRect(
    ctx: CanvasRenderingContext2D,
    text: string,
    rect: [number, number, number, number],
    hProp: string,
    vProp: string,
  ): void {
    const { h, v } = parseJustify(hProp, vProp);
    const { x, y } = justify(rect, this.measure(ctx, text), this.height(), h, v);
    this.drawText(ctx, text, x, y);
  }
}
