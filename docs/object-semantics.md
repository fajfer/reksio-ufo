# Piklib object semantics (PIKLIB8.dll)

This is the companion to `script-semantics.md`. It covers how scripted objects
behave at runtime. Each claim is marked **observed** (read from code) or
**inferred** (from game data or usage).

## Signals

- `CMC_Object::onSignal(name)` (0x100890f0) looks up the handler for the exact
  signal name and runs it as a behaviour with `checkCondition = true`
  (**observed**). Event handlers therefore respect a behaviour's CONDITION,
  while `RUN` does not.
- It returns whether a handler existed. Callers first try `EVENT^PARAM`, then
  fall back to `EVENT`. This was **observed** in `CMC_Variable::onChange`
  (0x100b3360): it builds `"ONBRUTALCHANGED^" + value`, and if no handler
  exists it signals `"ONBRUTALCHANGED"`. ONCHANGED works the same way.
- Handler values are `{code}`, a behaviour name, or a behaviour name with
  arguments: `BEHFINISHEDMOVE(0)`.
- `ADDBEHAVIOUR("ONFINISHED$INIT", "BEH")` adds a handler at runtime; `$`
  stands in for `^` (**inferred** from usage).

## Variables (INTEGER / STRING / BOOL / DOUBLE)

`CMC_Variable::onChange` (0x100b3360) — **observed**:

- ONBRUTALCHANGED fires on every assignment.
- ONCHANGED fires only when the value actually changed.
- With TOINI, a changed value is written to the INI (`CConfig::PutString`).
  The section is the defining container's name; `Ufo.ini` has `[PRZYGODA]`
  (episode) and `[MENUGLOWNE]` (scene) sections.

## Scene start-up

`CMC_Scene::initialize` (0x10099b90) — **observed**:

1. Creates built-in objects `RANDOM` (scripts call `RANDOM^GET` without
   declaring it), a system object, and `CNVLOADER`.
2. Loads the scene unit (all objects).
3. Runs the `__INIT__` behaviour with THIS = the scene and `checkCondition = true`.
4. Signals the scene's own `ONINIT`.

Object ONINIT handlers fire while the unit loads, before `__INIT__`
(**inferred** from the call order).

Each scene's objects live in `<PATH>/<SCENENAME>.CNV` (**observed** in the
data, e.g. scene `S76` → `76_zlapany/S76.cnv`).

## BUTTON

`CMC_Button` constructor (0x10054130) reads ACCENT, GFXSTANDARD, GFXONMOVE,
GFXONCLICK, SNDSTANDARD, SNDONMOVE, SNDONCLICK, RECT, ENABLE, DRAGGABLE and
PRIORITY. `createButton` (0x10055e00) then does the following — **observed**:

- The hotspot rect is GFXSTANDARD's bounds when that object exists, else RECT.
- ENABLE is applied through `CButton::Enable(bool)` (0x100155f0).
  `Enable(false)` hides the standard, on-move and on-click graphics and
  disables the hotspot. **A button declared `ENABLE=FALSE` is invisible until enabled.**
- `CButton::DisableButVisible` (0x100155a0) shows the standard graphic, hides
  the others, and disables the hotspot.
- The Polish install's main menu has a Czech/Hungarian language chooser
  (`BUTLANGCHOOSE`, `ENABLE=FALSE`). No script ever enables it, so it is dead
  content from the multilingual build.

## ANIMO

`CAnimo::Next` (0x10007fb0) — **observed** structure:

- When the frame passes the event's limit:
  - ping-pong (event flag 0x20000) reverses direction;
  - wait-for-sound (0x100000) holds while the frame sound plays;
  - otherwise the loop counter decides between jumping to loopStart and finishing.
- In this game all 4,646 ANN events have loopCount 0 and no flags, and no
  animo-level flags are set. So an event plays frames 0..n−1 once and then
  fires ONFINISHED; looping is done by scripts
  (`ONFINISHED^1={THIS^PLAY("2")}`).
- **Observed** method semantics:
  - `PLAY("EV")` → `CAnimo::Play(String)` (0x10008480) resolves the name with
    `resolveEventName` (0x1000bdf0): case-insensitive, no numeric fallback,
    and an unknown name is a no-op.
  - `CAnimo::Play(event, frame)` (0x10008da0) ignores events with 0 frames,
    makes the animo visible (vtable +0x7c(1)), defaults FPS to 15 if 0, and
    signals ONSTARTED.
  - `PLAY()` with no argument replays the current event from frame 0
    (`CAnimo::play` 0x1000bef0).
  - `STOP([b=TRUE])` (`CMC_Animo_Runner::stop` 0x10039ad0 → `CAnimo::stop`
    0x1000bf10) stops, and fires ONFINISHED only when `b` is true.
    `STOP(FALSE)` is used 158 times in the scripts.

## SEQUENCE (inferred from data)

- `.SEQ` nodes: PARAMETER (`SEQEVENT:NAME = n` selects child n),
  SEQUENCE (children in order), RANDOM (one child).
- SIMPLE leaves play an event on the scene ANIMO with the same FILENAME
  (e.g. ANIMO `KOGUT14_0` with `KOGUT14_0.ANN`).
- SPEAKING leaves play WAVFN while the animo plays `PREFIX_START` (if
  STARTING), then random `PREFIX_<n>` loops until the sound ends, then
  `PREFIX_STOP` (if ENDING). These are the event names in the data
  (e.g. KURATOR.ANN: `GADA_START, GADA_1..3, GADA_STOP`).
- ONSTARTED / ONFINISHED fire with the PLAY parameter.

## THIS inside RUN-called behaviours

`CMC_Behaviour_Runner::run` passes a null object to `CMC_Behaviour::run`,
so what THIS means inside a behaviour started with `RUN` is unclear. It does
not matter for this game: of the 39 behaviours that use `THIS^`, none is
invoked only via RUN/RUNC; all are also event handlers, where THIS is the
signalling object. The port passes the caller's THIS through.

## RAND

`RANDOM^GET(range)` gives `[0, range)`, and `RANDOM^GET(offset, range)` gives
`offset + [0, range)` — **observed**:

- `CMC_Rand_Runner::get` (0x100949f0) calls `CXRandom::random(a, b)` (0x100cb700).
- That computes `(GetTickCount() + rand()) % b + a`.

## Not yet verified

- TIMER tick counting and TICKS semantics.
- GETGRAPHICSAT argument meaning beyond `(x, y, alphaTest, minPriority, maxPriority, …)`.
- MATRIX (native minigame helper, used by one scene).
- STATICFILTER / FILTER.
- Text rendering with bitmap fonts.
