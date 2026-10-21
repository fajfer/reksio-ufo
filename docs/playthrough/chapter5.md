# Chapter 5 walkthrough

Session steps for `node tools/session.ts <PORT> ...`. Played at `speed=4`.

Chapter flow (from scripts): S34_PRZELOT_A (VARPRZELOT=1) -> S34_PRZELOT_B ->
S34_PRZELOT_A (5) -> S51_0_INDOR -> S52_0_WIOSKA -> platform levels
(S53..S510) -> S52_1_WIOSKA -> S_GENERATOR_1 -> S_GEN2 -> S51_1_INDOR ->
S34_PRZELOT_A (2) -> S34_PRZELOT_B -> S34_PRZELOT_A (6) -> S43_LRBIN
(VARLEVEL4XX=3) -> ... -> S42_1_SKLADZIK BEHROCKET3 sets VARPRZELOT=3 and
returns to S34_PRZELOT_A, whose BEH3 sets VARROZDZIAL6 = end of chapter 5.

## Start (MENUGLOWNE -> S34_PRZELOT_A -> S34_PRZELOT_B -> S34_PRZELOT_A -> S51_0_INDOR)

Goal: unlock chapter 5 and start it. The two flight scenes are non-interactive.

```
goto:scene=MENUGLOWNE&speed=4
eval:engine.ini.set("PRZYGODA","VARROZDZIAL5","1")
goto:scene=MENUGLOWNE&speed=4
wait:4000
clickname:BUTTONROZDZIAL5
waitscene:S51_0_INDOR,90000
```

Notes: warning `ANIMO METEOR3: no event LEWO` (known data defect).

## S51_0_INDOR

Goal: walk to the village. Wait for the narration (mouse is disabled), then click the arrow.

```
wait:8000
clickname:BUTTONWIOSKA
waitscene:S52_0_WIOSKA,40000
```

## S52_0_WIOSKA (first visit)

Goal: hear Indor's story, get the LIST from Julita, then head for the platform levels.

```
wait:3000            # entry dialogue, mouse disabled
click:250,400        # Indyk (BUTTONINDYK, RECT=ANIMOINDYK) -> STORY1..3
# wait until engine.input.enabled
click:535,440        # Julita (BUTTONJULITA) -> 0JULNAKLIK1..6, adds LIST to ARRAYPLATFORMOWKAPRZEDMIOTY
# wait until engine.input.enabled
clickname:BUTTONPLAT1  # narration, Reksio walks off
waitscene:S53_0_PLAT1
```

Notes:
- BUG (reported): BUTTON with `RECT=<object name>` got no hotspot, so Indyk/Julita/Kret
  could not be clicked. Workaround used before the fix: set each such button's
  `rect` from the named object's bounds via eval (`play5/fixrect.js`).
- BUG (reported): inventory icons (ANIMOMENU_*, SETASBUTTON) stay on 0-frame
  NOEVENT and are invisible / unclickable.
