# ADR-011: Fail soft on content errors, warn once

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `00c35f1` (`warnOnce`, skipped object types, caught load failures), `f05fa36` (fuzzer reports warnings), `4f49613` (play-testing sessions); `tools/sweep.sh`, `tools/fuzz.ts`.
- **Supersedes:** none

## Context

The install has 102 scripts, 707 images, 805 animations, missing sounds (`JEZ2.WAV`, `JEZ4.WAV`), broken animations (`PRAWA.ANN`, `KONWEKA.ANN`), undefined objects (`BTNEXIT`, `VARFOTKASEEN`) and orphaned CNV files. A port that throws on the first unknown object or missing file cannot reach the next scene, and a port that silently ignores them cannot be debugged.

## Decision

Fail soft at content boundaries. Unknown object types, missing resources, unknown handlers and script errors are reported once per unique message and the scene continues. Per-statement script errors are caught and logged. Object load failures skip that object, not the scene. Only boot-level failures are fatal: missing or invalid `DANE/Application.def`, an invalid game manifest, or a project without an `APPLICATION`.

## Consequences

- MUST use `warnOnce` (or an equivalent deduplicated warning) for content issues, naming the object and file.
- MUST NOT throw from an object method because a resource is missing; return a neutral value or `undefined`.
- MUST keep scene switching alive when one object fails to load; the remaining objects and `__INIT__` still run.
- Fatal errors are limited to the boot contract above. A new fatal path needs a superseding ADR.
- Fuzzer/sweep warnings are regression signals. Silencing a warning without fixing or documenting the cause is not acceptable.
- Warnings MUST remain actionable: include the object name, file and operation.

## Related files

- [`src/engine/engine.ts`](../../src/engine/engine.ts) (`warnOnce`, `createObjects`, `loadAll`, `switchScene`)
- [`src/script/interpreter.ts`](../../src/script/interpreter.ts) (`ScriptError` handling)
- [`tools/sweep.sh`](../../tools/sweep.sh)
- [`tools/fuzz.ts`](../../tools/fuzz.ts)
- [`docs/playthrough/README.md`](../../docs/playthrough/README.md) (known data defects)
