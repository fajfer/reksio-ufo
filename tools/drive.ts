// Drive the running dev server in headless Chrome.
//
//   node tools/drive.ts <url> <outDir> [step...]
//
// Steps: wait:<ms>  click:<x>,<y>  move:<x>,<y>  key:<Key>  shot:<name>  eval:<js>
// Coordinates are in game pixels (800x600). Console output is printed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Browser, sleep } from './cdp.ts';

const [url, outDir, ...steps] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: node tools/drive.ts <url> <outDir> [wait:ms|click:x,y|move:x,y|key:K|shot:name|eval:js]...');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await Browser.launch();
browser.onConsole = (l) => console.log(`[${l.type}] ${l.text}`);
await browser.goto(url);

for (const step of steps) {
  const [kind, arg = ''] = step.split(/:(.*)/s);
  const [x, y] = arg.split(',').map(Number);
  if (kind === 'wait') await sleep(Number(arg));
  else if (kind === 'click') await browser.click(x, y);
  else if (kind === 'move') await browser.move(x, y);
  else if (kind === 'key') await browser.key(arg);
  else if (kind === 'eval') console.log(`[eval] ${JSON.stringify(await browser.eval(arg))}`);
  else if (kind === 'shot') {
    writeFileSync(join(outDir, `${arg}.png`), await browser.screenshot());
    console.log(`[shot] ${join(outDir, `${arg}.png`)}`);
  }
}
browser.close();
