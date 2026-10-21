// Persistent headless-Chrome session for step-by-step play testing.
//
//   node tools/session.ts serve <port> <gameUrl>      # start the daemon (keep running)
//   node tools/session.ts <port> <step...>             # send steps, print results
//
// Steps (same as drive.ts, plus a few for play testing):
//   wait:<ms>  click:<x>,<y>  move:<x>,<y>  key:<Key>  hold:<Key>,<ms>
//   shot:<path.png>  eval:<js>  goto:<query>   (e.g. goto:scene=MENUGLOWNE&speed=4)
//   hotspots          list active hotspots with click points
//   clickname:<NAME>  click the named hotspot
//   waitscene:<NAME>[,<ms>]  wait until that scene is active (default 60s)
//   state             current scene + hotspots
// Console output produced since the previous command is printed first.

import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { Browser, sleep } from './cdp.ts';

type Hotspot = { name: string; x: number; y: number };

async function serve(port: number, gameUrl: string): Promise<void> {
  const browser = await Browser.launch();
  let buffered: string[] = [];
  browser.onConsole = (l) => {
    if (!/\[signal\]/.test(l.text) || buffered.length < 400) buffered.push(`[${l.type}] ${l.text}`);
  };

  const hotspots = () => browser.eval<Hotspot[]>('window.engine ? window.engine.debugHotspots() : []');
  const scene = () => browser.eval<string | null>('window.engine?.currentScene ?? null');

  async function run(step: string): Promise<string> {
    const [kind, arg = ''] = step.split(/:(.*)/s);
    const [x, y] = arg.split(',').map(Number);
    switch (kind) {
      case 'wait':
        await sleep(Number(arg));
        return '';
      case 'click':
        await browser.click(x, y);
        return '';
      case 'move':
        await browser.move(x, y);
        return '';
      case 'key':
        await browser.key(arg);
        return '';
      case 'hold': {
        const [k, ms] = arg.split(',');
        const key = k === 'Space' ? ' ' : k;
        await browser.keyDown(key);
        await sleep(Number(ms));
        await browser.keyUp(key);
        return '';
      }
      case 'shot':
        writeFileSync(arg, await browser.screenshot());
        return `shot ${arg}`;
      case 'eval':
        return `eval ${JSON.stringify(await browser.eval(arg))}`;
      case 'goto':
        await browser.goto(`${gameUrl}?${arg}`);
        return `goto ${arg}`;
      case 'hotspots':
        return `hotspots ${JSON.stringify(await hotspots())}`;
      case 'clickname': {
        const h = (await hotspots()).find((hs) => hs.name === arg.toUpperCase());
        if (!h) return `clickname ${arg}: NOT ACTIVE`;
        await browser.click(h.x, h.y);
        return `clicked ${h.name} at ${h.x},${h.y}`;
      }
      case 'waitscene': {
        const [name, ms = '60000'] = arg.split(',');
        const end = Date.now() + Number(ms);
        while (Date.now() < end) {
          if ((await scene()) === name.toUpperCase()) return `scene ${name}`;
          await sleep(250);
        }
        return `waitscene ${name}: TIMEOUT (now ${await scene()})`;
      }
      case 'state':
        return `state ${JSON.stringify({ scene: await scene(), hotspots: await hotspots() })}`;
      default:
        return `unknown step ${step}`;
    }
  }

  createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const steps = JSON.parse(body || '[]') as string[];
      const out: string[] = [];
      try {
        for (const s of steps) {
          const r = await run(s);
          out.push(...buffered.splice(0), ...(r ? [r] : []));
        }
      } catch (e) {
        out.push(`error ${(e as Error).message}`);
      }
      out.push(...buffered.splice(0));
      res.end(out.join('\n'));
    });
  }).listen(port, '127.0.0.1', () => console.log(`session on ${port}`));
}

const [first, ...rest] = process.argv.slice(2);
if (first === 'serve') {
  await serve(Number(rest[0]), rest[1] ?? 'http://127.0.0.1:5174/');
} else {
  const res = await fetch(`http://127.0.0.1:${first}/`, { method: 'POST', body: JSON.stringify(rest) });
  console.log(await res.text());
}
