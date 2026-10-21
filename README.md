# Reksio i UFO — web port

A browser reimplementation of the Piklib engine (PIKLIB8.dll) that runs the
original *Reksio i UFO* (AidemMedia, 2004) game data unchanged.

No game files are included. Players pick their own install folder (the one
containing `DANE` and `Wavs`), and the files are read locally in the browser.

Done using [rea](https://github.com/morluto/rea)

## Running

```sh
npm install
REKSIO_GAME_DIR="/path/to/Reksio i UFO" npm run dev   # or symlink the install to ./game
```

The dev server serves the install at `/game/` and boots straight into the
game. Useful query parameters:

- `?scene=MENUGLOWNE` — start at a given scene (names from `DANE/Application.def`)
- `?trace=1` — log every fired event handler to the console
- `?classic=1` — play the original balance (skip the gameplay tweaks below)

The scripts are the original ones; a few documented gameplay tweaks live in
`src/mods.ts`, all in Alien Invaders: a 0.2 s re-throw cooldown with up to 8
beetroots in flight at once (each throw takes a free clone of `ANIMOBURAK`
instead of restarting the one beetroot), throws only when clicking near Reksio
(clicking away just walks him there — handy on touch screens), and a "POMIŃ"
skip button on the right for the first 5 seconds. `?classic=1` turns them off;
each tweak's constants (cooldown, pool size, tap radius, skip time) sit next
to its code.

`npm run build` produces a static site in `dist/`. Deployed without `/game/`,
it shows the folder picker; served with the install at `/game/` it can also offer the offline download described below.
`npm run preview` serves the build together with the install, handy for
testing that flow locally.
For static hosting, `npm run game-manifest -- <install>` writes the
`manifest.json` (a JSON array of the install's file paths) next to the game
files — the dev and preview servers generate it on the fly.

Progress is saved in `localStorage`. On the first run, the install's `Ufo.ini`
is imported, so saves from the original game carry over.

## Offline & installing

A service worker (`public/sw.js`) plus a web app manifest
(`public/manifest.webmanifest`, icons in `public/icons/`) make the site:

- **installable** — Chrome/Edge show a "Zainstaluj aplikację" button (driven
  by `beforeinstallprompt`). Safari and Firefox never fire that event, so the
  boot panel shows a matching instruction instead: Share → "Add to Home
  Screen" (iOS), File → "Add to Dock" (Safari 17+), menu → "Install"
  (Firefox Android); Firefox desktop cannot install web apps at all;
- **playable offline** — with the install served at `/game/`, the boot panel
  offers *Pobierz grę i graj offline*: every game file (plus the app shell)
  is copied into Cache Storage, after which the site boots and plays with no
  network at all. The button turns into *Usuń pobraną grę* once it is done.
  The app shell alone is cached on the first online visit, so an installed
  app always opens offline; the game itself then comes from the download.
  iOS has no folder picker (`webkitdirectory`), so the boot panel hides it
  and points at „Graj” / the offline download instead.

Offline support is production-only: the dev server stays untouched (no
service worker, no stale caches).

## Layout

| Path | What |
|---|---|
| `src/formats/` | Decoders: CNV cipher and definitions, SEQ, PIK images, NVP animations, LZO1X, RLE, legacy LZW |
| `src/script/` | String-based script interpreter ported from the engine's own algorithms |
| `src/engine/` | Runtime: containers, signals, variables, behaviours, ANIMO/IMAGE/SOUND/BUTTON/SEQUENCE, input, main loop |
| `src/offline.ts` | "Download the game" for offline play (Cache Storage; used with `public/sw.js`) |
| `public/` | Web app manifest, service worker and icons (the icon set is scaled from `ReksioUfo.exe`'s own icon by `tools/make-icons.ts`) |
| `docs/` | Semantics recovered from PIKLIB8.dll with REA, with procedure addresses and observed/inferred markers |
| `tools/annformat.md` | ANN byte layout |
| `tools/drive.ts` | Headless Chrome driver (click/key/screenshot) for testing |
| `tools/game-manifest.ts` | Writes the file-list manifest for a statically served install (`npm run game-manifest`) |
| `tools/sweep.sh` | Load every scene and collect warnings plus screenshots |
| `tools/fuzz.ts` | Click every active hotspot in every scene; report warnings, exceptions, transitions |
| `docs/matrix.md`, `docs/filters-fonts.md` | MATRIX (Matrix.dll), rotation/fade filters, FNT fonts |

## Tests

```sh
npm test          # format decoders against the real data (set REKSIO_DATA to DANE/), interpreter semantics
npm run typecheck
```

## Status

- All 102 encrypted scripts, 707 images and 805 animations decode.
- All 90 scenes load and render.
- Play-tested headlessly with `tools/drive.ts` / `tools/fuzz.ts`:
  - the intro and main menu;
  - chapter selection into gameplay;
  - dialogue with lip-sync;
  - Space Invaders, Pac-Man, the car choice → race (with sprite rotation),
    and the digging game (`MATRIX`, from the Matrix.dll plug-in).
- Engine semantics are taken from the DLLs, with addresses, in `docs/`.
  Remaining inferences are marked there.
- Known gaps:
  - `ARIAL14.FNT`, named by the TEXT/FONT objects, is not part of this
    install, so text uses a canvas font.
  - Full start-to-finish playthroughs have not been done yet.
