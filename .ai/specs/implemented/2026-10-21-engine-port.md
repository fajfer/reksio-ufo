# Browser engine port (PIKLIB8)

- **Status:** implemented
- **Date:** 2026-10-21
- **Issue:** none

## Goal

Run an original *Reksio i UFO* install in the browser without converting its data: decode the shipped CNV/DEF/SEQ, PIK/IMG, ANN/NVP, FNT, LZO1X, RLE and legacy LZW files; execute the original string scripts with the engine's own semantics; and provide the object model, scene lifecycle, rendering, input, audio and saves needed to play all 90 scenes.

## Non-goals

- Rewriting, normalizing or re-encoding game data or scripts (ADR-001, ADR-004).
- Reimplementing the original installer, launcher or Windows-specific shell.
- A clean-room scripting language or a "better" grammar for the shipped scripts.
- Multiplayer, networking or a server-side game loop.
- A complete start-to-finish playthrough; that is tracked by [the playthrough spec](../2026-10-21-complete-playthrough.md).

## Scope

`src/formats/`, `src/script/`, `src/engine/`, `src/main.ts`, `docs/`, `test/`, and the debugging parts of `tools/`.

## Load

- [root AGENTS.md](../../../AGENTS.md)
- [ADR-001](../../adr/ADR-001-port-the-engine-not-the-game.md), [ADR-002](../../adr/ADR-002-runtime-decoding-of-original-formats.md), [ADR-003](../../adr/ADR-003-evidence-based-engine-semantics.md), [ADR-004](../../adr/ADR-004-preserve-original-algorithms-and-quirks.md), [ADR-005](../../adr/ADR-005-data-driven-object-model.md), [ADR-006](../../adr/ADR-006-layered-pure-core-architecture.md), [ADR-007](../../adr/ADR-007-case-insensitive-virtual-filesystem.md), [ADR-010](../../adr/ADR-010-fixed-resolution-rendering-contract.md), [ADR-011](../../adr/ADR-011-fail-soft-runtime.md), [ADR-012](../../adr/ADR-012-save-compatibility.md), [ADR-017](../../adr/ADR-017-explicit-platform-deviations.md)
- [`docs/script-semantics.md`](../../../docs/script-semantics.md), [`docs/object-semantics.md`](../../../docs/object-semantics.md), [`docs/filters-fonts.md`](../../../docs/filters-fonts.md), [`docs/matrix.md`](../../../docs/matrix.md), [`tools/annformat.md`](../../../tools/annformat.md)
- [`src/engine/engine.ts`](../../../src/engine/engine.ts), [`src/engine/project.ts`](../../../src/engine/project.ts), [`src/engine/fs.ts`](../../../src/engine/fs.ts), [`src/script/interpreter.ts`](../../../src/script/interpreter.ts), [`src/formats/cnv.ts`](../../../src/formats/cnv.ts)

## ADRs affected

ADR-001 through ADR-007, ADR-010 through ADR-012 and ADR-017 are retroactive records of this port.

## Design

### Project layout

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

### Runtime shape

- **Formats** are pure byte-to-data decoders. They consume the original files to EOF and keep the observed quirks (CNV cipher offsets, `<E>` line breaks, the legacy LZW container used by one animation).
- **Interpreter** splits statements on `;` at parenthesis depth, deletes spaces, substitutes `$1..$9` textually, splits arguments on `,` without quote awareness and evaluates arithmetic strictly left to right. `BREAK` / `ONE_BREAK` propagate as in `CMC_Behaviour`.
- **Objects** are created from `ObjectDef` entries through the `FACTORY` map. Containers run application → episode → scene; lookup strips a `_n` clone suffix and falls back to the parent. Built-ins `RANDOM` and `CNVLOADER` exist per scene.
- **Scene lifecycle** follows `CMC_Scene::initialize`: create objects, load resources, run `init()`, run `__INIT__`, then signal the scene's `ONINIT`.
- **Rendering** is a fixed 800×600 Canvas2D surface, sorted by `PRIORITY` then creation order, with alpha-based hit testing.
- **Audio** is WebAudio over the original WAVs, gated behind a click, with per-file native sample rates and decoded-buffer release on scene change.
- **Saves** use `localStorage` under `reksio-ufo`; the original `Ufo.ini` is imported once when no save exists, and `TOINI` variables write on change.
- **Errors** in content are non-fatal: unknown types, missing files and bad handlers warn once and the scene continues.

## Tasks

| # | Task | Load | Done when | Status | Commit |
|---|---|---|---|---|---|
| 1 | Decode CNV/DEF/SEQ, PIK/IMG, ANN/NVP, LZO1X, RLE and legacy LZW | `src/formats/` | every shipped file of each type decodes to EOF; decoder tests pass | done | `3b75095`, `53468a4` |
| 2 | Add the case-insensitive VFS, project hierarchy and path resolver | `src/engine/fs.ts`, `project.ts` | boot from `DANE/Application.def`; mixed-case and backslash paths resolve | done | `91fa1e2`, `46d22f3` |
| 3 | Port the string interpreter and value semantics | `src/script/` | interpreter tests cover substitution, splitting, coercion and `BREAK` | done | `1d1a893` |
| 4 | Build the object model, containers, scene loop and input | `src/engine/` | all 90 scenes load; `ONINIT` / `__INIT__` order matches the DLL | done | `00c35f1` |
| 5 | Implement media, sequences, UI, filters, fonts and MATRIX | `src/engine/`, `src/formats/` | dialogue, minigames and filters run in headless playthroughs | done | `1781edf`, `14de034`, `eaefd19` |
| 6 | Preserve saves and import `Ufo.ini` | `src/engine/ini.ts`, `variables.ts` | a fresh profile imports the original save; progress survives reload | done | `00c35f1` |
| 7 | Fix the rendering and hit-test contract | `src/engine/renderer.ts`, `ui.ts`, `media.ts` | 800×600, priority order, `GETGRAPHICSAT` and button hit tests behave as documented | done | `00c35f1`, `90529c3` |
| 8 | Document the recovered semantics with evidence | `docs/` | every non-obvious claim cites a procedure and is marked observed or inferred | done | `356e731`, `d07aa6b`, `48bd306`, `71a5c7e` |
| 9 | Verify all scenes headlessly | `tools/sweep.sh`, `tools/fuzz.ts` | the sweep loads all scenes and the fuzzer reports transitions, warnings and exceptions | done | `a685591`, `48bd306`, `f05fa36` |

## Validation

`npm test`, `npm run typecheck`, `npm run build`; all 102 encrypted scripts, 707 images and 805 animations decode; `tools/sweep.sh` loads all 90 scenes; `tools/fuzz.ts` clicks every active hotspot; the walkthroughs in `docs/playthrough/` cover the intro, menus, dialogue and minigames.

## Open questions

- `ARIAL14.FNT` is not shipped with this install, so text uses the canvas fallback (ADR-017).
- Some MATRIX and filter semantics remain **inferred**; `docs/matrix.md` and `docs/filters-fonts.md` list them.
- Full start-to-finish coverage is tracked by [the playthrough spec](../2026-10-21-complete-playthrough.md).
