# Piklib script semantics (PIKLIB8.dll)

Recovered with REA (Hopper) from PIKLIB8.dll, sha256 a5dea135…de86b. Each
claim cites the procedure it came from and is marked **observed** (read
directly from code) or **inferred** (from code structure plus game data).

## Argument substitution: `$1..$9` is textual

`CMC_Behaviour_Entry::fillParams` (0x10051d50) — **observed**:

- Before a code line is parsed, every `$` immediately followed by a digit `d`
  is replaced by the raw string value of argument `d-1` (no quotes added).
- If there is no such argument (or no argument array), the `$` is copied
  unchanged. This is why `"$WAVS\HUN\X.WAV"` survives: `W - '1'` is out of range.
- Only single digits: `$12` is argument 1 followed by the character `2`.

Consequences:

- `$1^PLAY("X")` with `$1 = "ANNWORM_1"` executes `ANNWORM_1^PLAY("X")`.
- `["ANIMO"+$1]` with `$1 = "3"` becomes `["ANIMO"+3]`.
- `X^SET($1)` with `$1 = "GADA"` becomes `X^SET(GADA)`. `GADA` is not a variable
  object, so it resolves to the string literal `GADA` (see below).
- Implementation: substitute into the statement source, then parse (cache by text).

## Parameter resolution

`CMC_Behaviour::resolveParameter` (0x1004ec10). Text is trimmed of spaces,
then checked in this order (**observed**; the nesting of branches 3–5 is
partly **inferred**, because the decompiler output is tangled there):

1. Starts with `[`: strip the brackets and build a `CMC_Expression` (arithmetic, below).
2. Starts with `CONV`: special conversion form (not used by this game).
3. Contains `^` and does not start with `"`: a method call, evaluated with
   `CMC_Behaviour::runLine`, and its return value is used.
4. Starts with `-` or a digit: a literal (`CMC_Variable::resolve`).
5. Contains `|`: structure field `OBJ|FIELD` (`CMC_Structure::getField`).
6. Names an object whose type is 1–4 (the variable types
   INTEGER/STRING/BOOL/DOUBLE): the variable itself is passed **by reference**.
7. Anything else, including names of non-variable objects (ANIMO, SOUND, …) and
   unknown names: `CMC_Variable::resolve(text)`, a literal. A bare object name
   therefore arrives as the *string* of its name; methods that take object
   names look them up again.

## Arithmetic `[...]`

`CMC_Expression::calculate` (0x1006d4c0) — **observed**:

- **Strictly left to right, no operator precedence.**
  `result = eval(operand0)`, then for each `(op, operand)`:
  `result = result.calculate(eval(operand), op)` (virtual call at vtable +0xb0).
  So `[A+B*C]` means `(A+B)*C`, and `[70*$1]` behaves as written.
- The left operand's type decides the operation. The right operand is
  converted to that type (vtable +0xac `convert(type)`).
- Operator codes (`switch(op-1)`): 1 `+`, 2 `-`, 3 `*`, 4 `@` (divide), 5 `%`.
  The source-symbol mapping is **inferred** from the switch order and the
  operators used in game data (`+ - * @ %`).

| Left type | `+` | `-` | `*` | `@` | `%` |
|---|---|---|---|---|---|
| INTEGER (`CMC_Integer::calculate` 0x1007b400) | add | sub | mul | C `/` (truncates toward 0) | C `%` |
| DOUBLE (`CMC_Double::calculate` 0x10064d70) | add | sub | mul | div | both sides truncated to int, then `%` |
| STRING (`CMC_String::calculate` 0x100a8020) | concatenate `right.toString()` | left unchanged | left unchanged | left unchanged | left unchanged |
| BOOL (`CMC_Bool::calculate` 0x10053a00) | AND | left unchanged | OR | OR | OR |

- Integer division by zero would fault in the original; the port returns 0.
- Literal type comes from `CMC_Variable::resolve` (TODO: exact rules, e.g.
  `3.0` → DOUBLE, quoted → STRING, `TRUE`/`FALSE` → BOOL).

## TODO (next to recover)

- `CMC_Behaviour_Entry::getCodeLines` (0x10050750): statement splitting, how
  quotes and brackets are handled, and malformed input.
- `CMC_Behaviour::runLine` (0x1004e440) / `resolveObject` (0x1004e7e0): target
  resolution, including `[expr]^METHOD`, and `THIS`.
- `CMC_Behaviour::resolveParameters` (0x1004ea00): argument-list splitting.
- `@IF` and other `@` keywords.
- `CMC_Behaviour_Runner`: RUN / RUNC (0x10052340) / RUNLOOPED (0x100523d0), and `_break`.
- `CMC_Condition::valid` (0x100607e0) and CONDITION/COMPLEXCONDITION.
