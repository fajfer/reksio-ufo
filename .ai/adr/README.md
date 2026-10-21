# Architecture Decision Records

Decisions that future work must respect. Read an ADR only when a quality gate,
a task, or the code area you touch links to it.

## Rules

- One decision per file: `ADR-NNN-slug.md`, numbered sequentially, copied from [TEMPLATE.md](TEMPLATE.md).
- An ADR records a lasting decision; work and its validation live in [`.ai/specs/`](../specs/README.md). Link both ways when a spec implements or changes an ADR.
- Status: `Proposed`, `Accepted`, `Accepted (retroactive)`, `Superseded by ADR-MMM`, `Deprecated`.
- Retroactive ADRs record decisions already visible in the code. Their date is that of the commit where the decision first appears, and they cite the evidence.
- Supersede, don't rewrite: a changed decision gets a new ADR, and the old one only gets its status changed to `Superseded by ADR-MMM`.
- Add every ADR to the index below.
- A **Decision** must be checkable against code; **Consequences** are constraints, not notes. Use `MUST` / `MUST NOT` where a future change could violate the decision.
- When code and an ADR disagree, either the code is a bug or the ADR is stale. Resolve it explicitly; do not silently diverge.
- No SPDX header is added because this repository has no `LICENSE` file yet. If a licence is chosen, add its SPDX header to every ADR.

## Port quality gates

Every change to `src/`, `test/`, `tools/` or the game-data path must keep these
gates true. They are the review checklist for humans and agents.

| # | Gate | How to check | ADRs |
|---|---|---|---|
| 1 | Game data is untouched | `git ls-files game scripts` is empty; no game bytes are committed or built into `dist/`; no change rewrites decoded data | 001, 008 |
| 2 | Semantics have evidence | every non-obvious behaviour cites a DLL/plug-in procedure or a script/data observation; **observed** and **inferred** markers are accurate | 003 |
| 3 | Original quirks are preserved | no normalization of script syntax, arithmetic, paths or whitespace without a failing real-data case and a superseding ADR | 004 |
| 4 | Decoders consume the shipped data | every file of a supported type decodes to EOF; tests walk all files when an install is present | 002, 015 |
| 5 | Behaviour stays data-driven | scene-specific behaviour lives in `DANE` data or `src/mods.ts`, not in `engine.ts` branches | 005, 008 |
| 6 | Content errors fail soft | missing objects, files or handlers warn once and the scene continues; only a missing/invalid `DANE/Application.def` or game manifest is fatal | 011 |
| 7 | Ordering is deterministic | object creation follows definition order; drawing follows priority then creation order | 005, 010 |
| 8 | Deviations are explicit | gameplay tweaks live only in `src/mods.ts`, are documented, and `?classic=1` restores the original balance | 008 |
| 9 | Platform differences are declared | every unavoidable browser/Win32 difference states the original behaviour, the substitute and the observable contract | 017 |
| 10 | Tests and types pass | `npm test` and `npm run typecheck` pass; a new decoder, semantic or bug fix has a test or a recorded playthrough | 015 |
| 11 | Runtime stays local and dependency-free | `package.json` has no `dependencies`; the app runs from static files with no CDN, upload or telemetry; game files are never served from the repo | 001, 009 |

## How to use these ADRs (for agents)

1. Identify the files and behaviour you are about to change.
2. Find the matching quality gates, then the spec that covers the feature and the ADRs they link to.
3. Read the **Decision** and **Consequences** before editing; they are the acceptance criteria.
4. If the change conflicts with an ADR, stop and write a new **Proposed** ADR that supersedes it. Do not change code first and retrofit the document.
5. Update the index, the related docs and the tests in the same change.

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-001](ADR-001-port-the-engine-not-the-game.md) | Port the engine, not the game | Accepted (retroactive) | 2026-10-21 |
| [ADR-002](ADR-002-runtime-decoding-of-original-formats.md) | Decode the original formats at runtime | Accepted (retroactive) | 2026-10-21 |
| [ADR-003](ADR-003-evidence-based-engine-semantics.md) | Evidence-based engine semantics | Accepted (retroactive) | 2026-10-21 |
| [ADR-004](ADR-004-preserve-original-algorithms-and-quirks.md) | Preserve the original algorithms and their quirks | Accepted (retroactive) | 2026-10-21 |
| [ADR-005](ADR-005-data-driven-object-model.md) | Data-driven object model and container hierarchy | Accepted (retroactive) | 2026-10-21 |
| [ADR-006](ADR-006-layered-pure-core-architecture.md) | Layered architecture with pure, testable cores | Accepted (retroactive) | 2026-10-21 |
| [ADR-007](ADR-007-case-insensitive-virtual-filesystem.md) | Case-insensitive virtual filesystem over the install | Accepted (retroactive) | 2026-10-21 |
| [ADR-008](ADR-008-game-data-immutable-mods-layer.md) | Game data is immutable; gameplay changes live in a mods layer | Accepted (retroactive) | 2026-10-21 |
| [ADR-009](ADR-009-vanilla-typescript-static-build.md) | Vanilla TypeScript, static build, no runtime dependencies | Accepted (retroactive) | 2026-10-21 |
| [ADR-010](ADR-010-fixed-resolution-rendering-contract.md) | Fixed 800x600 rendering contract | Accepted (retroactive) | 2026-10-21 |
| [ADR-011](ADR-011-fail-soft-runtime.md) | Fail soft on content errors, warn once | Accepted (retroactive) | 2026-10-21 |
| [ADR-012](ADR-012-save-compatibility.md) | Preserve original save compatibility | Accepted (retroactive) | 2026-10-21 |
| [ADR-013](ADR-013-offline-pwa-production-only.md) | Offline support is production-only | Accepted (retroactive) | 2026-10-21 |
| [ADR-014](ADR-014-install-delivery-manifest-and-folder-picker.md) | Ship from a manifest or a folder picker | Accepted (retroactive) | 2026-10-21 |
| [ADR-015](ADR-015-evidence-driven-testing.md) | Evidence-driven testing and recorded playthroughs | Accepted (retroactive) | 2026-10-21 |
| [ADR-016](ADR-016-debug-and-test-hooks.md) | Debug and test hooks are a supported contract | Accepted (retroactive) | 2026-10-21 |
| [ADR-017](ADR-017-explicit-platform-deviations.md) | Platform deviations are explicit and minimal | Accepted (retroactive) | 2026-10-21 |
