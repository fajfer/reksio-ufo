# ADR-010: Fixed 800x600 rendering contract

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `00c35f1` (renderer and main loop), `90529c3` (`GETGRAPHICSAT` per `CRefreshScreen::getGraphicsAt`), `9e0a4ed` (ANIMO focus-off), `9c4b18a` (`SETBACKGROUND` accepts an IMAGE object); `src/engine/renderer.ts`.
- **Supersedes:** none

## Context

The original draws to a fixed 800x600 surface, sorts graphics by `PRIORITY`, and uses pixel-accurate hit tests. Scripts contain absolute coordinates and depend on priority ties and topmost-object selection. A responsive or device-pixel renderer would change collision, hotspot and layout behaviour.

## Decision

Render to a logical 800x600 canvas; scale it with CSS while preserving the 4:3 aspect ratio. Sort visible drawables by `priority` ascending, then by creation order for ties. Draw the scene background first. Hit-test from the topmost drawable down. Graphic hit tests use the sprite's alpha channel; ANIMO buttons use their bounding rectangle, as observed in the original. All engine coordinates are game pixels.

## Consequences

- MUST express positions, sizes and hit rectangles in game pixels; MUST NOT use CSS pixels or device pixels inside the engine.
- Every drawable MUST expose a stable `order` from `engine.nextOrder()` and participate in the priority-then-order sort.
- MUST preserve the priority tie behaviour and the topmost hit rule; a different sort changes gameplay.
- MUST keep alpha-based hit testing for graphics (`GETGRAPHICSAT`, `GETALPHA`) and rectangle-based testing for ANIMO buttons.
- HTML/CSS may style the page and the boot panel, but game rendering stays on the Canvas2D surface.
- Changing the logical resolution, scaling rule or sort order needs a superseding ADR and a playthrough check.

## Related files

- [`src/engine/renderer.ts`](../../src/engine/renderer.ts)
- [`src/engine/media.ts`](../../src/engine/media.ts)
- [`src/engine/ui.ts`](../../src/engine/ui.ts)
- [`src/engine/engine.ts`](../../src/engine/engine.ts) (input and hotspot selection)
- [`index.html`](../../index.html)
- [`docs/object-semantics.md`](../../docs/object-semantics.md) (`GETGRAPHICSAT`)
