import { Engine } from './engine/engine.ts';
import { FileListFS, HttpFS, type GameFS } from './engine/fs.ts';
import * as offline from './offline.ts';

const boot = document.getElementById('boot') as HTMLDivElement;
const status = document.getElementById('status') as HTMLDivElement;
const picker = document.getElementById('picker') as HTMLInputElement;
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const playButton = document.getElementById('play') as HTMLButtonElement;
const offlineButton = document.getElementById('offline') as HTMLButtonElement;
const installButton = document.getElementById('install') as HTMLButtonElement;
const progress = document.getElementById('dl') as HTMLProgressElement;
const installHint = document.getElementById('install-hint') as HTMLDivElement;
const query = new URLSearchParams(location.search);

/** Browsers only start audio after a user gesture, so wait for a click. */
function waitForPlay(): Promise<void> {
  if (query.has('autostart')) return Promise.resolve();
  // The folder picker stays available: a server-side install is offered as
  // "Graj", but players can still point at their own copy.
  playButton.hidden = false;
  return new Promise((resolve) => playButton.addEventListener('click', () => resolve(), { once: true }));
}

/** Each start() supersedes the previous one (e.g. picking a folder while the
 * server install is still waiting for "Graj"). */
let startGeneration = 0;

async function start(fs: GameFS): Promise<void> {
  const generation = ++startGeneration;
  if (!fs.has('DANE/Application.def')) {
    status.textContent = 'To nie jest folder gry — brakuje DANE/Application.def.';
    return;
  }
  await waitForPlay();
  if (generation !== startGeneration) return; // another choice won
  boot.hidden = true;
  const engine = new Engine(fs, canvas);
  engine.audio.resume();
  (window as unknown as { engine: Engine }).engine = engine;
  engine.trace = query.has('trace');
  engine.classic = query.has('classic');
  // Test fast-forward: game clock and audio run N times faster.
  engine.audio.speed = Math.max(1, Math.min(16, Number(query.get('speed')) || 1));
  const scene = query.get('scene')?.toUpperCase();
  await engine.start(scene);
}

picker.addEventListener('change', () => {
  if (picker.files?.length) void start(new FileListFS(picker.files));
});

// --- install as an app (PWA) -------------------------------------------------

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const standalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

let installPrompt: InstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as InstallPromptEvent;
  installButton.hidden = standalone();
});

installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installButton.hidden = true;
  await installPrompt.prompt().catch(() => undefined);
  installPrompt = null;
});

window.addEventListener('appinstalled', () => {
  installButton.hidden = true;
  installHint.hidden = true;
  status.textContent = 'Gra została zainstalowana.';
});

// Only Chromium fires beforeinstallprompt: Safari and Firefox install from
// their own menus (Firefox desktop cannot install web apps at all), so show
// browser-appropriate instructions instead of a button that never appears.
const ua = navigator.userAgent;
const isFirefox = /firefox|fxios/i.test(ua);
const isAndroid = /android/i.test(ua);
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isSafariDesktop = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|opr/i.test(ua) && !isIOS;

const hint =
  standalone() ? null
  : isIOS ? 'Aby zainstalować: Udostępnij → „Dodaj do ekranu początkowego”. Potem otwórz apkę i pobierz grę, by działała bez internetu.'
  : isFirefox && isAndroid ? 'Aby zainstalować: menu ⋮ → „Zainstaluj” (Dodaj do ekranu głównego).'
  : isFirefox ? 'Firefox na komputerze nie obsługuje instalowania aplikacji internetowych — użyj Chrome, Edge lub Safari.'
  : isSafariDesktop ? 'Aby zainstalować: w Safari 17+ menu Plik → „Dodaj do Docku”.'
  : null;
if (hint) {
  installHint.textContent = hint;
  installHint.hidden = false;
}

// iOS has no folder picker (<input webkitdirectory> is unsupported), so hide
// it there: the served install or the offline download are the ways to play.
if (isIOS || !('webkitdirectory' in document.createElement('input'))) {
  (document.getElementById('pick') as HTMLLabelElement).hidden = true;
}

// --- offline copy of the game ------------------------------------------------

const supported = offline.supported() && import.meta.env.PROD;
let offlineFs: HttpFS | null = null;
let downloadAbort: AbortController | null = null;

if (supported) {
  offline.registerServiceWorker();
  // A service worker only takes control after it activates, so the first visit
  // is not cached by it. Cache the app shell explicitly: an installed app (iOS
  // "Add to Home Screen", desktop installs) then opens without a network.
  void offline.precacheShell().catch(() => undefined);
}

const mb = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)} MB`;

async function refreshOffline(note = ''): Promise<void> {
  if (!offlineFs || downloadAbort) return;
  if (await offline.installed()) {
    offlineButton.textContent = 'Usuń pobraną grę';
    status.textContent = note || 'Gra jest pobrana — działa też bez internetu.';
  } else {
    offlineButton.textContent = 'Pobierz grę i graj offline';
    status.textContent = note;
  }
  offlineButton.hidden = false;
}

function setupOffline(fs: HttpFS): void {
  offlineFs = fs;
  if (!supported) {
    // Don't hide the feature silently: the dev server (and browsers without
    // service workers) cannot offer it.
    status.textContent = import.meta.env.PROD
      ? 'Ta przeglądarka nie obsługuje pobierania gry offline.'
      : 'Ta wersja strony działa w trybie deweloperskim — pobieranie gry offline jest dostępne tylko w wersji produkcyjnej (npm run build).';
    return;
  }
  void refreshOffline();
}

offlineButton.addEventListener('click', async () => {
  if (!offlineFs) return;
  if (downloadAbort) {
    downloadAbort.abort();
    return;
  }
  if (await offline.installed()) {
    await offline.remove();
    await refreshOffline();
    return;
  }

  let note = '';
  downloadAbort = new AbortController();
  offlineButton.textContent = 'Anuluj pobieranie';
  progress.hidden = false;
  progress.value = 0;
  status.textContent = 'Przygotowanie…';
  try {
    await offline.precacheShell();
    await offline.download(
      offlineFs,
      (p) => {
        progress.value = (p.done / p.total) * 100;
        status.textContent = `Pobieranie… ${p.done}/${p.total} plików (${mb(p.bytes)})`;
      },
      downloadAbort.signal,
    );
    void navigator.storage?.persist?.();
  } catch (e) {
    const err = e as Error;
    note = err.name === 'AbortError' ? 'Pobieranie przerwane — możesz je dokończyć później.' : `Błąd pobierania: ${err.message}`;
  } finally {
    downloadAbort = null;
    progress.hidden = true;
    await refreshOffline(note);
  }
});

// The install may be served at ./game/ (a manifest.json next to the files);
// without it, players pick their own folder — and on iOS, where no folder
// picker exists, nothing can be played.
HttpFS.open('./game')
  .then((fs) => {
    setupOffline(fs);
    return start(fs);
  })
  .catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('must be a JSON array')) {
      status.textContent = 'Błąd: /game/manifest.json ma zły format — powinna to być lista plików gry (tablica JSON).';
      console.error(message);
      return;
    }
    status.textContent = '';
    console.info('No install served at ./game — folder-picker mode.', message);
  });
