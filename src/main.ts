import { Engine } from './engine/engine.ts';
import { FileListFS, HttpFS, type GameFS } from './engine/fs.ts';

const boot = document.getElementById('boot') as HTMLDivElement;
const status = document.getElementById('status') as HTMLDivElement;
const picker = document.getElementById('picker') as HTMLInputElement;
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const pickLabel = document.getElementById('pick') as HTMLLabelElement;
const playButton = document.getElementById('play') as HTMLButtonElement;
const query = new URLSearchParams(location.search);

/** Browsers only start audio after a user gesture, so wait for a click. */
function waitForPlay(): Promise<void> {
  if (query.has('autostart')) return Promise.resolve();
  pickLabel.hidden = true;
  playButton.hidden = false;
  status.textContent = '';
  return new Promise((resolve) => playButton.addEventListener('click', () => resolve(), { once: true }));
}

async function start(fs: GameFS): Promise<void> {
  if (!fs.has('DANE/Application.def')) {
    status.textContent = 'To nie jest folder gry — brakuje DANE/Application.def.';
    return;
  }
  await waitForPlay();
  boot.hidden = true;
  const engine = new Engine(fs, canvas);
  engine.audio.resume();
  (window as unknown as { engine: Engine }).engine = engine;
  engine.trace = query.has('trace');
  const scene = query.get('scene')?.toUpperCase();
  await engine.start(scene);
}

picker.addEventListener('change', () => {
  if (picker.files?.length) void start(new FileListFS(picker.files));
});

// The dev server exposes a local install at /game/.
HttpFS.open('./game')
  .then(start)
  .catch(() => {
    status.textContent = '';
  });
