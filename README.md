# Reksio i UFO — web port

A browser reimplementation of the Piklib engine (PIKLIB8.dll) that runs the
original *Reksio i UFO* (AidemMedia, 2004) game data unchanged.

No game files are included. Players pick their own install folder (the one
containing `DANE` and `Wavs`), and the files are read locally in the browser.

## Running

```sh
npm install
REKSIO_GAME_DIR="/path/to/Reksio i UFO" npm run dev   # or symlink the install to ./game
```

The dev server serves the install at `/game/` and boots straight into the
game. Useful query parameters:

- `?scene=MENUGLOWNE` — start at a given scene (names from `DANE/Application.def`)
- `?trace=1` — log every fired event handler to the console

`npm run build` produces a static site in `dist/`. Deployed without `/game/`,
it shows the folder picker.

Progress is saved in `localStorage`. On the first run, the install's `Ufo.ini`
is imported, so saves from the original game carry over.

## Layout

| Path | What |
|---|---|
| `src/formats/` | Decoders: CNV cipher and definitions, SEQ, PIK images, NVP animations, LZO1X, RLE, legacy LZW |
| `src/script/` | String-based script interpreter ported from the engine's own algorithms |
| `src/engine/` | Runtime: containers, signals, variables, behaviours, ANIMO/IMAGE/SOUND/BUTTON/SEQUENCE, input, main loop |
| `docs/` | Semantics recovered from PIKLIB8.dll with REA, with procedure addresses and observed/inferred markers |
| `tools/annformat.md` | ANN byte layout |
| `tools/drive.ts` | Headless Chrome driver (click/key/screenshot) for testing |
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
