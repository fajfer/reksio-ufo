# Agent instructions

This repository is a browser port of a shipped 2004 game engine. Correctness is
measured against the original binaries and game data, not against a clean-room
design.

Before changing engine, script, format or gameplay behaviour:

1. Read [`.ai/adr/README.md`](.ai/adr/README.md), especially the port quality gates.
2. Read the relevant spec in [`.ai/specs/`](.ai/specs/README.md) and the ADRs for the area you touch; their **Decision** and **Consequences** are the acceptance criteria.
3. If a change conflicts with an ADR, stop and write a new **Proposed** ADR that supersedes it first. If it changes a feature's plan, update its spec in the same change.

Hard rules:

- Never modify `game/` or `scripts/`; game files are player-supplied and must not be committed (ADR-001, ADR-008).
- Gameplay changes go only in `src/mods.ts`, documented, and `?classic=1` must stay faithful to the original (ADR-008).
- Every non-obvious behaviour needs DLL/plug-in evidence or a script/data observation, marked **observed** or **inferred** (ADR-003).
- Preserve the original algorithms and quirks; do not normalize scripts (ADR-004).
- Keep content errors non-fatal and warnings actionable (ADR-011).
- Keep `npm test` and `npm run typecheck` green (ADR-015).
