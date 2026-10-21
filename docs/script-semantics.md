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

## Literals

`CMC_Variable::resolve` (0x100b26a0) — **observed**:

| Text | Result |
|---|---|
| starts with `"` | STRING. One leading `"` is removed, and one trailing `"` if present. `"ANNCAR0` → `ANNCAR0`; `""OPEN""` → `"OPEN"` (keeps the inner quotes) |
| starts with `-` or a digit, contains `.` | DOUBLE (`toDouble`) |
| starts with `-` or a digit, no `.` | INTEGER (`toNumber`, atoi-like) |
| exactly `TRUE` / `FALSE` | BOOL |
| anything else, including empty | STRING, verbatim |

## Statement splitting

`CMC_Behaviour_Entry::getCodeLines` (0x10050750) — **observed**:

- It walks the code character by character, tracking only `(`/`)` depth.
- `;` at depth 0 ends a statement.
- **Every space (0x20) is deleted**, inside strings as well. The language has
  no string escaping or quote awareness at this level.
- Brackets `[`/`]` and quotes do not affect splitting.

## Argument splitting

`CMC_Behaviour::resolveParameters` (0x1004ea00) — **observed**:

- It splits on `,` at parenthesis depth 0, with **no quote awareness**.
- Each piece goes through `resolveParameter`.
- Consequence for the S67 race scene: `ADD("ANNCAR0,"ANNCAR1","ANNCAR2","ANNCAR3")`
  splits into `"ANNCAR0`, `"ANNCAR1"`, `"ANNCAR2"`, `"ANNCAR3"`, which resolve to
  the four intended strings. The missing quote is harmless in the original.

## Executing one statement

`CMC_Behaviour_Entry::run` (0x10050a50) and `CMC_Behaviour::runLine`
(0x1004e440) — **observed**:

1. `fillParams` substitutes `$n` (above).
2. If the line starts with `[`, the bracket expression is evaluated, and its
   string value names the target object (dynamic dispatch, e.g. `["ANIMO"+$1]^HIDE()`).
3. `@NAME(args)`: a keyword on the global runner (below).
4. `*X^M(args)`: dereference. X is resolved as a parameter, and its string value is the object name.
5. Otherwise the target is the text before the **first** `^` and the method is
   the text after the **last** `^`. Chained calls are not supported.
   `THIS` is the object that owns the running behaviour or event.
6. Args: the text after the first `(`. One leading `(` and one trailing `)` are
   stripped, then the rest is split as above.
7. Object lookup, `CMC_ObjectsContainer::getObject` (0x1008b270): a hash lookup by
   name. On a miss, a trailing `_0` is stripped and the lookup retried (clone 0
   is the original). Then it falls back to the parent container
   (scene → episode → application).

## Behaviours

`CMC_Behaviour::run(obj, params, checkCondition)` (0x1004dd00) — **observed**:

- A disabled behaviour does nothing.
- With `checkCondition`, a CONDITION that fails makes it do nothing.
- Statements run in order. An entry result of **−1** stops the behaviour and
  reports *broken*. Any **other negative** (−2) stops just this behaviour, not broken.
- The return value is the object named `__RETURN__` (copied), set via `@RETURN`.

`CMC_Behaviour_Runner` — **observed**:

- `RUN(args…)` (0x100522b0): `run(params, checkCondition=false)`, so the CONDITION is **ignored**.
- `RUNC(args…)` (0x10052340): `run(params, checkCondition=true)`.
- Both return −1 when the behaviour broke, so the caller's statement result is
  −1 and **BREAK propagates up the whole call chain**. Otherwise they return `__RETURN__`.
- `RUNLOOPED(start, len[, step=1], extra…)` (0x100523d0): for `i = start; i < start+len; i += step`,
  it calls `run([i, extra…], checkCondition=true)`, so `$1` is the loop index.
  It stops when the behaviour reports broken.
  - Extra arguments are passed as strings. A variable passes its value; another
    object passes its name. **Inferred**: the branches are partly tangled.

## CONDITION / COMPLEXCONDITION

`CMC_Condition::valid(fireEvents)` (0x100607e0) — **observed**:

- OPERAND1 and OPERAND2 are evaluated like parameters. If their types differ,
  operand 2 is converted to operand 1's type, and a failed conversion means false.
- OPERATOR: 1 EQUAL, 2 NOTEQUAL, 3 LESS, 4 LESSEQUAL, 5 GREATER, 6 GREATEREQUAL.
- With `fireEvents`, it runs the `ONRUNTIMESUCCESS` or `ONRUNTIMEFAILED` handler.

Condition methods, `CMC_BasicCondition_Runner` (run 0x1004d040, ids from
prepareMthHashSet 0x1004d160) — **observed**:

| Method | id | Behaviour |
|---|---|---|
| `CHECK([fireEvents=TRUE])` | 1 | returns BOOL `valid(fireEvents)` |
| `BREAK([fireEvents=TRUE])` | 2 | if valid, returns −1: aborts the current behaviour **and all callers**, and ends RUNLOOPED |
| `ONEBREAK` / `ONE_BREAK([fireEvents=TRUE])` | 3 | if valid, returns −2: aborts **only** the current behaviour |

- The hash registers `ONEBREAK`, while the game writes `ONE_BREAK`. A separate
  `ONE_BREAK` string exists at 0x101495b4. Treat both as id 3 (**inferred**).
- COMPLEXCONDITION (`valid` 0x1005f5f0) combines CONDITION1/CONDITION2 with
  AND/OR. TODO: confirm whether it short-circuits.

## `@` keywords

Global runner keyword table (strings at 0x1014a860–0x1014a8ec), **observed**
names: `IF, WHILE, RETURN, MSGBOX, BOOL, INT, DOUBLE, STRING, LOOP, RUNONTIMER,
CREATE, GETAPPLICATIONNAME, GETCURRENTSCENE, ONEBREAK, CONTINUE`.

This game uses only `@IF`, 9 times, as `@IF("A","OP","B","THEN","ELSE")`.

The keyword runner is `pDummyRunner` (vtable 0x1014a810, `run(id)` at
0x10066590). IF is id 1, handled by `sub_10066750` — **observed**:

- Five arguments → static `CMC_Condition::valid(container, A, OP, B)`
  (0x10060ab0). OP strings map to condition operators:
  - `_` → EQUAL
  - `!_`, `<>` → NOTEQUAL
  - `<` → LESS, `<_` → LESSEQUAL
  - `>` → GREATER, `>_` → GREATEREQUAL
  - `?` → id 7, meaning unknown
- A and B are evaluated as operand expressions, the same way as CONDITION
  operands. `"VAR"` names a variable, and `""OPEN""` ends up as the literal `OPEN`.
- The chosen branch: if it names an existing object, that object (a behaviour)
  is run. Otherwise a temporary behaviour is built from the text, so inline
  code works.
- A one-argument form parses a whole condition string; the game does not use it.
