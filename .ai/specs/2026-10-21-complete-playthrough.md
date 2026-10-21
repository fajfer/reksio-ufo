# Complete the start-to-finish playthrough

- **Status:** in progress
- **Date:** 2026-10-21
- **Issue:** none

## Goal

Finish chapter 6 and then complete a fresh start-to-finish run of *Reksio i UFO* in the web port, recording a replayable walkthrough for every chapter and resolving or documenting every engine bug found along the way.

## Non-goals

- Speedrunning, 100% collectibles or optional dialogue.
- Fixing defects that belong to the original data rather than the port.
- Replacing the existing chapter walkthroughs; this spec fills the gap and verifies the whole chain.

## Scope

`docs/playthrough/`, `tools/session.ts`, and any `src/engine/` or `src/mods.ts` fix produced by the run.

## Load

- [root AGENTS.md](../../AGENTS.md)
- [playthrough brief](../../docs/playthrough/README.md)
- [chapter 5](../../docs/playthrough/chapter5.md), [chapter 7](../../docs/playthrough/chapter7.md) (entry/exit context for chapter 6)
- [ADR-003](../adr/ADR-003-evidence-based-engine-semantics.md), [ADR-011](../adr/ADR-011-fail-soft-runtime.md), [ADR-015](../adr/ADR-015-evidence-driven-testing.md), [ADR-016](../adr/ADR-016-debug-and-test-hooks.md)
- [`tools/session.ts`](../../tools/session.ts), [`docs/script-semantics.md`](../../docs/script-semantics.md), [`docs/object-semantics.md`](../../docs/object-semantics.md)

## ADRs affected

None expected. If a bug requires changing a documented engine rule, write a superseding ADR before changing the behaviour.

## Design

- **Chapter 6 entry:** `S34_PRZELOT_A` with `VARPRZELOT=3`, per the chapter table in the brief. Verify the menu path and the chapter-5 hand-off.
- **Recording:** write `docs/playthrough/chapter6.md` in the same shape as the existing chapters: goal per scene, exact `node tools/session.ts <PORT> ...` steps, notes and screenshots where useful.
- **Full run:** start from a clean profile (no imported `Ufo.ini`), play the intro and all eight chapters in order, and record the end condition of each chapter.
- **Bug handling:** report the scene, a minimal reproduction, expected behaviour with the script line, observed behaviour and the suspected engine file. Add a regression test at the lowest layer that can reproduce it (ADR-015).
- **Known data defects:** `JEZ2.WAV` / `JEZ4.WAV`, `PRAWA.ANN`, `KONWEKA.ANN`, missing events in `OFERTA` / `METEOR3`, undefined `BTNEXIT` in S49 and `VARFOTKASEEN`, and the orphaned `s64_Brama/s01.cnv` objects stay documented, not "fixed".

## Tasks

| # | Task | Load | Done when | Status | Commit |
|---|---|---|---|---|---|
| 1 | Play and record chapter 6 | [`docs/playthrough/README.md`](../../docs/playthrough/README.md), [`chapter5.md`](../../docs/playthrough/chapter5.md), [`chapter7.md`](../../docs/playthrough/chapter7.md), [`tools/session.ts`](../../tools/session.ts) | `chapter6.md` has a goal and reproducible steps for every scene; the chapter reaches its documented end | todo | |
| 2 | Run the whole game from a clean profile | [`docs/playthrough/chapter1.md`](../../docs/playthrough/chapter1.md) … [`chapter8.md`](../../docs/playthrough/chapter8.md), [`tools/session.ts`](../../tools/session.ts) | a fresh run reaches the chapter-8 ending without a blocking engine bug | todo | |
| 3 | Fix or document every bug found | [`ADR-003`](../adr/ADR-003-evidence-based-engine-semantics.md), [`ADR-011`](../adr/ADR-011-fail-soft-runtime.md), [`ADR-015`](../adr/ADR-015-evidence-driven-testing.md) | each bug has a regression test or a walkthrough note; no new warnings in the sweep | todo | |
| 4 | Update the status and known gaps | [`README.md`](../../README.md), [`docs/playthrough/README.md`](../../docs/playthrough/README.md), [`engine-port spec`](implemented/2026-10-21-engine-port.md) | README and specs match the completed run; remaining gaps are data defects or explicit TODOs | todo | |

## Validation

Every chapter has a walkthrough that can be replayed from its steps; a fresh profile completes all eight chapters; `npm test`, `npm run typecheck` and `npm run build` pass; `tools/sweep.sh` and `tools/fuzz.ts` report no uncaught exception.

## Open questions

- Chapter 6's exact entry state must be confirmed from `S34_PRZELOT_A` / `BEH3` and the chapter-5 hand-off before recording the first steps.
- If a scene is genuinely too hard to automate, force the win with `eval` and say so in the walkthrough, as the brief allows.
