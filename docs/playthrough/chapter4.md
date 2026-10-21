# Chapter 4 walkthrough

Session port used: 7112. Chapter entry `S41_0_CRASH` (menu button
`BUTTONROZDZIAL4`, or the end of chapter 3). The chapter ends when
`S34_PRZELOT_A` runs `BEH1` (`VARROZDZIAL5^SET(1)`), reached from
`S42_1_SKLADZIK`.

## Setup

Either finish chapter 3, or:

```
eval:engine.ini.set("PRZYGODA","VARROZDZIAL4","1");1
goto:scene=MENUGLOWNE&speed=4
clickname:BUTTONROZDZIAL4
```

(This run arrived from the end of chapter 3: `DOCRASH` sets
`VARROZDZIAL4=1`, runs `BEHRESETROZDZIAL4` and goes to `S41_0_CRASH`.)

## S41_0_CRASH (cutscene)

Goal: none. The rocket crashes on the Kurator's planet; after Kret's line
`KRE41_0_3`, `DOKRABIKA` goes to `S42_0_SKLADZIK`.

```
waitscene:S42_0_SKLADZIK,120000
```

## S42_0_SKLADZIK (Rube Goldberg puzzle in the junk store)

Goal: switch the contraptions (each `BUTTON<X>` toggles `ANIMO<X>` between
events `A` and `B`, all start on `B`) so that Kret, then the crab robot
(Krabik), then the hamster (Chomik) run through the machine and the plank
(`DESKA`) finally drops Reksio (`ANIMOREKSIO` `SPADA` → `SNDSUCCESS` →
`WYCHODZI` → `GOTO("S43_LRBIN")`).

Each character's `ONFINISHED^<ev>` runs
`BEHONFINISHEDEVENT(self, contraption, evIfA, evIfNotA)`. Route used:

1. Kret: `1B` → (RYNNA B) `1A` → (RAMIE A) `6A` → `7A` → (PIECYK A) `9B` →
   Kret leaves, Krabik appears (`0` → `7B`).
2. Krabik: `7B` → (RAMIE B) `8A` → `10A` → washing machine `PRALKA` = A
   (needed to start the hamster).
3. Krabik: `7A`/`9` → `7B` → (RAMIE A) `6B` → `1B` → (RYNNA A) `4A` → `5`
   (sparks `ISKRY` = A). Set RYNNA back to B while Krabik is in `5` so he
   stays there and the sparks stay on (needed to scare the fox).
4. Hamster starts when `PRALKA`+`KLAPA1` events are "AA" (`BEHSTARTCHOMIK`).
   `1B` → (KLAPA2 A) `KLAPA12` → `2A` → `3A` → (KLAPA3 B) `PRZED_MLYNKIEM` →
   (MLYNEK A) `5A` → `6A` → (DESKA B) `7` (watering can falls, DESKA = A) →
   `6B`/`6A` loop while MLYNEK is A.
5. Set KLAPA3 = A, then MLYNEK = B: `6B` → `5B` → (KLAPA3 A) `4B` →
   `KLAPA34` → (KLAPA4 A) `8A` → `9A` → fox `POJAWIA1` → (ISKRY2 A)
   `PIESCI1` → hamster `10A` → `13A` → (WIOSLO A) `14A` → (DESKA A) `15` →
   Reksio falls → `S43_LRBIN`.

Buttons are disabled while the character is in the matching transition, so
the clicks wait for the right event. Event state can be read with:

```
eval:["ANIMOKRET","ANIMOKRABIK","ANIMOCHOMIK","ANIMOLIS","ANIMORAMIE","ANIMOPIECYK","ANIMORYNNA","ANIMOPRALKA","ANIMOKLAPA1","ANIMOKLAPA2","ANIMOKLAPA3","ANIMOKLAPA4","ANIMOMLYNEK","ANIMODESKA","ANIMOWIOSLO","ANIMOISKRY2"].map(n=>n.slice(5)+"="+engine.find(n).call("GETEVENTNAME",[],{self:null,params:[]}).v).join(" ")
```

Steps (speed=4; "wait for X" = poll the eval above):

