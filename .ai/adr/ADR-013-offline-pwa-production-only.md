# ADR-013: Offline support is production-only

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `b492750` (`src/offline.ts`, `public/sw.js`, manifest and icons), `4d9f035` (Safari/Firefox download), `6d72073` (Safari fixes), `1227ce4` (developer-mode message); `src/main.ts` gates on `import.meta.env.PROD`.
- **Supersedes:** none

## Context

A full install is hundreds of megabytes. Players should be able to install the site as an app and play without a network, but the dev server must never serve a stale service worker or cached build. Browser install prompts also differ: Chromium fires `beforeinstallprompt`, Safari and Firefox do not.

## Decision

Offer offline play only in the production build. Register the service worker only when `import.meta.env.PROD` and the browser supports service workers and Cache Storage. Pre-cache the app shell explicitly. Download the game through an explicit, abortable, resumable operation that skips already-cached files and writes a completion marker. Serve game files and hashed assets cache-first; serve navigations network-first with the last good `index.html` as fallback. Removing the offline copy deletes the game cache only, not the shell cache.

## Consequences

- MUST NOT register a service worker in development. The `import.meta.env.PROD` gate stays.
- MUST keep cache names in sync between `src/offline.ts` and `public/sw.js`; bump `SHELL_CACHE` when the shell caching contract changes.
- MUST keep the game download resumable and idempotent: an interrupted run leaves cached files in place, and the next run continues.
- MUST treat only a completed download (marker present) as installed. A partial cache is not "offline ready".
- Offline play requires a served install; folder-picker mode has no stable URLs and cannot be downloaded. The UI MUST say so.
- Safari/Firefox installation instructions are part of the feature, not optional polish; desktop Firefox cannot install web apps.

## Related files

- [`src/offline.ts`](../../src/offline.ts)
- [`public/sw.js`](../../public/sw.js)
- [`src/main.ts`](../../src/main.ts)
- [`index.html`](../../index.html)
- [`README.md`](../../README.md)
