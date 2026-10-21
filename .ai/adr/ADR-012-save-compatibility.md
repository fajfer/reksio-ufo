# ADR-012: Preserve original save compatibility

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `00c35f1` (`IniStore`, import in `Engine.start`); `docs/object-semantics.md` (`TOINI`, `ONBRUTALCHANGED`, `ONCHANGED`, sections `[PRZYGODA]` / `[MENUGLOWNE]`).
- **Supersedes:** none

## Context

The original stores progress in `Ufo.ini`, with sections named after the defining application/episode/scene and keys written by variable objects marked `TOINI`. Players expect a save from the original to carry over, and the scripts read those values during scene start-up.

## Decision

Replace `Ufo.ini` with an `IniStore` backed by `localStorage` under the key `reksio-ufo`. Sections and keys are case-insensitive. The section is the defining container's name. On first run, when the store is empty, import the install's `Ufo.ini` once. Variables with `TOINI` write on change; `ONBRUTALCHANGED` fires on every assignment and `ONCHANGED` only on an actual change.

## Consequences

- MUST keep section and key names compatible with the original (`PRZYGODA`, `MENUGLOWNE`, `VARROZDZIAL3`, …). Renaming one breaks imported saves and script lookups.
- MUST import `Ufo.ini` only when the store is empty; MUST NOT overwrite existing progress on a later run.
- MUST keep storage failures non-fatal: private mode or a blocked `localStorage` falls back to an in-memory save.
- A save-schema change needs a migration or a new storage key; silently dropping saves is not acceptable.
- Tests and playthroughs SHOULD cover a fresh import and a reload from `localStorage`.

## Related files

- [`src/engine/ini.ts`](../../src/engine/ini.ts)
- [`src/engine/engine.ts`](../../src/engine/engine.ts) (`start`, `Ufo.ini` import)
- [`src/engine/variables.ts`](../../src/engine/variables.ts) (`TOINI`, change signals)
- [`docs/object-semantics.md`](../../docs/object-semantics.md)
