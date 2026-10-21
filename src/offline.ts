// Play offline: copy the served game install (./game/...) into Cache Storage
// and keep a completion marker. public/sw.js answers those requests from the
// cache when the network is gone. Cache names are shared with sw.js.

import type { HttpFS } from './engine/fs.ts';

export const GAME_CACHE = 'reksio-game';
export const SHELL_CACHE = 'reksio-shell-v1';
/** Marker URL: present in the game cache once a full download has finished. */
const MARKER = '__reksio_offline__';

export function supported(): boolean {
  return 'serviceWorker' in navigator && 'caches' in window;
}

/** Install the service worker (PWA install + offline serving). */
export function registerServiceWorker(): void {
  void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

const markerUrl = (): string => new URL(MARKER, document.baseURI).href;

/** Is a complete offline copy already stored? */
export async function installed(): Promise<boolean> {
  if (!supported()) return false;
  try {
    return !!(await caches.match(markerUrl()));
  } catch {
    return false;
  }
}

/** Forget the downloaded game (the app shell stays cached). */
export async function remove(): Promise<void> {
  await caches.delete(GAME_CACHE);
}

/**
 * Cache the app shell (index.html plus the scripts/styles it references) so a
 * cold start works with no network at all.
 */
export async function precacheShell(): Promise<void> {
  const cache = await caches.open(SHELL_CACHE);
  const urls = new Set<string>([new URL('index.html', document.baseURI).href]);
  for (const el of document.querySelectorAll('script[src], link[href]')) {
    const raw = el.getAttribute('src') ?? el.getAttribute('href') ?? '';
    if (!raw) continue;
    const u = new URL(raw, document.baseURI);
    if (u.origin === location.origin) urls.add(u.href);
  }
  await Promise.allSettled(
    [...urls].map(async (u) => {
      const req = new Request(u);
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res);
    }),
  );
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
}

/**
 * Download every file of the served install. Already-cached files are skipped,
 * so an interrupted download resumes on the next click.
 */
export async function download(
  fs: HttpFS,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const paths = fs.paths();
  const cache = await caches.open(GAME_CACHE);
  const total = paths.length;
  const queue = paths.slice();
  const next = (): string | undefined => queue.shift();
  let done = 0;
  let bytes = 0;
  let failure: unknown = null;

  const worker = async (): Promise<void> => {
    for (let path = next(); path !== undefined && !failure; path = next()) {
      try {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const url = await fs.url(path);
        const req = new Request(url);
        if (!(await cache.match(req))) {
          const res = await fetch(req, { signal });
          if (!res.ok) throw new Error(`${res.status} ${url}`);
          bytes += Number(res.headers.get('content-length') ?? 0);
          await cache.put(req, res);
        }
        onProgress({ done: ++done, total, bytes });
      } catch (e) {
        failure = e;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (failure) throw failure;

  // The manifest is what boots offline: it is not part of its own file list.
  const manifest = new Request(new URL('game/manifest.json', document.baseURI).href);
  const res = await fetch(manifest, { signal });
  if (!res.ok) throw new Error(`manifest.json: ${res.status}`);
  await cache.put(manifest, res);
  await cache.put(markerUrl(), new Response(String(total)));
}
