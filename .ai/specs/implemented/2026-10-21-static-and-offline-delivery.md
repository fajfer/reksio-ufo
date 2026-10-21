# Static and offline delivery

- **Status:** implemented
- **Date:** 2026-10-21
- **Issue:** none

## Goal

Ship the port as a static site that works from ordinary hosting and from a local folder: build once with Vite, serve the player's install at `./game/` or let them pick it, install the app where the browser supports it, and download the game for offline play without a backend.

## Non-goals

- A server-side game service, accounts or cloud saves.
- Bundling game files with the build (ADR-001).
- Automatic updates of the player's install.
- Directory listing or a backend API for discovering files.

## Scope

`vite.config.ts`, `src/engine/fs.ts`, `src/offline.ts`, `src/main.ts`, `public/sw.js`, `public/manifest.webmanifest`, `public/icons/`, `index.html`, `tools/game-manifest.ts`.

## Load

- [root AGENTS.md](../../../AGENTS.md)
- [ADR-007](../../adr/ADR-007-case-insensitive-virtual-filesystem.md), [ADR-009](../../adr/ADR-009-vanilla-typescript-static-build.md), [ADR-013](../../adr/ADR-013-offline-pwa-production-only.md), [ADR-014](../../adr/ADR-014-install-delivery-manifest-and-folder-picker.md)
- [`vite.config.ts`](../../../vite.config.ts), [`src/engine/fs.ts`](../../../src/engine/fs.ts), [`src/offline.ts`](../../../src/offline.ts), [`public/sw.js`](../../../public/sw.js), [`src/main.ts`](../../../src/main.ts), [`tools/game-manifest.ts`](../../../tools/game-manifest.ts)

## ADRs affected

ADR-007, ADR-009, ADR-013 and ADR-014 are retroactive records of this delivery.

## Design

- **Build:** `npm run build` runs `tsc --noEmit && vite build`; `base: './'` makes `dist/` work from a subpath. There is no backend and no runtime dependency.
- **Dev/preview:** `vite.config.ts` serves the install at `/game/` from `REKSIO_GAME_DIR` or `./game`, and generates `manifest.json` on the fly. `npm run preview` serves the production build plus the install for long play-testing sessions.
- **HTTP install:** `HttpFS` fetches `./game/manifest.json` — a JSON array of install-relative paths — and builds a lower-case index. The manifest itself is not part of its own file list; it is cached separately for offline boot.
- **Folder install:** `FileListFS` indexes the files from `<input webkitdirectory>`, stripping the picked root folder so paths are install-relative.
- **Static hosting:** `npm run game-manifest -- <install>` walks the install and writes `manifest.json` next to the game files.
- **PWA:** `public/manifest.webmanifest` and `public/icons/` make the site installable. Chromium shows the `beforeinstallprompt` button (*Zainstaluj aplikację*). Safari and Firefox never fire that event, so the boot panel shows a matching instruction: Share → *Add to Home Screen* (iOS), File → *Add to Dock* (Safari 17+), menu → *Install* (Firefox Android). Desktop Firefox cannot install web apps at all.
- **Offline:** only in production. The service worker caches the app shell as it is used on the first online visit, so an installed app always opens offline; the explicit *Pobierz grę i graj offline* button downloads every game file into Cache Storage with six workers, skips already-cached files (resume), supports abort, and writes a completion marker. *Usuń pobraną grę* deletes the game cache only.
- **Caching:** game files and hashed assets are cache-first; navigations are network-first with the last good `index.html` as fallback. Cache names are shared between `src/offline.ts` and `public/sw.js`.
- **Platform limits:** iOS has no folder picker (`webkitdirectory`), so it uses the served install or the offline download; the boot panel hides the picker and points at *Graj* / the offline download instead.

## Tasks

| # | Task | Load | Done when | Status | Commit |
|---|---|---|---|---|---|
| 1 | Static build with relative base, plus dev/preview `/game/` server | `vite.config.ts`, `package.json` | `npm run build` produces `dist/`; dev and preview serve the install | done | `91fa1e2`, `4f49613` |
| 2 | `GameFS` with HTTP manifest and folder-picker backends | `src/engine/fs.ts`, `src/main.ts` | both modes boot into the game; paths are case-insensitive | done | `91fa1e2`, `aaa03f3` |
| 3 | Static manifest generator | `tools/game-manifest.ts` | `npm run game-manifest -- <install>` writes a JSON array next to the files | done | `aaa03f3` |
| 4 | PWA manifest, icons and service worker | `public/` | the site is installable where supported; icons are the original game icon | done | `b492750` |
| 5 | Offline download, cache, resume and remove | `src/offline.ts`, `public/sw.js`, `src/main.ts` | a full download plays with no network; a partial download resumes; remove deletes only the game cache | done | `b492750` |
| 6 | Safari/Firefox/iOS install UX | `src/main.ts`, `index.html` | each browser gets an actionable hint; iOS hides the folder picker | done | `4d9f035`, `6d72073`, `1227ce4` |

## Validation

`npm run build` and `npm run preview`; boot with the install at `/game/` and with a picked folder; download the game, go offline, reload and play; remove the download and confirm the shell still opens; check the install hint in Chromium, Safari and Firefox.

## Open questions

- Safari may evict Cache Storage under storage pressure; the app detects the missing marker and offers the download again.
- Firefox desktop cannot install web apps; it remains a browser-tab experience.
- iOS storage quotas and the lack of a folder picker are platform limits, not port bugs (ADR-017).
