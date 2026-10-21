# Chapter 1 walkthrough

Session port used: 7111. All steps are `node tools/session.ts 7111 <steps>`.

## Entry: main menu -> S12_0_WBUDZIE

Goal: start chapter 1 from the menu.

The menu's `CONDGOTOROZDZIAL` goes to `VARLEVEL1` when the pawn (ANIMOPIONEK) is
on chapter 1, so on a clean profile `VARLEVEL1` must be set (a real new game
goes through S1_0_INTRO1 / S2_0_INTRO2 `DOBUDY`, which sets VARROZDZIAL1=1, and
S12_0 sets VARLEVEL1).

```
eval:engine.ini.set("PRZYGODA","VARLEVEL1","S12_0_WBUDZIE");engine.ini.set("PRZYGODA","VARROZDZIAL1","1");1
goto:scene=MENUGLOWNE&speed=4
wait:2000
clickname:BUTTONROZDZIAL1
```

## S12_0_WBUDZIE (cutscene)

Goal: none, Reksio wakes up. `VAR_1` reaches 2 (narration 2 finished +
WSTAJE finished) -> `DOS13`.

```
waitscene:S13_1_BUDA,60000
```

## S13_1_BUDA (cutscene)

Goal: none. REKSIO PLAY finishes -> S14_0_PRZEDKOGUTEM.

```
waitscene:S14_0_PRZEDKOGUTEM,60000
```

## S14_0_PRZEDKOGUTEM

Goal: listen to the rooster, then walk left to the henhouse. `DO15` (rect
110,50-350,350) is enabled by `BEH2` after the GADAWEJSCIE sequence ends.
BUTKOGUT (click the rooster) is optional dialogue.

```
wait:8000
clickname:BUTKOGUT        (optional)
wait:3000
clickname:DO15
waitscene:S15_0_KURNIK,30000
```

Notes: warning `ANIMO KOGUT14_0: no event PANIKA_4` repeats; KOGUT14_0.ANN
has only PANIKA_START/1/2/3/STOP, the SEQ references PANIKA_4 (original data
defect, not an engine bug).

## S15_0_KURNIK

Goal: pick a weapon for the space-invaders game. BUTTONGRABIE (rake) is a gag.
BUTTONWIADRO (bucket, VARSPACEINVADERSBRON=1) is the losing choice: the first
throw (THROW1) or hit plays SNDPOMYJE and returns to S15_0. BUTTONBURAKI
(beetroots, VARSPACEINVADERSBRON=0) is the correct choice.

```
clickname:BUTTONGRABIE    (optional gag)
wait:4000
clickname:BUTTONBURAKI
waitscene:S16_SPACEINVADERS,40000
```

Verified: choosing the bucket and clicking once in S16 returns to S15_0_KURNIK.

## S16_SPACEINVADERS (minigame)

Goal: hit UFOs with beetroots until `VARLICZBAZESTRZELEN` (starts at 20) reaches
0 -> Reksio plays SUCCESS -> SNDSUCCESS -> S14_1_PRZEDKOGUTEM. Every hen
abducted (ANIMOKURAn WSYSANA finishes) adds 4 to the counter. Controls: Reksio
follows the mouse X (`BEHREKSIOMOVE`, 11 px/frame only while in the IDLE
event, so he cannot move during a throw); a click anywhere throws
(`MOUSE:ONCLICK=BEHREKSIOFIRE`) when no beet is in the air. Being hit by a
green UFO shot (FAILED1) returns to S15_0_KURNIK, where you pick BURAKI again.

Played for real with a bot that reads UFO/shot positions via `eval` (read
only) and steers with real `move:`/`click:` steps:
`/tmp/claude-1000/-home-fajfer-reksio-rewrite/093e0472-c2b1-4c14-bda3-481c98a2d8ee/scratchpad/play1/invaders.mjs`
(POSTs to the session daemon on 7111; leads moving UFOs, dodges shots, never
throws with a shot nearby, re-clicks BUTTONBURAKI after a loss). Best at
`speed=1`. It won on attempt 6 (~3 minutes total).

```
goto:scene=S15_0_KURNIK&speed=1     (if entering the minigame for the bot)
wait:3000
clickname:BUTTONBURAKI
waitscene:S16_SPACEINVADERS,60000
# then: node play1/invaders.mjs 580000   -> ends at S14_1_PRZEDKOGUTEM
```

Notes: `FONT FNTARIAL: ARIAL14.FNT missing` (the file is not in the game
data; TEXTDEBUG is off-screen anyway). On the build before the
GETPOSITIONX/Y fix no beet ever registered a hit (BEHBURAKMOVE probes
`GETGRAPHICSAT(ANIMOBURAK^GETPOSITIONX(), ...)`); fixed in the current build.

## S14_1_PRZEDKOGUTEM (cutscene)

Goal: none. Rooster, Mole and Reksio dialogue driven by three SEQUENCEs
(KOG14_1, KRET14_1, REX14_1); KOG14_1 `EXIT` finishing -> S14_2_PRZEDKOGUTEM.

```
waitscene:S14_2_PRZEDKOGUTEM,100000
```

## S14_2_PRZEDKOGUTEM (cutscene, chapter end)

Goal: none. TIMER1 (500 ms) shows the four plan pictures B1..B4 with the
rooster's lines; tick 66 runs `DOS14_3`:
`VARROZDZIAL2^SET(1);BEHRESETROZDZIAL2^RUN();PRZYGODA^GOTO("S14_3_PODWORKO")`
- this is the end of chapter 1.

```
waitscene:S14_3_PODWORKO,60000
eval:engine.find("VARROZDZIAL2").value.v      -> 1
```

Result: chapter 1 completed; VARROZDZIAL2=1 and the game is in S14_3_PODWORKO
(chapter 2 entry).

Re-verified on the latest build (with the SEQEVENT, GETPOSITIONX/Y and
animo-button fixes): menu -> S12_0 -> S13_1 -> S14_0 -> S15_0 -> S16 runs with
the steps above. The minigame was won by the bot on that build.
