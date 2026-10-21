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

## SEQUENCE

- Tree nodes, `CSequencedPlayable::play` (0x100d0bc0) / `next` (0x100d1160) — **observed**:
  - SEQUENCE mode plays the children in order; `next` advances when the
    current child finishes.
  - RANDOM mode plays child `rand() % n`.
  - PARAMETER mode selects the child by the first character of the parameter:
    `1`–`9` → child 0–8, `A`–`Z` → 9 onwards. SEQEVENT maps event names to
    these numbers. All SEQEVENT values in this game are 1–9, so a numeric
    lookup is equivalent.
- SIMPLE leaves play an event on the scene ANIMO with the same FILENAME
  (**inferred** binding).
- SPEAKING leaves follow `CSpeakingAnimation` — **observed**:
  - `play` (0x100d6ee0): with STARTING it plays `PREFIX_START` first, and the
    WAV starts only when that finishes (`onPlayableFinished` 0x100d7290). With
    no START event, the WAV starts at once.
  - `playOnOf` (0x100d6300): while the WAV plays, it picks a random event named
    `PREFIX_<x>` where x is not START, END or STOP. It makes up to 10,000
    random tries. With an empty prefix it picks events whose name starts with
    a digit. If the WAV is no longer playing, it calls `finish`.
  - `finish` (0x100d7420): with ENDING it plays `PREFIX_END` (string at
    0x1014ae3c), falling back to `PREFIX_STOP`, then signals finished.
- ONSTARTED / ONFINISHED fire with the PLAY parameter (**inferred**).

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

## TIMER

**Observed:**

- `CMC_Timer::onTimer` (0x100b19f0): when enabled, it increments the count.
  If `TICKS > 0` and count == TICKS, the timer disables itself, keeping the
  count. Then `ONTICK^<count>` fires, falling back to `ONTICK`.
- `ENABLE` (0x100b1b50) restarts from 0 only if the timer was disabled.
- `RESET` (0x100b1bd0) zeroes the count and the interval.
- `SET(n)` (0x100b1bf0) sets the count and restarts the interval.

## CANVAS_OBSERVER^GETGRAPHICSAT

`GETGRAPHICSAT(x, y, visibleOnly, minPriority, maxPriority, rectOnly)` goes
through `CMC_CanvasObserver::getGraphicsAt` (0x1005b4d0) to
`CRefreshScreen::getGraphicsAt` (0x100d0000). **Observed**:

- It walks all graphics and keeps those inside the priority range
  (`-1` = unbounded; the runner maps a missing argument to `-1`).
- When the third argument is true, it keeps only visible objects
  (the object's flag at +0x138).
- It tests the bounding rect (`GetBoundingBox`), then the pixel alpha
  (`GetPixel`), unless the sixth argument is exactly 1, which counts the
  rect hit without the pixel test.
- It returns the name of the highest-priority hit.

Scripts only react to positive matches (`VAROBJECT:ONCHANGED^ANIMOPAJAK2`),
so the not-found value does not matter; the port returns `NULL`.

## ANIMO^GETPOSITIONX / GETPOSITIONY / GETCURRFRAMEPOSX / GETCURRFRAMEPOSY

`CMC_Animo_Runner::getPositionX` (0x10039c60, `getPositionY` 0x10039cd0)
branches on the argument count:

- With **no argument** it calls `CAnimo::GetPosition` (0x100092b0) — the
  SETPOSITION position plus the current image's offsets and the frame's
  dx/dy, i.e. **where the current frame is drawn**. `GetBoundingBox`
  (0x1000b9b0) builds the same x/y: `[CAnimo+0x214] + image.x + frame.dx`.
- With **an argument** it calls `CAnimo::getPosition` (0x100036a0), which
  returns just the SETPOSITION position (`[CAnimo+0x214/0x218]`).

The position the scripts set with `SETPOSITION` is
`CAnimo::SetGlobalPosition` (0x10005e90): `[0x214] = x - anchor.x`.
`GETCURRFRAMEPOSX/Y` (0x1003ad80/0x1003adc0) call
`CAnimo::getCurrFramePosition` (0x1000c7d0) -> `CFrame::GetPosition`
(0x10003550) — only the current image's own x/y offset (no frame dx/dy);
both return 0 when no frame has been set.

The other graphic runners (IMAGE 0x10076d60, TEXT 0x100af2c0,
VIRTUALGRAPHICSOBJECT 0x100bb8b0) always call vtable +0xd8, the plain
position, regardless of arguments.

Collision scripts depend on this: `16_SpaceInvaders/BEHBURAKMOVE` samples
`GETGRAPHICSAT(GETPOSITIONX(), GETPOSITIONY(), FALSE, 201, 201, TRUE)` and
`S33_Meteory/BETICK` derives a probe point as
`GETPOSITIONX() - GETCURRFRAMEPOSX()`.

## Not yet verified

- MATRIX (native minigame helper, used by one scene).
- STATICFILTER / FILTER.
- Text rendering with bitmap fonts.
