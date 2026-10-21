import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Dev-only: serve a local game install at /game/ (with a generated manifest),
// so the port can boot straight into the game without the folder picker.
// Point REKSIO_GAME_DIR at the "Reksio i UFO" install, or symlink it to ./game.
const gameDir = resolve(process.env.REKSIO_GAME_DIR ?? 'game');

function serveGame(): Plugin {
  let manifest: string | null = null;
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : [relative(gameDir, p).split(sep).join('/')];
    });
  const middleware = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/manifest.json') {
      manifest ??= JSON.stringify(walk(gameDir));
      res.setHeader('Content-Type', 'application/json');
      res.end(manifest);
      return;
    }
    const file = resolve(join(gameDir, url));
    if (!file.startsWith(gameDir + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Length', statSync(file).size);
    createReadStream(file).pipe(res);
  };
  return {
    name: 'serve-game',
    configureServer(server) {
      if (existsSync(gameDir)) server.middlewares.use('/game', middleware);
    },
    // `vite preview` serves the production build plus the install, for long
    // play-testing sessions that must not be reset by dev-server reloads.
    configurePreviewServer(server) {
      if (existsSync(gameDir)) server.middlewares.use('/game', middleware);
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  plugins: [serveGame()],
});
