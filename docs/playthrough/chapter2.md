# Chapter 2 walkthrough

Session port used: 7111. All steps are `node tools/session.ts 7111 <steps>`.

Chapter 2 starts in S14_3_PODWORKO (reached from the end of chapter 1, or from
the menu with VARROZDZIAL2=1 / VARLEVEL2 set). The goal is to build the rocket
in the workshop (S21_0_WARSZTAT) from junk collected around the farm.

Menu entry (verified): with VARROZDZIAL2=1 and the pawn on a later chapter,
`clickname:BUTTONROZDZIAL2` fails `CONDGOTOROZDZIAL`, so the menu runs
BEHRESETROZDZIAL2 (this empties the inventory and the rocket and resets the
intros) and goes to S14_3_PODWORKO.

```
goto:scene=MENUGLOWNE&speed=4
wait:2500
clickname:BUTTONROZDZIAL2
```

## How the build works

- Clicking an item in a scene (`ANIMO<ITEM>`, `BEHADDITEMTOMENU`) puts it in
  the inventory bar (`ARRAYWARSZTATMENUPRZEDMIOTY`, max 6, persisted to INI).
- In the workshop, clicking an inventory icon (`ANIMOMENU_<ITEM>`) adds it to
  the rocket (`ARRAYWARSZTATPRZEDMIOTY`) only when all its prerequisites
  (`ARRAYTEMP`) are already built in; otherwise the rooster says ERROR and the
  item stays in the bar.
- Prerequisites (s21_0_Warsztat.cnv ANIMOMENU_*:ONCLICK):
  - WIADRO, KONEWKA, DOPALACZ: none
  - PRALKA: WIADRO + KONEWKA + DOPALACZ
  - MLYNEK, GRABIE, WIOSLO, NOGA, RAMIE, BALIA: PRALKA
  - CHOMIK: MLYNEK; PRZETYKACZKA: GRABIE
  - RYNNA, ANTENA, PIECYK: BALIA
  - LEJEK, LAMPKA: PIECYK
  - LINA: all 16 above -> `CONDPLAYSUCCESS` -> KONIECBUDOWY -> FINAL1..3 ->
    S23_0_SALUT
- Item locations:
  - Podworko (yard): KONEWKA, BALIA, WIOSLO, ANTENA, LEJEK, CHOMIK.
  - Kurnik (S15_1): WIADRO, DOPALACZ, GRABIE, MLYNEK, NOGA, PRZETYKACZKA, RAMIE.
  - Warsztat (workshop): PRALKA, PIECYK, RYNNA, LINA.
  - Buda (S12_1): LAMPKA.
  - Decoys: BECZKA, OPONA, KOTWICA, TRANZYSTOR, BUTELKA.
- CHOMIK (hamster) in the yard is only clickable while its CHOMIK run
  animation plays on scene entry (~7 s at speed=1, under 2 s at speed=4). Afterwards it
  rests off-screen at x=802.

## S14_3_PODWORKO, first visit

The rooster intro plays (`CONDKOGUTENTRE`, mouse disabled until SEQKOGUT ODRAZU
ends).

```
wait:8000
clickname:ANIMOKONEWKA
wait:1500
clickname:BUTTONKURNIK
waitscene:S15_1_KURNIK,30000
wait:3000
```

## S15_1_KURNIK, trip 1

```
clickname:ANIMOWIADRO
wait:1500
clickname:ANIMODOPALACZ
wait:1500
clickname:ANIMOGRABIE
wait:1500
clickname:ANIMOMLYNEK
wait:1500
clickname:ANIMONOGA
wait:1500
clickname:BUTTONPODWORKO
waitscene:S14_3_PODWORKO,30000
wait:3000
clickname:BUTTONWARSZTAT
waitscene:S21_0_WARSZTAT,30000
```

## S21_0_WARSZTAT, build 1

The rooster's ENTRE speech plays on the first visit. Clicking MLYNEK before PRALKA
is built gives the ERROR line, and the item stays in the bar. This was checked.

The stove (ANIMOPIECYK) sits under the rooster. BUTTONKOGUT uses
GFXSTANDARD=ANIMOKOGUT, and its bounding box covers most of the stove, so
`state` does not list ANIMOPIECYK. Click its uncovered bottom edge at 700,590.

```
wait:8000
clickname:ANIMOMENU_WIADRO
wait:3000
clickname:ANIMOMENU_KONEWKA
wait:3000
clickname:ANIMOMENU_DOPALACZ
wait:3000
clickname:ANIMOPRALKA
wait:2500
clickname:ANIMOMENU_PRALKA
wait:3500
clickname:ANIMOMENU_MLYNEK
wait:3500
clickname:ANIMOMENU_GRABIE
wait:3500
clickname:ANIMOMENU_NOGA
wait:3500
click:700,590            (PIECYK)
wait:2500
clickname:ANIMORYNNA
wait:2000
clickname:BUTTONPODWORKO
waitscene:S14_3_PODWORKO
wait:2500
```

