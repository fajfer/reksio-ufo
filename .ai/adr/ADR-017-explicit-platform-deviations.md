# ADR-017: Platform deviations are explicit and minimal

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `docs/script-semantics.md` (integer division by zero returns 0 instead of faulting), `docs/filters-fonts.md` (missing `ARIAL14.FNT` falls back to a canvas font), `src/engine/logic.ts` (`RANDOM^GET` uses `Math.random`), `README.md` (known gaps).
- **Supersedes:** none

## Context

Some Win32 behaviour cannot be reproduced exactly in a browser: a division by zero would fault, `GetTickCount()` has no stable equivalent, a missing font file cannot be conjured up, and WebAudio resamples to the context rate. Pretending these differences do not exist hides risk; trying to emulate every crash makes the port unusable.

## Decision

Keep platform deviations minimal, local and declared. For each one, state the original behaviour, the substitute and the observable contract that is preserved, at the point where the substitution happens. Preserve what the game observably depends on (range, distribution, ordering, no crash) and do not let a browser limitation justify a change to game rules. Known deviations are listed in the relevant `docs/` page or the README's known gaps.

## Consequences

- MUST document each deviation where it occurs: original behaviour, browser substitute, and why the substitute preserves the observable contract.
- MUST preserve the observable contract: `RANDOM^GET(offset, range)` still returns a uniform value in `[offset, offset+range)`; division by zero still yields a usable value instead of aborting the scene; a missing FNT still renders readable text.
- MUST add a test for the substituted behaviour, or record the manual evidence if it is visual.
- MUST NOT use "the browser cannot do this" to change game rules, skip a scene or remove a feature. That needs a superseding ADR.
- A deviation that affects gameplay rather than platform behaviour belongs in `src/mods.ts`, not in a platform fallback (ADR-008).
- Keep the list honest: if a deviation is later reproduced exactly, remove the note and the fallback.

## Related files

- [`src/engine/logic.ts`](../../src/engine/logic.ts) (`Rand`)
- [`src/script/values.ts`](../../src/script/values.ts) (division and conversion)
- [`src/engine/fonts.ts`](../../src/engine/fonts.ts) (canvas fallback)
- [`src/engine/audio.ts`](../../src/engine/audio.ts) (native sample rate)
- [`docs/script-semantics.md`](../../docs/script-semantics.md)
- [`docs/filters-fonts.md`](../../docs/filters-fonts.md)
- [`README.md`](../../README.md)
