# ADR-004: Preserve the original algorithms and their quirks

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `1d1a893` (faithful string-based interpreter), `320110d` (SEQEVENT character mapping), `ba74510` (handler arguments passed verbatim), `d4950c9` (ANIMO methods), `docs/script-semantics.md`.
- **Supersedes:** none

## Context

The Piklib script language never tokenizes. It splits text on `;` and `,` by parenthesis depth, deletes every space (including inside strings), substitutes `$1..$9` textually before parsing, resolves each parameter by its first character, evaluates arithmetic strictly left to right with no precedence, and tolerates trailing junk after the last `)`. Shipped scripts rely on these quirks: unbalanced quotes, object names arriving as strings, `$12` meaning argument 1 followed by `2`, and `BREAK` propagating through the whole call chain.

## Decision

Port the algorithms literally and preserve the quirks. Do not build a "clean" parser, add operator precedence, quote-awareness, escaping or whitespace normalization, and do not rewrite the scripts to fit a nicer grammar. The string interpreter, literal rules, type coercions, argument substitution and `BREAK` / `ONE_BREAK` propagation follow the procedures cited in `docs/script-semantics.md`.

## Consequences

- MUST keep `splitStatements`, `splitArgs`, `fillParams`, `resolveParameter`, `evalExpression` and the value conversions aligned with the cited procedures.
- MUST add a regression test for every newly discovered quirk, using a real script fragment where possible.
- MUST NOT "fix" unbalanced quotes, missing operators, operator precedence, whitespace handling, trailing junk or single-digit `$n` substitution.
- MAY isolate a quirk behind a named compatibility helper, but MUST NOT remove the behaviour.
- A change to the interpreter needs either a failing real-data case or a cited DLL procedure. "Cleaner" is not a justification.

## Related files

- [`src/script/interpreter.ts`](../../src/script/interpreter.ts)
- [`src/script/values.ts`](../../src/script/values.ts)
- [`docs/script-semantics.md`](../../docs/script-semantics.md)
- [`test/interpreter.test.ts`](../../test/interpreter.test.ts)
