# ADR-005: Data-driven object model and container hierarchy

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `00c35f1` (engine runtime and object model), `46d22f3` (application → episode → scene loader), `31c91e8` (clone resources shared lazily); `docs/object-semantics.md`.
- **Supersedes:** none

## Context

Piklib is an object/container engine. `Application.def` declares the application, episodes and scenes; each level's objects live in a `.CNV` file; scenes gain built-ins (`RANDOM`, `CNVLOADER`); scripts address objects by name and rely on a clone suffix (`_0`, `_1`, …) falling back to the original. Hardcoding a scene's objects in TypeScript would fork the data and make the port unverifiable.

## Decision

Give every supported PIKLIB object type one class and register it in the `FACTORY` map. Instantiate objects from parsed `ObjectDef` entries. Keep the container hierarchy application → episode → scene, with name lookup falling back from `_n` clones to the original and then to the parent container. Create the per-scene built-ins (`RANDOM`, `CNVLOADER`) before the scene's own objects. Application and episode graphics persist across scene changes; scene objects are disposed.

## Consequences

- MUST add a new object type as a class plus a `FACTORY` entry plus docs/tests. MUST NOT add scene-specific `if` branches to `engine.ts`.
- MUST preserve definition-file order when creating objects and firing `ONINIT`; the order is observable in the game.
- MUST preserve clone naming (`NAME_1..NAME_n`), lazy resource sharing and the `_0` lookup fallback.
- MUST keep the scene lifecycle: create built-ins and objects, load resources, `init()`, run `__INIT__`, then signal the scene's `ONINIT`.
- MUST dispose scene objects and their renderer entries on a scene change; application/episode graphics stay registered.

## Related files

- [`src/engine/engine.ts`](../../src/engine/engine.ts)
- [`src/engine/object.ts`](../../src/engine/object.ts)
- [`src/engine/project.ts`](../../src/engine/project.ts)
- [`src/engine/logic.ts`](../../src/engine/logic.ts)
- [`src/engine/media.ts`](../../src/engine/media.ts)
- [`src/engine/ui.ts`](../../src/engine/ui.ts)
- [`docs/object-semantics.md`](../../docs/object-semantics.md)