```
clickname:BUTTONRAMIE            (RAMIE=A)
clickname:BUTTONPIECYK           (PIECYK=A)
  wait for KRABIK=7B
clickname:BUTTONRAMIE            (RAMIE=B)
  wait for KRABIK=10B            (PRALKA=A now)
clickname:BUTTONRYNNA            (RYNNA=A)
  wait for KRABIK=7A or 9
clickname:BUTTONRAMIE            (RAMIE=A)
  wait for KRABIK=5
clickname:BUTTONRYNNA            (RYNNA=B, ISKRY2=A)
clickname:BUTTONKLAPA2
clickname:BUTTONMLYNEK
clickname:BUTTONKLAPA4
clickname:BUTTONWIOSLO
clickname:BUTTONKLAPA1           (hamster starts)
  wait for DESKA=A               (hamster passed the mill and the plank)
clickname:BUTTONKLAPA3           (KLAPA3=A)
  wait for CHOMIK=6A or 6B
clickname:BUTTONMLYNEK           (MLYNEK=B)
waitscene:S43_LRBIN,90000
```

Played for real, no eval forcing (on the fixed build).

Engine bug found here (fixed by the coordinator): handler-form behaviour
arguments like `BEHONFINISHEDEVENT("ANIMOKRET","ANIMORYNNA","4A","1A")`
lost their quotes and `"1A"` became the integer 1 ("ANIMO ANIMOKRET: no
event 1"), so Kret froze on `1B`. Re-verified on the rebuilt preview.

Warning `ANIMO ANIMOKONEWKA: no event B` (`ANIMOKONEWKA:ONINIT` plays "B",
which `KONEWKA` does not have) looks like an original-data defect; harmless.

## S43_LRBIN, first visit (hub, `VARLEVEL4XX`=0)

Goal: none; the entry dialogue plays (Reksio, Kret, Molly: `0ENTRE1`..`0ENTRE6`)
and `SEQMOLLY` `0ENTRE6` finished → `GOTO("S47_0_MILOSC")`.

The hub is driven by `VARLEVEL4XX` (0 first visit, 1 after S47, 2 after the
cell S45, 3/4 in later chapters): `BEHINITSCHEME<n>` / `BEHENABLEBUTTONS<n>`.
Most hotspots (`BTNKURATOR`, `BTNCZE`, `BTNINDOR`, `BTNKRETES`, ...) are
optional talk lines.

```
waitscene:S47_0_MILOSC,120000
```

## S47_0_MILOSC (cutscene)

Goal: none. Kret and Molly's love scene; `__INIT__` sets `VARLEVEL4XX=1`,
and when `VAR_1` reaches 9 `BEHEXIT` returns to `S43_LRBIN`.

```
waitscene:S43_LRBIN,120000
```

Engine bug found here (fixed by the coordinator):
`CANVASOBSERVER^SETBACKGROUND("BKG2")` (BKG2..BKG5 are IMAGE objects)
was looked up as a file → "Missing background BKG2..5", background never
changed. Flow was not blocked. Re-verified on the rebuilt preview: no warnings.

## S43_LRBIN, second visit (`VARLEVEL4XX`=1)

Goal: open the hole in the floor. Clicking the hole (`BTNDZIURA`) plays
the Kret/Molly dialogue `1DZIURA1..4`, which sets `VARDZIURA=1` and swaps in
`BTNDODZIURY` (same rect) leading to the tunnel-digging game.

```
clickname:BTNDZIURA
  (wait ~20 s until BTNDODZIURY is in `hotspots`)
clickname:BTNDODZIURY
waitscene:S44_511_PODKOP
```

## S44_511_PODKOP (minigame: Boulder-Dash-style tunnel digging, levels 1 and 2)

Goal: steer Kret (`ANN_MOLE`, matrix code 99) through the `MAT` grid
(20×11 cells, 40 px) to the exit tile (code 9). Codes: 0 empty, 1 ground,
2 stone (falls into empty cells, kills the mole/enemies it lands on),
3 dynamite (pick up by walking onto it; `Space` lights one at the mole's
cell, 3×3 explosion after ~40 burn ticks, destroys weak walls 4, ground,
stones, enemies, the mole), 4 weak wall, 5 enemy (wall-following, walks on
empty cells and into the mole), 6 strong wall. Arrow keys move one cell;
entering the exit and two more mole ticks (`IEXIT`=4) runs `BEHSUCCES` →
`SNDSUCCESS` → `BEHEXIT` → `I_PODKOP_LEVEL=IOUTLEVEL` and
`GOTO(SEXITSCENE)`: level 1 → `S44_511_PODKOP` level 2, level 2 →
`S45_0_CELA`. `BUT_PAUSE` restarts the level.

Level 1 (exit at row 7 col 0 behind weak wall (7,1)), level 2 (exit at
row 0 col 1 behind weak walls (1,1),(2,1)). Grid dump:

```
eval:(()=>{const m=engine.find("MAT").model;const ch={0:".",1:":",2:"O",3:"D",4:"#",5:"E",6:"X",7:"*",8:"!",9:"G",99:"M"};let s="";for(let y=0;y<m.height;y++){let r="";for(let x=0;x<m.width;x++)r+=(ch[m.code[y*m.width+x]]??"?");s+=r+"\n";}return s})()
```

Tested for real on level 1 with an in-page step helper (dispatches one
arrow keydown, waits for `I_MOLE_FIELD_NEXT` to change, releases):
digging, picking up dynamite at (9,18) (route `DDDDDLLDDRR` from the
start), blowing the weak wall (4,15) (`Space`, then `DDDR` to get clear),
falling stones and enemy contact (Kret dies, `DEAD` + `SNDFAIL`) all behave
as the script describes. The rest of the level needs a long real-time
puzzle through three wall-following enemies (they follow any tunnel you dig
next to their area), so **both levels were forced** with:

```
eval:engine.runHandler("BEHSUCCES",null,[]);1      (level 1 → level 2)
waitscene:S44_511_PODKOP
eval:engine.runHandler("BEHSUCCES",null,[]);1      (level 2 → S45)
waitscene:S45_0_CELA,60000
```

(`BEHSUCCES` is exactly what the script runs when Kret reaches the exit.)
No engine bugs seen here.

## S45_0_CELA (cutscene)

Goal: none. Kret meets Jean-Paul and the other moles in the cell; after
`NARR45_0_1` `DOSALONU` sets `VARLEVEL4XX=2` and returns to `S43_LRBIN`.

```
waitscene:S43_LRBIN,180000
```

## S43_LRBIN, third visit (`VARLEVEL4XX`=2) and S42_1_SKLADZIK

Goal: repair the rocket with the file (`VARPILNIK` 0→1→2→3→4) and take
off.

1. Door (`BTNDODRZWI`) → `S42_1_SKLADZIK`: `CONDSETPILNIK` sets
   `VARPILNIK=1` and Kretie asks for a file (`1KLIK_A`). Go back
   (`BTNDO43`, sets `VARSECENTRY=2`).
2. In the hub click the bread rolls (`BTNCHLEBIKI`, `BEHBULKICLICK1`):
   `VARPILNIK=2` (Reksio gets the file).
3. Optional: cellar (`BTNDOPIWNICY` → `S46_ODKURZACZ`, dialogue only at
   this stage, `BTNDO43` back; sets `VARLEVEL46=1`, `VARSECENTRY=1`).
4. Door again → `S42_1_SKLADZIK`: click the file (`BTNPILNIK`, rocket
   repaired, `VARNAPRAWIONY=1`, `VARPILNIK=3`), click Kretie twice
   (`BTNKRETIE`: `2MAINKLIK_A` → `VARPILNIK=4`, then `2MAINKLIK_B1` → Kret
   walks in → `2MAINKLIK_B4` enables `BTNTOROCKET`), click the rocket
   (`BEHROCKET2`: `VARLEVEL4XX=3`, `VARPRZELOT=1`, `BEHRESETROZDZIAL5`,
   `GOTO("S34_PRZELOT_A")`).

```
  (wait until BTNDODRZWI is in `hotspots`)
clickname:BTNDODRZWI
waitscene:S42_1_SKLADZIK
wait:3000
clickname:BTNDO43
waitscene:S43_LRBIN
  (wait until BTNCHLEBIKI is in `hotspots`)
clickname:BTNCHLEBIKI
  (optional) clickname:BTNDOPIWNICY / waitscene:S46_ODKURZACZ / wait for BTNDO43 / clickname:BTNDO43
  (wait until BTNDODRZWI is in `hotspots`)
clickname:BTNDODRZWI
waitscene:S42_1_SKLADZIK
clickname:BTNPILNIK
  (wait for BTNKRETIE) clickname:BTNKRETIE
  (wait for BTNKRETIE) clickname:BTNKRETIE
  (wait for BTNTOROCKET) clickname:BTNTOROCKET
waitscene:S34_PRZELOT_A
eval:engine.find("VARROZDZIAL5").value.v      → 1
```

## S34_PRZELOT_A (chapter end)

With `VARPRZELOT=1`, `BEH1` plays `NARR34_1_1` and sets
`VARROZDZIAL5=1` (`VARLEVEL5="S34_PRZELOT_A"`); the flight continues into
`S34_PRZELOT_B` (chapter 5 content). **End of chapter 4.**

Warning `ANIMO METEOR3: no event LEWO` is a known original-data defect.
