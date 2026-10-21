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
game. The original scripts run unchanged. The only gameplay changes are the
Alien Invaders tweaks in `src/mods.ts`; `?classic=1` restores the original
balance. The exact changes and constants are in the
[Alien Invaders spec](.ai/specs/implemented/2026-10-21-alien-invaders-tweaks.md).

Debug and test parameters (`?scene`, `?trace`, `?speed`) are documented in the
[playthrough testing spec](.ai/specs/implemented/2026-10-21-playthrough-testing.md).

## Building and hosting

`npm run build` produces a static site in `dist/`. Deployed without `/game/`,
it shows the folder picker; served with the install at `/game/` it can also
offer the offline download. `npm run preview` serves the build together with
the install.

For static hosting, run `npm run game-manifest -- <install>` so the app can
find the game files; the dev and preview servers do this on the fly. The full
delivery contract is in the
[static and offline delivery spec](.ai/specs/implemented/2026-10-21-static-and-offline-delivery.md).

Saves from the original game carry over on the first run, and progress stays
in the browser.

## Offline and installing

The site can be installed as an app and plays offline. Chrome/Edge show an
install button, Safari and Firefox use their own menus (desktop Firefox cannot
install web apps), and iOS uses the served install or the offline download
because it has no folder picker.

With the install served at `/game/`, *Pobierz grę i graj offline* copies every
game file into the browser's offline cache; the button then becomes *Usuń
pobraną grę*. Offline support is production-only, so the dev server stays
untouched.

## Documentation

- [Architecture decisions](.ai/adr/README.md) — decisions and the port quality gates future changes must keep true.
- [Specs](.ai/specs/README.md) — implemented features, validation evidence and open work.
- [Engine semantics](docs/script-semantics.md), [object semantics](docs/object-semantics.md), [filters and fonts](docs/filters-fonts.md), [MATRIX](docs/matrix.md) — behaviour recovered from the DLLs, with addresses and observed/inferred markers.
- [Playthrough testing](docs/playthrough/README.md) — headless sessions and chapter walkthroughs.
- [`tools/annformat.md`](tools/annformat.md) — ANN byte layout.
- [`AGENTS.md`](AGENTS.md) — mandatory entry point for automated agents.

## Tests

```sh
npm test          # decoders (set REKSIO_DATA to DANE/), interpreter, filters/fonts and MATRIX tests
npm run typecheck
```

## Status

The port boots and plays the original data. Headless playthroughs cover the
intro, menus, dialogue and the main minigames; chapters 1–5, 7 and 8 are
recorded.
Chapter 6 and a fresh start-to-finish run remain, tracked in the
[playthrough spec](.ai/specs/2026-10-21-complete-playthrough.md).

Known gap: `ARIAL14.FNT` is not shipped with this install, so text uses a
canvas fallback. Coverage counts, implementation details and validation
evidence are in the
[engine port spec](.ai/specs/implemented/2026-10-21-engine-port.md).
