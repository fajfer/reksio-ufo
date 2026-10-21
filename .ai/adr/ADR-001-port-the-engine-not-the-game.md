# ADR-001: Port the engine, not the game

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `3b75095` (decoders for the shipped containers), `46d22f3` (project hierarchy from `Application.def`), `91fa1e2` (case-insensitive VFS); README "No game files are included"; `.gitignore` ignores `game/` and `scripts/`.
- **Supersedes:** none

## Context

*Reksio i UFO* (AidemMedia, 2004) is a data-driven game: `PIKLIB8.dll` plus encrypted scripts, images, animations, fonts and WAVs. The source code and asset sources are unavailable, and the game files are copyrighted. The port must run an install the player already owns, not redistribute it.

## Decision

Reimplement the engine (PIKLIB8 and its plug-ins) in the browser and run the original install bytes unchanged. Do not extract, repack, transcode or transpile game data as a build step. Do not commit game files. The player supplies an install through the folder picker or through a server that exposes it at `./game/`; all reading happens locally.

## Consequences

- MUST NOT commit, bundle or deploy `game/`, `scripts/`, decoded scripts, or any extracted game asset. Both directories stay in `.gitignore`.
- MUST read original files at runtime; a change that needs an offline conversion step is a new ADR.
- MUST treat missing or malformed game files as content issues: warn and continue where possible (ADR-011), not as a port crash.
- MUST keep game-specific behaviour in data or in the explicit mods layer (ADR-008), not in engine branches.
- Tests MAY read a local install through `REKSIO_DATA` / `REKSIO_GAME`, but MUST skip when it is absent (ADR-015).

## Related files

- [`README.md`](../../README.md)
- [`.gitignore`](../../.gitignore)
- [`src/engine/project.ts`](../../src/engine/project.ts)
- [`src/engine/fs.ts`](../../src/engine/fs.ts)
- [`test/formats.test.ts`](../../test/formats.test.ts)
