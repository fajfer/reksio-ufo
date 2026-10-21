// Minimal headless-Chrome controller over the DevTools protocol.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ConsoleLine {
  type: string;
  text: string;
}

export class Browser {
  private chrome: ChildProcess;
  private ws!: WebSocket;
  private profile: string;
  private nextId = 1;
  private pending = new Map<number, (v: any) => void>();
  readonly console: ConsoleLine[] = [];
  onConsole: ((l: ConsoleLine) => void) | null = null;

  private constructor(chrome: ChildProcess, profile: string) {
    this.chrome = chrome;
    this.profile = profile;
  }

  static async launch(): Promise<Browser> {
    const port = 9300 + Math.floor(Math.random() * 3000);
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
    const b = new Browser(chrome, profile);
    let wsUrl = '';
    for (let i = 0; i < 100 && !wsUrl; i++) {
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '';
      } catch {
        // not up yet
      }
      if (!wsUrl) await sleep(100);
    }
    if (!wsUrl) throw new Error('Chrome did not start');
    b.ws = new WebSocket(wsUrl);
    await new Promise((r) => b.ws.addEventListener('open', r, { once: true }));
    b.ws.addEventListener('message', (ev) => b.onMessage(JSON.parse(String(ev.data))));
    await b.send('Runtime.enable');
    await b.send('Page.enable');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
    return b;
  }

  private onMessage(msg: any): void {
    if (msg.id && this.pending.has(msg.id)) {
      this.pending.get(msg.id)!(msg.result ?? msg.error);
      this.pending.delete(msg.id);
      return;
    }
    let line: ConsoleLine | null = null;
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ');
      if (!String(text).startsWith('[vite]')) line = { type: msg.params.type, text: String(text) };
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      line = { type: 'exception', text: d.exception?.description ?? d.text };
    }
    if (line) {
      this.console.push(line);
      this.onConsole?.(line);
    }
  }

  send(method: string, params: object = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async goto(url: string): Promise<void> {
    await this.send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'autostart' });
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r?.result?.value as T;
  }

  /** Game (800x600) coordinates to page coordinates. */
  private async toPage(x: number, y: number): Promise<{ x: number; y: number }> {
    const b = await this.eval<{ left: number; top: number; width: number; height: number }>(
      'JSON.parse(JSON.stringify(document.getElementById("screen").getBoundingClientRect()))',
    );
    return { x: b.left + (x / 800) * b.width, y: b.top + (y / 600) * b.height };
  }

  async move(x: number, y: number): Promise<void> {
    const p = await this.toPage(x, y);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  }

  async click(x: number, y: number): Promise<void> {
    const p = await this.toPage(x, y);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }

  async keyDown(key: string): Promise<void> {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === ' ' ? 'Space' : key });
  }

  async keyUp(key: string): Promise<void> {
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === ' ' ? 'Space' : key });
  }

  async key(key: string): Promise<void> {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
    await sleep(60);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
  }

  async screenshot(): Promise<Buffer> {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(r.data, 'base64');
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
    this.chrome.kill();
    setTimeout(() => rmSync(this.profile, { recursive: true, force: true }), 1000);
  }
}
