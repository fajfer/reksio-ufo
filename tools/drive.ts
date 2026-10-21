// Drive the running dev server in headless Chrome over the DevTools protocol.
//
//   node tools/drive.ts <url> <outDir> [step...]
//
// Steps: wait:<ms>  click:<x>,<y>  key:<Key>  shot:<name>
// Coordinates are in game pixels (800x600). Console output is printed.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, outDir, ...steps] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: node tools/drive.ts <url> <outDir> [wait:ms|click:x,y|key:K|shot:name]...');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'reksio-chrome-'));
const chrome = spawn(
  process.env.CHROME ?? 'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=800,600',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function targetWs(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg.result);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ');
    if (!String(text).startsWith('[vite]')) console.log(`[${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    console.log(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  }
});
const send = (method: string, params: object = {}) =>
  new Promise<any>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });

// Map game coordinates to page coordinates through the canvas rect.
async function toPage(x: number, y: number): Promise<{ x: number; y: number }> {
  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(document.getElementById("screen").getBoundingClientRect())',
    returnByValue: true,
  });
  const b = JSON.parse(r.result.value);
  return { x: b.left + (x / 800) * b.width, y: b.top + (y / 600) * b.height };
}

for (const step of steps) {
  const [kind, arg = ''] = step.split(/:(.*)/s);
  if (kind === 'wait') await sleep(Number(arg));
  else if (kind === 'click' || kind === 'move') {
    const [gx, gy] = arg.split(',').map(Number);
    const p = await toPage(gx, gy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    if (kind === 'click') {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await sleep(60);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    }
  } else if (kind === 'key') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: arg });
    await sleep(60);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: arg });
  } else if (kind === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${arg}.png`), Buffer.from(r.data, 'base64'));
    console.log(`[shot] ${join(outDir, `${arg}.png`)}`);
  } else if (kind === 'eval') {
    const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true });
    console.log(`[eval] ${JSON.stringify(r.result?.value)}`);
  }
}

ws.close();
chrome.kill();
