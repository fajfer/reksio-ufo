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
