// Writes the game manifest — the JSON array of install-relative file paths —
// into a game directory, next to the game's own files. A static server then
// exposes it at /game/manifest.json, which is how the web port discovers a
// served install. (The dev and preview servers generate the same file on the
// fly; this script is for static deployments.)
//
//   npm run game-manifest                       # uses ./game or REKSIO_GAME_DIR
//   npm run game-manifest -- "/path/to/Reksio i UFO"

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dir = resolve(process.argv[2] ?? process.env.REKSIO_GAME_DIR ?? 'game');
if (!existsSync(dir)) {
  console.error(`not found: ${dir}`);
  process.exit(1);
}

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(dir, p).split(sep).join('/')];
  });

const files = walk(dir)
  .filter((f) => f !== 'manifest.json')
  .sort();

if (!files.some((f) => f.toLowerCase() === 'dane/application.def')) {
  console.error(`${dir} does not look like a Reksio i UFO install (no DANE/Application.def)`);
  process.exit(1);
}

writeFileSync(join(dir, 'manifest.json'), JSON.stringify(files));
console.log(`wrote ${join(dir, 'manifest.json')} (${files.length} files)`);