Bug found here, now fixed: used inventory icons reappeared in the bar, because
ONFOCUSOFF was played on a hidden, non-button animo when the mouse left it.
Reported and fixed in the next build.

## S14_3_PODWORKO, trip 2

```
clickname:ANIMOBALIA
wait:1500
clickname:ANIMOWIOSLO
wait:1500
clickname:ANIMOANTENA
wait:1500
clickname:BUTTONWARSZTAT
waitscene:S21_0_WARSZTAT
wait:3000
clickname:ANIMOMENU_BALIA
wait:3000
clickname:ANIMOMENU_WIOSLO
wait:3000
clickname:ANIMOMENU_ANTENA
wait:3000
clickname:ANIMOMENU_RYNNA
wait:3000
clickname:ANIMOMENU_PIECYK
wait:3000
```

## Trip 3: hamster, funnel, kurnik, buda

Reload at speed=1 so the hamster can be caught as it runs in. The inventory and
the rocket are kept in the INI.

```
goto:scene=S21_0_WARSZTAT&speed=1
wait:3000
clickname:BUTTONPODWORKO
waitscene:S14_3_PODWORKO
wait:1500
clickname:ANIMOCHOMIK          (while it runs, about 263,531)
wait:1500
clickname:ANIMOLEJEK
wait:2500
clickname:BUTTONKURNIK
waitscene:S15_1_KURNIK
wait:3000
clickname:ANIMOPRZETYKACZKA
wait:2500
clickname:ANIMORAMIE
wait:2500
clickname:BUTTONPODWORKO
waitscene:S14_3_PODWORKO
wait:4000
clickname:BUTTONBUDA
waitscene:S12_1_BUDA
wait:3000
clickname:ANIMOLAMPKA
wait:2500
clickname:BUTTONPODWORKO
waitscene:S14_3_PODWORKO
wait:4000
clickname:BUTTONWARSZTAT
waitscene:S21_0_WARSZTAT
wait:4000
clickname:ANIMOMENU_CHOMIK
wait:4000
clickname:ANIMOMENU_LEJEK
wait:4000
clickname:ANIMOMENU_PRZETYKACZKA
wait:4000
clickname:ANIMOMENU_RAMIE
wait:4000
clickname:ANIMOMENU_LAMPKA
wait:4000
```

Rocket now: WIADRO, KONEWKA, DOPALACZ, PRALKA, MLYNEK, GRABIE, NOGA, BALIA,
WIOSLO, ANTENA, RYNNA, PIECYK, CHOMIK, LEJEK, PRZETYKACZKA, RAMIE, LAMPKA.

Note: `ANIMO ANIMOREKSIO: no event 0/1` is logged on every pickup.
`ANIMOREKSIO^PLAY(RANDOM^GET(0,2))` names an event that does not exist, and
PLAY has no numeric fallback (docs/object-semantics.md). This is script data
and harmless.

## S21_0_WARSZTAT, finishing the rocket

```
clickname:ANIMOLINA
wait:2500
clickname:ANIMOMENU_LINA
waitscene:S23_0_SALUT,110000
```

LINA (rope) completes the rocket. `CONDPLAYSUCCESS` plays KONIECBUDOWY with
the mouse disabled, then rooster FINAL1, mole WCHODZI, FINAL2, mole
POKOGUTFINAL2, and FINAL3EXIT, which goes to S23_0_SALUT.

## S23_0_SALUT (cutscene)

The door animation (WCHODZA 1/2) plays and Reksio and the mole salute. TIMER1
(12 s) plays KOG14_4_1, and when it finishes the game goes to S14_4_STARTRAKIETY.

```
waitscene:S14_4_STARTRAKIETY,100000
```

## S14_4_STARTRAKIETY (cutscene)

The rooster's countdown lines run KOGUT1..4, then the smoke and the rocket
launch. When KOG14_4_5 finishes, the game goes to S24_0_CHMURY.

```
waitscene:S24_0_CHMURY,110000
```

## S24_0_CHMURY (cutscene, chapter end)

The rocket flies through the clouds. RAKIETA:ONFINISHED runs `DO31`:
`VARROZDZIAL3^SET(1);BEHRESETROZDZIAL3^RUN();PRZYGODA^GOTO("S31_0_ZIEMIA")`.
This is the end of chapter 2. (`CONDKONTROLA` -> "KO" is never checked in
this scene.)

```
waitscene:S31_0_ZIEMIA,110000
eval:engine.find("VARROZDZIAL3").value.v      -> 1
```

Result: chapter 2 completed with no eval forcing. The whole chapter was played
at speed=1 from trip 3 onwards. The earlier parts were played at speed=4.
