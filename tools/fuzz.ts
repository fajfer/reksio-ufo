// Explore scenes by clicking every active hotspot, recording warnings,
// exceptions and scene transitions.
//
//   node tools/fuzz.ts <outDir> [--parallel N] [--clicks N] [SCENE...]
//
// Without scene names, every scene in Application.def is explored.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeText, parseDefinitions } from '../src/formats/cnv.ts';
import { Browser, sleep, type ConsoleLine } from './cdp.ts';

const args = process.argv.slice(2);
const outDir = args.shift();
if (!outDir) {
  console.error('usage: node tools/fuzz.ts <outDir> [--parallel N] [--clicks N] [SCENE...]');
  process.exit(1);
}
let parallel = 4;
let maxClicks = 30;
const scenes: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--parallel') parallel = Number(args[++i]);
  else if (args[i] === '--clicks') maxClicks = Number(args[++i]);
  else scenes.push(args[i].toUpperCase());
}
if (!scenes.length) {
  const defs = parseDefinitions(decodeText(readFileSync('game/DANE/Application.def')));
  scenes.push(...defs.filter((d) => d.props.get('TYPE') === 'SCENE').map((d) => d.name));
}
mkdirSync(outDir, { recursive: true });
const out: string = outDir;

interface Report {
  scene: string;
  loaded: boolean;
  clicked: string[];
  transitions: string[];
  problems: string[];
}

const BASE = process.env.REKSIO_URL ?? 'http://127.0.0.1:5173/';
const interesting = (l: ConsoleLine) => l.type === 'exception' || l.type === 'warning' || l.type === 'error';

async function waitForScene(b: Browser, timeoutMs: number): Promise<string | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await b.eval<string | null>('window.engine?.currentScene ?? null');
    if (s) return s;
    await sleep(250);
  }
  return null;
}

async function explore(scene: string): Promise<Report> {
  const report: Report = { scene, loaded: false, clicked: [], transitions: [], problems: [] };
  const b = await Browser.launch();
  try {
    b.onConsole = (l) => {
      if (interesting(l) && !/favicon|AudioContext/.test(l.text)) report.problems.push(`${l.type}: ${l.text}`);
    };
    await b.goto(`${BASE}?scene=${scene}`);
    const loaded = await waitForScene(b, 30000);
    report.loaded = loaded === scene;
    if (!report.loaded) return report;
    await sleep(2500);
    const tried = new Set<string>();
    let reloads = 0;
    for (let i = 0; i < maxClicks; i++) {
      const hs = (await b.eval<{ name: string; x: number; y: number }[]>('window.engine.debugHotspots()')) ?? [];
      const next = hs.find((h) => !tried.has(h.name));
      if (!next) break;
      tried.add(next.name);
      report.clicked.push(next.name);
      await b.click(next.x, next.y);
      await sleep(1800);
      const now = await waitForScene(b, 20000);
      if (now !== scene) {
        report.transitions.push(`${next.name} -> ${now}`);
        // Come back and keep exploring the remaining hotspots.
        if (++reloads > 6) break;
        await b.goto(`${BASE}?scene=${scene}`);
        if ((await waitForScene(b, 30000)) !== scene) break;
        await sleep(2500);
      }
    }
    writeFileSync(join(out, `${scene}.png`), await b.screenshot());
  } catch (e) {
    report.problems.push(`fuzzer: ${(e as Error).message}`);
  } finally {
    b.close();
  }
  return report;
}

const reports: Report[] = [];
const queue = [...scenes];
await Promise.all(
  Array.from({ length: parallel }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const r = await explore(s);
      reports.push(r);
      const flag = !r.loaded ? 'NOT LOADED' : r.problems.length ? `${r.problems.length} problems` : 'ok';
      console.log(`${s}: ${flag}; clicked ${r.clicked.length}${r.transitions.length ? `; ${r.transitions.join(', ')}` : ''}`);
    }
  }),
);
reports.sort((a, b) => a.scene.localeCompare(b.scene));
writeFileSync(join(out, 'report.json'), JSON.stringify(reports, null, 1));
