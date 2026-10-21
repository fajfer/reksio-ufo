# Alien Invaders gameplay tweaks

- **Status:** implemented
- **Date:** 2026-10-21
- **Issue:** none

## Goal

Make the Alien Invaders scene (`S16_SPACEINVADERS`) playable on touch screens and less punishing without editing the shipped data: a short re-throw cooldown, several beetroots in flight, tap-to-fire near Reksio, and a temporary skip button. `?classic=1` restores the original balance exactly.

## Non-goals

- Rebalancing other scenes or minigames.
- Changing engine rules to make this scene easier.
- Editing `game/` or `scripts/` (ADR-008).
- Making the skip button permanent or available after the opening seconds.

## Scope

`src/mods.ts`, `src/main.ts` (`?classic=1`), `src/engine/engine.ts` (`applySceneTweaks`), `README.md`.

## Load

- [root AGENTS.md](../../../AGENTS.md)
- [ADR-008](../../adr/ADR-008-game-data-immutable-mods-layer.md), [ADR-016](../../adr/ADR-016-debug-and-test-hooks.md), [ADR-017](../../adr/ADR-017-explicit-platform-deviations.md)
- [`src/mods.ts`](../../../src/mods.ts), [`src/main.ts`](../../../src/main.ts), [`src/engine/engine.ts`](../../../src/engine/engine.ts)

## ADRs affected

ADR-008 (mods layer), ADR-016 (`?classic`) and ADR-017 (font fallback for the skip label).

## Design

- **Rapid fire:** the original gate `CONDBURAKFIRE` waits for `ANIMOBURAK^ISPLAYING() == FALSE`, so a missed throw locks firing for the whole 21-frame flight (~1.3 s). The tweak replaces the gate with `VARFIREOK == 1`; `BEHREKSIOFIRE` clears it and arms the one-shot `TIMERFIRE` (`ELAPSE=200`, `TICKS=1`), whose tick sets it back. Result: a **0.2 s** re-throw cooldown.
- **Beetroot pool:** `BEETROOT_SLOTS = 8` clones of `ANIMOBURAK` are created at scene init (`ANIMOBURAK^CLONE(8)`). Each throw finds the first non-playing clone, records it in `VARTHROWBURAK`, and plays `PLAY0` on that clone. `BEHBURAKMOVE` probes `THIS` and records `VARBURAKHIT`; hit handlers move and explode that exact clone instead of the original.
- **Tap-to-fire:** `TAP_RADIUS = 70` px around Reksio's center. `MOUSE^ONCLICK` routes through `BEHCLICK`, which compares `MOUSE^GETPOSX() - ANIMOREKSIO^GETCENTERX()` against `±TAP_RADIUS`. Inside: throw. Outside: no throw; the scene's own `BEHREKSIOMOVE` walks Reksio toward the pointer.
- **Skip button:** `SKIP_SECONDS = 5`, rectangle `640,250,780,310`, label `POMIŃ`. A `TEXT` uses the `FNTBIG` font (canvas fallback because `ARIAL14.FNT` is not shipped). `BUTTONSKIP` fires `BEHSKIP`, disables `TIMER1` / `TIMERHINT` / the button, calls `RUNCLONES("ANIMOUFO", -1, -1, "BEHSKIPSTOP")` and the same for `ANIMOUFOFIRE` / `ANIMOBURAK`, then plays `ANIMOREKSIO^PLAY("SUCCESS")` — the scene's normal win path. `STOP(FALSE)` keeps `ONFINISHED` handlers out of it.
- **Opt-out:** when `engine.classic` is true, `applySceneTweaks` is never called. `?classic=1` sets it in `src/main.ts`.

## Tasks

| # | Task | Load | Done when | Status | Commit |
|---|---|---|---|---|---|
| 1 | Add the mods layer and `?classic=1`, with the rapid-fire tweak | `src/mods.ts`, `src/engine/engine.ts`, `src/main.ts` | default play has a 0.2 s cooldown; `?classic=1` restores the original gate | done | `4e2dd2b` |
| 2 | Add tap-to-fire and the five-second skip button | `src/mods.ts` | near taps throw, far taps only walk; the skip button wins the scene and disappears | done | `c0c1854` |
| 3 | Replace the single beetroot with an eight-clone pool | `src/mods.ts` | up to eight throws are in flight; each hit explodes the clone that raised it | done | `af39ae5` |
| 4 | Fix ANIMO button/hit behaviour needed by the pool | `src/engine/media.ts`, `src/engine/ui.ts` | a beetroot that hits the UFO connects; focus-off respects disabled/hidden buttons | done | `14de034`, `9e0a4ed` |

## Validation

Play `?scene=S16_SPACEINVADERS` and the same scene with `?classic=1`; throw rapidly and confirm the 0.2 s gate; fill all eight slots; tap near and far from Reksio; press `POMIŃ` within five seconds and confirm the normal success path; run `tools/fuzz.ts` over the scene and check for new warnings.

## Open questions

- The constants (cooldown, pool size, tap radius, skip time) are tuning values; change them only with a playthrough note.
- The tweaks are intentionally limited to Alien Invaders; another scene needs its own documented function.
