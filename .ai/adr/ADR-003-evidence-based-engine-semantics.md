# ADR-003: Evidence-based engine semantics

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `356e731`, `d07aa6b` (script semantics), `48bd306` (object semantics), `71a5c7e`, `2613873`, `d4950c9` (later DLL confirmations); every claim in `docs/` cites a procedure and is marked **observed** or **inferred**.
- **Supersedes:** none

## Context

There is no engine source. The shipped `PIKLIB8.dll`, its plug-ins, the encrypted scripts and the install data are the only authorities. A plausible implementation that "looks right" can still break a scene, and a guess can silently become a port rule. The project already treats the disassembly and the shipped data as evidence; this ADR makes that a rule rather than a habit.

## Decision

Every non-obvious engine behaviour must cite its source: a DLL/plug-in procedure and address, a script observation, or a data observation. Claims in code comments and docs are graded **observed** (read directly from code or data) or **inferred** (deduced from structure, naming or usage). Unknowns stay visible as `TODO(unverified)` in code or under "Open questions" / "Not yet verified" in docs.

## Consequences

- MUST cite the procedure/address or the script/data evidence for a new semantic, in the code comment or the relevant `docs/` file.
- MUST NOT upgrade an **inferred** claim to **observed** without checking the binary. Do not reword an inference into a fact.
- MUST update the matching `docs/` page in the same change that changes the behaviour. The docs are part of the implementation, not a retrospective.
- MUST keep unresolved gaps visible. A `TODO(unverified)` is a work item, not a licence to guess.
- Reviewers and agents MUST reject a behaviour change that has no evidence and no explicit `TODO(unverified)`.
- When the same behaviour is described in code and docs, the citation must match in both places.

## Related files

- [`docs/script-semantics.md`](../../docs/script-semantics.md)
- [`docs/object-semantics.md`](../../docs/object-semantics.md)
- [`docs/filters-fonts.md`](../../docs/filters-fonts.md)
- [`docs/matrix.md`](../../docs/matrix.md)
- [`tools/annformat.md`](../../tools/annformat.md)
- [`src/script/interpreter.ts`](../../src/script/interpreter.ts)
- [`src/engine/logic.ts`](../../src/engine/logic.ts)
