# ADR-007: Case-insensitive virtual filesystem over the install

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `91fa1e2` (case-insensitive VFS and dev server), `46d22f3` (`PathResolver` mirrors `CPath::resolveFileName` 0x100c6ca0), `53468a4` (media loading through the same interface).
- **Supersedes:** none

## Context

The original runs on Windows. Scripts and definitions mix cases freely (`UFO.ANN` vs `ufo.ann`), use backslashes, omit directories, and rely on the engine's search order. The port reads from two very different sources: an HTTP install with a flat manifest, and a folder picked with `<input webkitdirectory>`.

## Decision

Put a `GameFS` interface (`has`, `list`, `read`, `url`) in front of every file source. Normalize every path to lower-case, forward-slash, install-relative form at the boundary. `PathResolver` mirrors `CPath::resolveFileName`: `$` / `&` anchor at the install root, a path with directories is relative to `DANE`, a bare name is searched in the current scene, episode and application directories and then `DANE`, and sounds fall back to `Wavs/` and `Wavs/sfx/`.

## Consequences

- MUST route all engine file access through `GameFS` and `PathResolver`; MUST NOT call `fetch`, `FileReader` or Node filesystem APIs from engine/object code.
- MUST preserve the resolution order and the WAV fallback. Changing either can break scripts that rely on the original search path.
- A new backend MUST normalize keys the same way and implement all four methods; `HttpFS` and `FileListFS` are the reference.
- MUST keep mixed-case and backslash paths working in tests and playthroughs.
- `HttpFS` needs a manifest because static hosting has no directory listing (ADR-014); `FileListFS` strips the picked folder's root name so paths are install-relative regardless of what the folder is called.

## Related files

- [`src/engine/fs.ts`](../../src/engine/fs.ts)
- [`src/engine/project.ts`](../../src/engine/project.ts)
- [`src/main.ts`](../../src/main.ts)
- [`vite.config.ts`](../../vite.config.ts)
- [`tools/game-manifest.ts`](../../tools/game-manifest.ts)
