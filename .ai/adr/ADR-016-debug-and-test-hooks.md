# ADR-016: Debug and test hooks are a supported contract

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `f05fa36` (`?trace`, audio gate, `debugHotspots`), `4f49613` (`?speed`, session daemon, preview server), `70ebeab` (CDP port selection), `20b7e9a` (playthrough brief); `docs/playthrough/README.md`.
- **Supersedes:** none

## Context

Testing a 90-scene game requires jumping to a scene, fast-forwarding dialogue and minigames, inspecting variables, clicking hotspots by name and taking screenshots. The tools drive a real browser through CDP and rely on stable globals and query parameters in the running page.

## Decision

Treat the debug surface as a supported test API: `window.engine` exposes the running engine; `?scene=NAME` starts at a scene; `?trace=1` logs every fired signal and its parameter; `?classic=1` disables gameplay tweaks; `?speed=N` scales the game clock and audio (1–16); `?autostart` skips the click gate; `engine.debugHotspots()` returns active hotspots with a clickable point. These hooks are available in production builds because the playthrough tooling runs against a production build.

## Consequences

- MUST keep the hook names and semantics stable. Renaming or removing one requires updating `tools/`, `docs/playthrough/README.md` and this ADR.
- MUST keep `?speed` clamped to 1–16 and applied to both the game clock and audio, so a fast-forwarded playthrough stays coherent.
- MUST keep `?classic` an exact bypass of `src/mods.ts` (ADR-008).
- MUST keep `?trace` logging signal names and parameters only; it must not expose anything beyond the local game state.
- MUST keep the hooks local-only: no network calls, no remote control channel, no telemetry.
- A test hook that changes engine behaviour when inactive is a bug; debug flags must be inert by default.

## Related files

- [`src/main.ts`](../../src/main.ts) (query parameters, `window.engine`)
- [`src/engine/engine.ts`](../../src/engine/engine.ts) (`trace`, `classic`, `debugHotspots`)
- [`src/engine/audio.ts`](../../src/engine/audio.ts) (`speed`)
- [`tools/session.ts`](../../tools/session.ts)
- [`tools/drive.ts`](../../tools/drive.ts)
- [`tools/fuzz.ts`](../../tools/fuzz.ts)
- [`docs/playthrough/README.md`](../../docs/playthrough/README.md)
