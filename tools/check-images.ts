// Decode every IMG under the game data dir; optionally dump some to PNG.
// usage: node tools/check-images.ts <DANE dir> [outDir] [nameFilter]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decodeImg } from '../src/formats/img.ts';
import { encodePng } from './png.ts';

const [root, outDir, filter] = process.argv.slice(2);
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

let ok = 0;
const failures: string[] = [];
if (outDir) mkdirSync(outDir, { recursive: true });
for (const p of walk(root).filter((f) => f.toLowerCase().endsWith('.img'))) {
  try {
    const img = decodeImg(new Uint8Array(readFileSync(p)));
    ok++;
    if (outDir && filter && p.toLowerCase().includes(filter.toLowerCase())) {
      writeFileSync(join(outDir, basename(p) + '.png'), encodePng(img.width, img.height, img.rgba));
    }
  } catch (e) {
    failures.push(`${p}: ${(e as Error).message}`);
  }
}
console.log(`decoded ${ok}, failed ${failures.length}`);
for (const f of failures.slice(0, 10)) console.log(f);
