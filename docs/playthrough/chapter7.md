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
Controls: arrow keys, 4 px per animation frame.

```
wait:5000
hold:ArrowLeft,3000
waitscene:S72_0_BRAMA,10000
```

Notes: **bug** — ANIMO ISPLAYING("LEFT") ignored its argument, so the
`@IF(VARBTEMP1 == FALSE)` guard never let Reksio start walking. Until
fixed, patch it first:

```
eval:(()=>{const a=engine.find("ANNREKSIO"); const orig=a.methods.get("ISPLAYING"); const V=orig([]).constructor; a.methods.set("ISPLAYING",(args)=>{ if(!args.length) return orig(args); const s=args[0].toStr(); const ev=a.call("GETEVENTNAME",[],{self:null,params:[]}).v; return V.bool(orig([]).v && ev.toUpperCase()===s.toUpperCase());}); return "patched"})()
```

A straight walk left at y=288 was not caught even though Reksio visibly
overlapped a chicken — ISNEAR(…,1) is implemented as centre distance <= 1
(reported as suspicious).

## S72_0_BRAMA (gate, VAR_BRAMA=1)

Goal: open the gate with the keypad. The narrator intro enables the
KALKULATOR animo as a button.

```
wait:8000
click:335,440          # KALKULATOR (clickname's probe point 326,433 did not register)
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
