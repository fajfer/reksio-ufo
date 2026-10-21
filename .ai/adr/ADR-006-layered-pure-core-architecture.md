# ADR-006: Layered architecture with pure, testable cores

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `3b75095` (`src/formats/`), `1d1a893` (`src/script/` with a `ScriptHost` interface), `00c35f1` (`src/engine/` runtime), `1781edf` (`MatrixModel` as pure logic with `test/matrix.test.ts`).
- **Supersedes:** none

## Context

The port has four kinds of code: byte decoders, the script interpreter, the runtime object model, and browser wiring (DOM, WebAudio, localStorage, service worker). Mixing them makes the proprietary formats and the language impossible to test without a browser, and makes it easy for a decoder to acquire an engine dependency.

## Decision

Dependencies point in one direction: `formats` ← `script` ← `engine` ← platform shell (`main.ts`, `offline.ts`, `public/sw.js`). Decoders are pure byte-to-data functions. The interpreter talks to the world through `ScriptHost` and knows nothing about the browser. Pure simulations such as `MatrixModel` stay free of engine imports. DOM, audio, storage and network access live at the engine/platform edges behind interfaces (`GameFS`, `ScriptHost`, `AudioSystem`).

## Consequences

- MUST NOT import engine, DOM, WebAudio or storage APIs into `src/formats/` or `src/script/`.
- MUST keep pure models such as `MatrixModel` independent of `Engine`; the model takes a signal callback instead.
- MUST put platform capabilities behind an interface so tests can substitute them.
- Core tests MUST run under `node --test` without a browser; only integration tooling may launch Chrome.
- A new dependency direction (for example `formats` importing `engine`) needs a superseding ADR.

## Related files

- [`src/formats/`](../../src/formats/)
- [`src/script/`](../../src/script/)
- [`src/engine/`](../../src/engine/)
- [`src/main.ts`](../../src/main.ts)
- [`src/engine/matrix.ts`](../../src/engine/matrix.ts)
- [`test/matrix.test.ts`](../../test/matrix.test.ts)
