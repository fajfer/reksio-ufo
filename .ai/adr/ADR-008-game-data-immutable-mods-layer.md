# ADR-008: Game data is immutable; gameplay changes live in a mods layer

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `4e2dd2b` (mods layer introduced), `c0c1854`, `14de034`, `af39ae5` (Alien Invaders tweaks and fixes); `src/mods.ts`; README "the game data itself stays untouched" and `?classic=1`.
- **Supersedes:** none

## Context

The shipped game has difficulty and touch-screen problems that the port wants to soften (Alien Invaders' throw cooldown, one beetroot in flight, tap-to-fire, a skip button). Editing the install or the decrypted scripts would make the port unverifiable, break the "original data unchanged" promise, and make it impossible to compare against the original.

## Decision

Keep every gameplay change in `src/mods.ts`. Apply tweaks to the parsed `ObjectDef` list before objects are instantiated, scoped to a named scene. Every tweak is a named function with a comment that states what it changes and why; its constants live next to its code. `?classic=1` skips all tweaks and must reproduce the original balance. The engine itself stays faithful.

## Consequences

- MUST NOT edit `game/`, `scripts/`, or write modified data to disk. Tweaks are runtime patches only.
- Each tweak MUST be named, documented, scoped to a scene, and additive: append objects, patch a specific property or substring, and preserve unrelated code.
- MUST keep `?classic=1` equivalent to the original behaviour; tests and playthroughs SHOULD cover both paths.
- MUST NOT put balance changes, scene-specific conditions or "quality of life" logic in `engine.ts`. If a tweak needs engine support, add a general mechanism and an ADR first.
- A tweak that cannot be expressed as a data patch is a warning that the engine is missing a general feature, not a reason to special-case the scene.
- Removing a tweak MUST be possible by deleting its function and its `applySceneTweaks` call, with no residue in the engine.

## Related files

- [`src/mods.ts`](../../src/mods.ts)
- [`src/engine/engine.ts`](../../src/engine/engine.ts) (`applySceneTweaks`)
- [`src/main.ts`](../../src/main.ts) (`?classic=1`)
- [`README.md`](../../README.md)
