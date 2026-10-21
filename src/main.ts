import { FileListFS, HttpFS, PathResolver, type GameFS } from './engine/fs.ts';
import { Project } from './engine/project.ts';
import { Renderer, makeSprite } from './engine/renderer.ts';
import { decodeImg } from './formats/img.ts';

const boot = document.getElementById('boot') as HTMLDivElement;
const status = document.getElementById('status') as HTMLDivElement;
const picker = document.getElementById('picker') as HTMLInputElement;
const canvas = document.getElementById('screen') as HTMLCanvasElement;

function looksLikeInstall(fs: GameFS): boolean {
  return fs.has('DANE/Application.def');
}

async function start(fs: GameFS): Promise<void> {
  if (!looksLikeInstall(fs)) {
    status.textContent = 'To nie jest folder gry — brakuje DANE/Application.def.';
    return;
  }
  boot.hidden = true;
  const resolver = new PathResolver(fs);
  const project = await Project.load(resolver);
  const episode = project.episodes.get(project.startEpisode)!;
  const scene = project.scenes.get(new URLSearchParams(location.search).get('scene')?.toUpperCase() ?? episode.startWith)!;
  resolver.setSearchDirs([Project.dir(scene.path), Project.dir(episode.path), Project.dir(project.appPath)]);

  const renderer = new Renderer(canvas);
  const bg = scene.background && resolver.resolve(scene.background);
  if (bg) {
    const img = decodeImg(await fs.read(bg));
    renderer.background = makeSprite(img.width, img.height, img.rgba);
  }
  renderer.render();
  console.info(`Scene ${scene.name}:`, await project.loadObjects(resolver, scene.path, scene.name));
}

picker.addEventListener('change', () => {
  if (picker.files?.length) void start(new FileListFS(picker.files));
});

// Dev server exposes a local install at /game/.
HttpFS.open('./game')
  .then(start)
  .catch(() => {
    status.textContent = '';
  });
