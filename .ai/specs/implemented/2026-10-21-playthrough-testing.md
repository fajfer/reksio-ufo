# Playthrough testing

- **Status:** implemented
- **Date:** 2026-10-21
- **Issue:** none

## Goal

Give a tester or agent a repeatable way to play the port in a real browser: jump to a scene, fast-forward the game clock and audio, inspect state, click hotspots by name, take screenshots and record each chapter's solution. The same harness sweeps all scenes and clicks every active hotspot to catch regressions.

## Non-goals

- A CI browser farm or a fully autonomous solver.
- Replacing manual judgement about whether a scene is fun or visually correct.
- Testing the original Windows build.
- Completing chapter 6 and a full start-to-finish run; that is tracked by [the playthrough spec](../2026-10-21-complete-playthrough.md).

## Scope

`tools/cdp.ts`, `tools/drive.ts`, `tools/fuzz.ts`, `tools/sweep.sh`, `tools/session.ts`, `docs/playthrough/`, and the debug hooks in `src/main.ts` and `src/engine/engine.ts`.

## Load

- [root AGENTS.md](../../../AGENTS.md)
- [ADR-015](../../adr/ADR-015-evidence-driven-testing.md), [ADR-016](../../adr/ADR-016-debug-and-test-hooks.md)
- [`tools/session.ts`](../../../tools/session.ts), [`tools/cdp.ts`](../../../tools/cdp.ts), [`tools/drive.ts`](../../../tools/drive.ts), [`tools/fuzz.ts`](../../../tools/fuzz.ts), [`tools/sweep.sh`](../../../tools/sweep.sh)
- [`docs/playthrough/README.md`](../../../docs/playthrough/README.md), [`src/main.ts`](../../../src/main.ts), [`src/engine/engine.ts`](../../../src/engine/engine.ts)

## ADRs affected

ADR-015 (evidence-driven testing) and ADR-016 (stable debug/test hooks).

## Design

- **CDP driver:** `tools/cdp.ts` launches Chrome with a caller-selected or Chrome-selected debugging port and exposes click, key, screenshot and evaluate primitives. `tools/drive.ts` is the direct one-shot driver.
- **Session daemon:** `node tools/session.ts serve <PORT> http://127.0.0.1:5174/` keeps a private persistent browser session; `node tools/session.ts <PORT> <step> ...` drives it. Steps include `goto`, `state`, `hotspots`, `clickname`, `click`, `move`, `key`, `hold`, `wait`, `waitscene`, `shot` and `eval`.
- **Scene jump:** `?scene=NAME` boots directly into a scene; names come from `DANE/Application.def`.
- **Fast-forward:** `?speed=N` (1–16) scales both the game clock and audio, so dialogue and minigames can be played in a few seconds without desynchronising sound.
- **Trace:** `?trace=1` logs every fired signal and its parameter.
- **Scene sweep:** `tools/sweep.sh` loads every scene, collects warnings and screenshots.
- **Hotspot fuzzer:** `tools/fuzz.ts` clicks every active hotspot in every scene and reports warnings, exceptions and transitions.
- **Walkthroughs:** `docs/playthrough/chapterN.md` records the goal, the exact session steps, and notes for each scene. The brief in `docs/playthrough/README.md` lists chapter entries, menu variables and known original-data defects.
- **Recorded coverage:** the intro and main menu; chapter selection into gameplay; dialogue with lip-sync; Alien Invaders, Pac-Man, the car choice → race (with sprite rotation) and the digging game (`MATRIX`, from the Matrix.dll plug-in). Chapters 1–5, 7 and 8 have walkthroughs; chapter 6 and the full chain are still open.

## Tasks

| # | Task | Load | Done when | Status | Commit |
|---|---|---|---|---|---|
| 1 | Add the CDP driver and a one-shot scene driver | `tools/cdp.ts`, `tools/drive.ts` | Chrome starts, a scene loads and a screenshot can be read | done | `a685591`, `f05fa36`, `70ebeab` |
| 2 | Sweep every scene for warnings and screenshots | `tools/sweep.sh` | all 90 scenes are visited; warnings are collected | done | `48bd306` |
| 3 | Click every active hotspot in every scene | `tools/fuzz.ts` | transitions, warnings and exceptions are reported per scene | done | `f05fa36` |
| 4 | Add the persistent session daemon, fast-forward and preview server | `tools/session.ts`, `vite.config.ts`, `src/engine/audio.ts` | a session survives reloads; `speed=4` runs clock and audio faster; preview serves the production build | done | `4f49613` |
| 5 | Write the playthrough brief and scene entries | `docs/playthrough/README.md` | chapter entries, menu variables and known defects are documented | done | `20b7e9a` |
| 6 | Record chapters 1–5, 7 and 8 | `docs/playthrough/chapter*.md` | each chapter has a goal, reproducible steps and notes | done | `6645973`, `f353c37`, `b492750` |

## Validation

`node tools/session.ts serve <PORT> http://127.0.0.1:5174/` starts a session; `goto`, `waitscene`, `clickname`, `shot` and `eval` work; a chapter walkthrough can be replayed from its steps; `tools/sweep.sh` loads all scenes; `tools/fuzz.ts` finishes without an uncaught exception.

## Open questions

- Chapter 6 and a fresh start-to-finish run are still open; see [the playthrough spec](../2026-10-21-complete-playthrough.md).
- The known original-data defects (`JEZ2.WAV` / `JEZ4.WAV`, `PRAWA.ANN`, `KONWEKA.ANN`, missing events, undefined objects) are listed in the brief and are not port bugs.
