import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rotateRGBA, rotatedRect, rotatedSize } from '../src/engine/filters.ts';
import { BitmapFont, cp1250Code, decodeFnt, justify, parseFontDefs, parseJustify } from '../src/engine/fonts.ts';

const GAME = process.env.REKSIO_GAME ?? '/home/fajfer/reksio-rewrite/game';
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const fntFiles = existsSync(GAME) ? walk(GAME).filter((f) => f.toLowerCase().endsWith('.fnt')) : [];

/** Build an .FNT the way CSimpleFont6::create (0x100d2e00) writes it. */
function makeFnt(chars: string, cell: number, height: number, opts: { kern?: [number, number, number][]; left?: number[]; right?: number[] } = {}) {
  const n = chars.length;
  const w = n * cell;
  const buf = new Uint8Array(20 + n + n * n + n + n + w * height * 3);
  const dv = new DataView(buf.buffer);
  [0x46, w, height, 16, n].forEach((v, i) => dv.setInt32(i * 4, v, true));
  let p = 20;
  for (const c of chars) buf[p++] = c.charCodeAt(0);
  const kernAt = p;
  p += n * n;
  for (const [a, b, k] of opts.kern ?? []) buf[kernAt + a * n + b] = k & 0xff;
  for (let i = 0; i < n; i++) buf[p++] = (opts.left?.[i] ?? 0) & 0xff;
  for (let i = 0; i < n; i++) buf[p++] = (opts.right?.[i] ?? 0) & 0xff;
  for (let i = 0; i < w * height; i++) {
    dv.setUint16(p, 0xf800, true); // pure red in RGB565
    p += 2;
  }
  for (let i = 0; i < w * height; i++) buf[p++] = i % 2 ? 255 : 0;
  return buf;
}

test('decodes a synthetic FNT (header, tables, RGB565 + alpha)', () => {
  const f = decodeFnt(makeFnt('ab', 8, 10, { left: [1, 2], right: [0, -1] }));
  assert.equal(f.magic, 0x46);
  assert.equal(f.width, 16);
  assert.equal(f.height, 10);
  assert.equal(f.cellWidth, 8);
  assert.deepEqual([...f.chars], [97, 98]);
  assert.deepEqual([...f.left], [1, 2]);
  assert.deepEqual([...f.right], [0, -1]);
  assert.deepEqual([...f.rgba.subarray(0, 8)], [255, 0, 0, 0, 255, 0, 0, 255]);
});

test('letter metrics follow getLetterWidth / drawLetter', () => {
  const font = new BitmapFont(decodeFnt(makeFnt('lAV', 10, 12, { left: [3, 1, 1], right: [3, 1, 2], kern: [[1, 2, 2]] })));
  assert.equal(font.letterWidth(0, 0x6c), 4); // 'l' = 10 - 3 - 3
  assert.equal(font.letterWidth(0, 0x20), 4); // space = width of 'l'
  assert.equal(font.letterWidth(0, 0x7e), 1); // '~'
  assert.equal(font.letterWidth(0, 0x41), 8);
  assert.equal(font.letterWidth(0x41, 0x56), 7 - 2); // 'V' after 'A' kerned by 2
  assert.equal(font.letterWidth(0, 0x5a), 0); // unknown letter
  assert.equal(font.measure('AV'), 8 + 2 + 5 + 2);
  assert.equal(font.measure('Z'), 2);
});

test('justification matches CText6::setJustify', () => {
  assert.deepEqual(justify([10, 10, 100, 30], 20, 14, 'LEFT', 'TOP'), { x: 10, y: 10 });
  assert.deepEqual(justify([10, 10, 100, 30], 20, 14, 'RIGHT', 'BOTTOM'), { x: 80, y: 16 });
  assert.deepEqual(justify([10, 10, 100, 30], 21, 15, 'CENTER', 'CENTER'), { x: 44, y: 12 });
  assert.deepEqual(parseJustify('LEFT', 'TRUE'), { h: 'LEFT', v: 'CENTER' });
});

test('FONT DEF_ properties and CP1250 mapping', () => {
  const defs = parseFontDefs(new Map([['TYPE', 'FONT'], ['DEF_ARIAL_STANDARD_14', 'ARIAL14.FNT']]));
  assert.deepEqual(defs, [{ family: 'ARIAL', style: 'STANDARD', size: 14, file: 'ARIAL14.FNT' }]);
  assert.equal(cp1250Code('A'), 0x41);
  assert.equal(cp1250Code('ł'), 0xb3);
  assert.equal(cp1250Code('Ż'), 0xaf);
  assert.equal(cp1250Code('ś'), 0x9c);
});

test('decodes every shipped .FNT', { skip: fntFiles.length === 0 && 'no .FNT files in the install' }, () => {
  for (const f of fntFiles) {
    const fnt = decodeFnt(readFileSync(f));
    assert.ok(fnt.width > 0 && fnt.height > 0 && fnt.chars.length > 0, f);
  }
});

test('rotation angle 0 is the identity', () => {
  const rgba = new Uint8ClampedArray(4 * 3 * 4).map((_, i) => (i % 4 === 3 ? 255 : i));
  const r = rotateRGBA(rgba, 4, 3, 0);
  assert.equal(r.width, 4);
  assert.equal(r.height, 3);
  assert.deepEqual([...r.rgba], [...rgba]);
  assert.deepEqual([r.dx, r.dy], [0, 0]);
});

test('positive ANGLE rotates clockwise about the frame center', () => {
  // 5x5, opaque marker at the right-middle pixel (4,2).
  const w = 5;
  const rgba = new Uint8ClampedArray(w * w * 4);
  rgba.set([255, 0, 0, 255], (2 * w + 4) * 4);
  const r = rotateRGBA(rgba, w, w, 90);
  assert.equal(r.width, 5);
  assert.equal(r.height, 5);
  const at = (x: number, y: number) => r.rgba[(y * r.width + x) * 4 + 3];
  assert.equal(at(2, 4), 255, 'marker moves to bottom-middle');
  assert.equal(at(4, 2), 0);
});

test('rotated frame grows to the diagonal box and keeps its center', () => {
  const s = rotatedSize(40, 20, 45);
  assert.ok(s.w > 40 && s.h > 20);
  const box = rotatedRect(100, 50, 40, 20, { angle: 45, pivotX: null, pivotY: null });
  assert.equal(box.x + Math.trunc(box.w / 2), 120);
  assert.equal(box.y + Math.trunc(box.h / 2), 60);
  assert.deepEqual(rotatedSize(40, 20, 90), { w: 20, h: 40 });
});
