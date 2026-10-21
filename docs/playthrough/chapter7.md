# Chapter 7 walkthrough

Session port used: 7114. All steps are `node tools/session.ts 7114 <steps>`.

## Unlock

```
goto:scene=MENUGLOWNE&speed=4
eval:for (const n of ["VARROZDZIAL7","VARROZDZIAL8"]) { engine.ini.set("PRZYGODA",n,"1"); engine.find(n).value.v=1; } "ok"
goto:scene=MENUGLOWNE&speed=4
```

Note: `engine.ini.set` alone did not survive the `goto` — the in-memory
TOINI variable (still 0) is written back over it on reload, so the variable
object must be set too.

Clicking `BUTTONROZDZIAL7` resets the chapter (BEHRESETROZDZIAL7) unless the
menu pawn already sits on chapter 7, in which case it resumes `VARLEVEL7`.

## S43_LRBIN (entry, VARLEVEL4XX=4)

Goal: listen to the intro (narrator, Molly, Kretes), then go down to the cellar.

```
clickname:BUTTONROZDZIAL7
wait:15000
clickname:BTNDOPIWNICY
waitscene:S46_ODKURZACZ,20000
```

Notes: only BTNDOPIWNICY / BTNOBRAZKI are enabled after the intro
(BEHENABLEBUTTONS4). Bug found here: SEQEVENT letter indices (A=10...) were
not parsed, so the 4ENTRE* dialogue was skipped — fixed by coordinator.

## S46_ODKURZACZ (cellar, Jean-Paul's workshop)

Goal: after Jean-Paul's intro, give the lebiodka (pigweed) to the vacuum
machine, then go back up.

```
wait:11000                 # 2ENTRE1..5 dialogue, enables BTNLEBIO
clickname:BTNLEBIO
wait:20000                 # 2LEBIODKA / 2ODKURZACZ dialogue, enables BTNDO43
clickname:BTNDO43
waitscene:S43_LRBIN,20000
```

## S43_LRBIN (second entry, VARSECENTRY=1)

Goal: after Molly's "4ODKSUKCES" line, leave through the door on the left.

```
wait:10000
clickname:BTNWYJSCIE
waitscene:S71_DROGA,30000
```

## S71_DROGA (top-down walk past the UFO chickens)

Goal: walk Reksio (starts at 736,288) left until x < 32 (CONDSUCCESS →
S72_0_BRAMA). Contact with a chicken (ISNEAR) sends you to S76 (caught).
Controls: arrow keys, 4 px per animation frame (20 fps).

The 13 chickens each loop a 48/49-frame circle (CW/CCW, ~143x138 px swept
box); with the (now DLL-verified) ISNEAR overlap test the field is too
dense for a blind `hold:`. A straight `hold:ArrowLeft` gets caught within
a second. I drove it with an in-page *input-only* autopilot
(`docs/playthrough/chapter7-s71-autopilot.js`): it predicts every chicken's
box from its current ANN frame/accumulator, runs a time-expanded BFS over
Reksio positions (4 px grid, 50 ms steps, wall map from IMGALPHA alpha 38,
6 px safety margin), and presses arrow keys via synthetic keydown/keyup.
It does not touch game state. Replans every 400 ms.

```
wait:5000
eval:window.__pmargin=6;1
eval:<contents of docs/playthrough/chapter7-s71-autopilot.js>
waitscene:S72_0_BRAMA,60000
```

Works at speed=4 too, but I ran it at speed=1
(`goto:scene=S71_DROGA&speed=1`) for timer resolution. If caught, S76
plays and returns to S71; just re-run the autopilot eval.

Notes: bugs found here and fixed by the coordinator: ANIMO ISPLAYING("LEFT")
ignored its argument (Reksio could never start walking), and ISNEAR used
centre distance (chickens could never catch you). Re-verified after the
rebuild with no monkey-patches: collisions send you to S76, the autopilot
reaches S72.

## S72_0_BRAMA (gate, VAR_BRAMA=1)

Goal: open the gate with the keypad. The narrator intro enables the
KALKULATOR animo as a button.

```
wait:8000
clickname:KALKULATOR
waitscene:S73_0_KOD,10000
```

## S73_0_KOD (keypad)

Goal: type the code 2288 and confirm (B_CHECK compares VAR_KOD with "2288",
s73_0_kod.cnv:492). Win sets VAR_BRAMA=3 and returns to S72, where the gate
opens (V_ETAP ONCHANGED^3 → B_OPEN), Reksio walks through, gate closes →
S75_PORT.

```
wait:8000
clickname:BUT_2
clickname:BUT_2
clickname:BUT_8
clickname:BUT_8
clickname:BUT_TAK
waitscene:S75_PORT,30000
```

Notes: the keypad buttons use `RECT=<image name>`; the build I started on
did not support that (no hotspots); the coordinator's fix was already in the
rebuilt bundle after a `goto:scene=S73_0_KOD&speed=4`.

## S75_PORT (sneak past the two chicken guards)

Goal: make both parrots say their "X1" line, which sends both guard
chickens (Teresa and Krysia) over to the parrots (KURALEWA/KURAPRAWA
PAPUGASTART → PAPUGAGO, V_PP++ each). Then click the arrow: Reksio stands
up and runs (WSTAJE+BIEG1, 40 frames); at the end C_END1 needs V_PP=2,
else you are caught (S76). Each parrot click plays line X<VAR_GADAx> and
increments it (5 wraps to 1); VAR_GADAL/P start random 1..4, so click a
parrot (waiting for its button to come back) until its counter is 1.

```
wait:6000
eval:JSON.stringify([engine.find("VAR_GADAL").value.v, engine.find("VAR_GADAP").value.v])
# click BUT_PL / BUT_PP (one at a time, waiting until .enabled again) until both are 1
clickname:BUT_PL
clickname:BUT_PP
wait:6000                       # V_PP becomes 2 ~5 s after the clicks (speed 4) and stays 2 for ~6 s
clickname:BUT_STRZ
waitscene:S74_LOTNAJAJO_1,30000
```

Notes: no bugs. The run that worked: VAR_GADAL=1, VAR_GADAP=2 on entry →
3 extra clicks on BUT_PP; a trial X1+X1 showed the V_PP=2 window at
5.1 s–11.1 s.

## S74_LOTNAJAJO_1 / _2 / _3 (cutscenes: flight to the egg)

Goal: none; three teapot-ship cutscenes chain automatically. At the end
of _3 `DODOK` sets VARROZDZIAL8=1 and goes to S82_DOK — **end of chapter 7**.

```
waitscene:S82_DOK,60000
eval:engine.find("VARROZDZIAL8").value.v     # 1
```

## Summary

Chapter 7 completes in the port. Only forced/assisted part: S71_DROGA was
driven by the input-only autopilot (synthetic arrow keys), not by state
changes. Bugs found and fixed during the run: SEQEVENT letter indices,
ANIMO ISPLAYING(event), ISNEAR semantics, BUTTON RECT=<object>.
