import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decodeText, parseDefinitions, parseSeq } from '../src/formats/cnv.ts';
import { decodeImg } from '../src/formats/img.ts';

const GAME = process.env.REKSIO_DATA ?? '/home/fajfer/reksio/pfx/drive_c/Program Files (x86)/AidemMedia/Reksio i UFO/DANE';
const haveGame = existsSync(GAME);
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = haveGame ? walk(GAME) : [];
const ext = (e: string) => files.filter((f) => f.toLowerCase().endsWith(e));

test('decrypts the main application script', { skip: !haveGame }, () => {
  const defs = parseDefinitions(decodeText(readFileSync(join(GAME, 'Application.def'))));
  const app = defs.find((d) => d.props.get('TYPE') === 'APPLICATION');
  assert.equal(app?.name, 'UFO');
  assert.equal(app?.props.get('STARTWITH'), 'PRZYGODA');
});

test('every CNV decodes to printable text with OBJECT entries', { skip: !haveGame }, () => {
  for (const f of ext('.cnv')) {
    const text = decodeText(readFileSync(f));
    assert.ok(!/[\x00-\x08\x0e-\x1f]/.test(text), `control characters in ${f}`);
    if (text.trim()) assert.ok(parseDefinitions(text).length > 0, `no objects in ${f}`);
  }
});

test('every SEQ parses to a tree', { skip: !haveGame }, () => {
  for (const f of ext('.seq')) {
    const root = parseSeq(decodeText(readFileSync(f)));
    assert.ok(root, `no root in ${f}`);
  }
});

test('every IMG decodes to the declared size', { skip: !haveGame }, () => {
  for (const f of ext('.img')) {
    const img = decodeImg(new Uint8Array(readFileSync(f)));
    assert.equal(img.rgba.length, img.width * img.height * 4, f);
  }
});

test('every ANN parses to EOF and its images decode', { skip: !haveGame }, async () => {
  const { parseAnn, decodeAnnImage } = await import('../src/formats/ann.ts');
  let images = 0;
  for (const f of ext('.ann')) {
    const buf = new Uint8Array(readFileSync(f));
    const ann = parseAnn(buf);
    const last = ann.images.at(-1);
    if (last) assert.equal(last.alphaOffset + last.alphaSize, buf.length, `trailing bytes in ${f}`);
    for (const img of ann.images) {
      if (!img.width || !img.height) continue;
      assert.equal(decodeAnnImage(buf, img).length, img.width * img.height * 4, f);
      images++;
    }
  }
  assert.ok(images > 9000, `only ${images} images`);
});

test('SEQEVENT values use the engine character mapping', async () => {
  const { seqEventIndex } = await import('../src/formats/cnv.ts');
  assert.deepEqual(['1', '9', 'A', 'L', 'R'].map(seqEventIndex), [1, 9, 10, 21, 27]);
});
