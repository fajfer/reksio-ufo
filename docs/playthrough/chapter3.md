# Chapter 3 walkthrough

Session port used: 7112. Chapter entry `S31_0_ZIEMIA`; the chapter ends in
`S34_0_KURAN` (`DOCRASH`: `VARROZDZIAL4^SET(1)` + `GOTO("S41_0_CRASH")`).

Scene order: S31_0_ZIEMIA → S35_0_WRAKIECIE → S38_KALIBRACJA →
S37_0_DROGAMLECZNA → S36_0_ROBOTY → S33_METEORY → S34_0_KURAN → (S41_0_CRASH).

## Setup

```
eval:engine.ini.set("PRZYGODA","VARROZDZIAL3","1");engine.ini.set("PRZYGODA","VARROZDZIAL4","1");1
goto:scene=MENUGLOWNE&speed=4
clickname:BUTTONROZDZIAL3
```

Note: the very first `ini.set` straight after the first `goto` of a fresh
session did not stick (the menu still showed only chapter 1); repeating it
and doing `goto` again worked.

## S31_0_ZIEMIA (cutscene)

Goal: none, intro cutscene (Earth, satellite, UFO, rocket). Ends on
`KRE31_0_4` finished → `GOTO("S35_0_WRAKIECIE")`.

```
waitscene:S35_0_WRAKIECIE,90000
```

## S35_0_WRAKIECIE

Goal: after narration and Kret's line, `BUTTON2` (Kret) is enabled; clicking
it goes to the calibration minigame.

```
wait:9000
clickname:BUTTON2
waitscene:S38_KALIBRACJA
```

## S38_KALIBRACJA (minigame)

Goal: five object pairs (COMET, SATELLITE, SPUTNIK, UFO, EARTH) appear in the
left (`ANN<X>0`, events cycle 1→2→3→1) and right (`ANN<X>1`, events cycle
3→4→5→3) windows. Clicking an object advances its event. A pair is in sync
when both show event `3`; when all ten are on `3` (sums 15/15,
`CCONDTESTEND`), `SNDSUCCESS` plays and `DALEJ` goes to `S37_0_DROGAMLECZNA`.
Wait until the entry narration finishes (`VARPLAY=1`) before clicking.

The start state is random. Read it with this eval (prints `X:left/right`):

```
eval:["COMET","SATELLITE","SPUTNIK","UFO","EARTH"].map(n=>n+":"+["0","1"].map(i=>{const r=engine.find("ANN"+n+i).call("GETEVENTNAME",[],{self:null,params:[]});return r&&r.v!==undefined?r.v:JSON.stringify(r)}).join("/")).join(" ")
```

Then for each object not on 3, `clickname:ANN<X><0|1>` and re-read. The
objects fly around quickly at speed=4, so a click sometimes misses (the
object moved between the hotspot probe and the click) or hits a neighbour;
re-read after every click and repeat. A small bash loop does it:

```
for t in COMET0 COMET1 SATELLITE0 SATELLITE1 SPUTNIK0 SPUTNIK1 UFO0 UFO1 EARTH0 EARTH1; do
  # read state, stop when this object shows 3, else clickname:ANN$t, wait:250
done
```

Notes: played for real, no eval forcing.

## S37_0_DROGAMLECZNA (cutscene)

Goal: none. Rocket flies along the Milky Way road; `RAKIETA` event `ODLOT`
finished → `GOTO("S36_0_ROBOTY")`.

```
waitscene:S36_0_ROBOTY,120000
```

## S36_0_ROBOTY

Goal: after the robot's entry line (`ROBOT36` `ENTRE` finished) the robot
(`BUTTON2`, optional line) and the top-left exit `DOASTEROIDOW` are enabled.
Clicking `DOASTEROIDOW` makes the rocket leave; when both the rocket
animation and `KRE36_0_2` finish (`VAR_INC`=2), Kret says `KRE36_0_4` and the
game goes to `S33_METEORY`.

```
wait:6000
clickname:BUTTON2          (optional, robot talks)
wait:3000
clickname:DOASTEROIDOW
waitscene:S33_METEORY,60000
```

## S33_METEORY (minigame: flight through the asteroid field)

Goal: fly the ship through 15 obstacle waves (`ARLEV`) without losing all
energy (`ISHIPENERGY`, −20 per hit) or fuel (`ISHIPFUEL`, starts at 50, −8
per new wave). When the waves run out (`IOL`=0) `AENDTICK` counts `IEND`
45→0, `BSSUCCESS` plays the `SUKCES` narration and the game goes to
`S34_0_KURAN`.

Controls (`BSKEYBNRM`, 10 ms timer): `ArrowUp`/`ArrowDown` move the ship 4 px
per tick (Y range 74..430), `ArrowRight` = boost. Flying through the Egyptian
eyes (`AEYES`) reverses up/down for a while (`IREVCNT`).

Refuelling: fuel runs out after ~6 waves, so you must fly into the corn
island (`AOBJ5`, `WYSPA1_ZBOZE`). Its invisible `IMRECT` (priority 10) is the
landing zone; `BCCOL` probes the ship point (frame origin + 66,58) with
`GETGRAPHICSAT(...,FALSE,10,10)`. On a hit the ship plays `SHOW`, then
`SHOW_LOOP` and fuel climbs +1 per corn-island frame until 100.

Played for real with an in-page keyboard autopilot (it only dispatches
`keydown`/`keyup` events for ArrowUp/ArrowDown; it reads object bounds to
dodge rocks, coconuts, lightning, arrows and eyes, and steers onto
`IMRECT` when the corn island is on screen). Script:
`play3/ap.js` in the tester scratchpad; the core is reproduced here:

```
goto:scene=S33_METEORY&speed=1         (or arrive from S36)
eval:<ap.js>                            (starts a 15 ms setInterval autopilot)
waitscene:S34_0_KURAN,300000
```

Result on the final build: all 15 waves passed with energy 100, refuelled
at the corn island three times, `ISUC`=1 → `S34_0_KURAN` (about 2.5 min at
speed=1). No eval forcing of game state.

Engine bug found here (fixed by the coordinator): IMAGE `SETPOSITION` added
the IMG file offset, so the fuel/energy gauges (`IMYEL`/`IMRED`) were drawn
off-screen (x≈1400), and the corn landing zone `IMRECT` was likewise
misplaced, which made refuelling impossible. Re-verified on the new build:
gauges at x=735 and refuelling works.

Harmless warnings: `BUT_TAK`, `BUT_NIE`, `IMG_POPUP_BKG`, `BUT_PAUSE`
are referenced by `BEH_RESTART` but not defined in the scene script
(original-data defect).

## S34_0_KURAN (closing cutscene)

Goal: none. The rocket meets the Kurator's egg fighters (`JAJFAJTER*`),
is shot down (`UCIECZKA` → `TRAFIONY` → `SPADA`); after `NARR34_0_4`
`DOCRASH` sets `VARROZDZIAL4=1` and goes to `S41_0_CRASH`. **End of
chapter 3.**

```
waitscene:S41_0_CRASH,150000
eval:engine.find("VARROZDZIAL4").value.v      → 1
```

Warning `Unknown object VARFOTKASEEN` from `BEHRESETROZDZIAL4` is a known
original-data defect.
