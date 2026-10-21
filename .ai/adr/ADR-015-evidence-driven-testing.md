# ADR-015: Evidence-driven testing and recorded playthroughs

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `a685591` (CDP test driver), `48bd306` (scene sweep), `f05fa36` (hotspot fuzzer), `4f49613` (session daemon and preview server), `6645973` / `f353c37` (chapter walkthroughs); `test/*.test.ts`, `docs/playthrough/`.
- **Supersedes:** none

## Context

The port cannot rely on a test fixture of copyrighted data, but a synthetic fixture cannot prove that all 102 scripts, 707 images and 805 animations decode. Format and interpreter bugs often appear only in one shipped file. Engine behaviour is also visual and interactive: a unit test cannot tell whether a scene is playable.

## Decision

Test at the lowest layer that can reproduce the behaviour, and use the real install where it is the evidence. `node:test` covers pure decoders, the interpreter, filters/fonts and the matrix model. Tests that need game data read `REKSIO_DATA` / `REKSIO_GAME` and skip when the install is absent; they never fail merely because data is missing. Synthetic fixtures cover edge cases and formats that the install does not ship. Headless Chrome tooling (`drive`, `fuzz`, `sweep`, `session`) covers integration, and every chapter is played through and recorded in `docs/playthrough/`.

## Consequences

- MUST keep `npm test` green without game data. Skips are allowed; failures are not.
- MUST add real-data coverage for a new decoder or format: walk every file of that type, assert full consumption, and keep the existing thresholds meaningful.
- MUST add a synthetic test for logic that can be tested without data (FNT layout, matrix moves, interpreter splitting, value coercion).
- MUST record a playthrough for a new chapter or a changed scene flow, with the exact session steps and the observed result.
- Every fixed engine bug SHOULD get a regression test at the lowest layer that can reproduce it. If the bug is only reachable by playing, record the reproduction steps in `docs/playthrough/` and report the scene, expectation and observation.
- MUST NOT weaken a real-data assertion to make a build pass. Fix the decoder or document the data defect.
- Known original-data defects stay listed in `docs/playthrough/README.md`; do not "fix" them in the port without an ADR.

## Related files

- [`test/formats.test.ts`](../../test/formats.test.ts)
- [`test/interpreter.test.ts`](../../test/interpreter.test.ts)
- [`test/matrix.test.ts`](../../test/matrix.test.ts)
- [`test/filters-fonts.test.ts`](../../test/filters-fonts.test.ts)
- [`tools/drive.ts`](../../tools/drive.ts)
- [`tools/fuzz.ts`](../../tools/fuzz.ts)
- [`tools/sweep.sh`](../../tools/sweep.sh)
- [`tools/session.ts`](../../tools/session.ts)
- [`docs/playthrough/README.md`](../../docs/playthrough/README.md)
