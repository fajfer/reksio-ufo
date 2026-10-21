# ADR-009: Vanilla TypeScript, static build, no runtime dependencies

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `91fa1e2` (Vite dev server), `00c35f1` (Canvas2D + WebAudio runtime), `aaa03f3` (static game manifest); `package.json` has devDependencies only; `vite.config.ts` uses `base: './'`.
- **Supersedes:** none

## Context

The port is a long-lived browser application for a 2004 game. It must build to static files, run from a subpath (including GitHub Pages-style hosting), work without a backend, and stay auditable: every dependency is a supply-chain and compatibility risk for a project whose value is faithful emulation.

## Decision

Use strict TypeScript, Vite, the Canvas2D API and WebAudio. Ship a static `dist/` built with a relative base (`base: './'`). Keep runtime `dependencies` empty; development tooling may use npm packages. There is no server component, no CDN, no analytics, no remote API and no runtime network access beyond fetching the player's own game files.

## Consequences

- MUST keep `dependencies` in `package.json` empty. Adding a runtime dependency requires a superseding ADR with size, licence, security and browser-support justification.
- MUST use browser platform APIs in `src/`; Node APIs are allowed only in `test/` and `tools/`.
- MUST keep `base: './'` so the build works from a subpath. Changing it is a deployment decision.
- MUST keep the production build free of game data (ADR-001) and free of hidden network calls.
- MUST keep `npm run build` as `tsc --noEmit && vite build`; a build that skips type checking is not acceptable.

## Related files

- [`package.json`](../../package.json)
- [`vite.config.ts`](../../vite.config.ts)
- [`tsconfig.json`](../../tsconfig.json)
- [`src/engine/renderer.ts`](../../src/engine/renderer.ts)
- [`src/engine/audio.ts`](../../src/engine/audio.ts)
- [`index.html`](../../index.html)
