import { Engine } from './engine/engine.ts';
import { FileListFS, HttpFS, type GameFS } from './engine/fs.ts';

const boot = document.getElementById('boot') as HTMLDivElement;
const status = document.getElementById('status') as HTMLDivElement;
const picker = document.getElementById('picker') as HTMLInputElement;
const canvas = document.getElementById('screen') as HTMLCanvasElement;

async function start(fs: GameFS): Promise<void> {
  if (!fs.has('DANE/Application.def')) {
    status.textContent = 'To nie jest folder gry — brakuje DANE/Application.def.';
    return;
  }
  boot.hidden = true;
  const engine = new Engine(fs, canvas);
  (window as unknown as { engine: Engine }).engine = engine;
  const query = new URLSearchParams(location.search);
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
