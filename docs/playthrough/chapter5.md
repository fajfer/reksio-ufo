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

## S53_0_PLAT1 (platform level 1: item GUPIDULA)

Goal: pick up GUPIDULA (top-right ledge, ~694,57) and leave via the right-hand
exit (ALPHA.IMG value 56 at 780-800,180) to S54_0_WAWOZ.

Mechanics (from the script and ALPHA.IMG): the alpha map codes are 102 floor,
112 ladder, 105 rope, 89 rope top, 77 water (bites), 54 exit to S52, 56 exit to
S54. The probe point is Reksio's feet (ANIMOMASKA frame position + 19,53).
Walking moves 6 px per frame. A jump only starts from a standstill (the STOP
animation's end with UP held, plus LEFT/RIGHT for direction): about 42 px up and
roughly 80-90 px across. UP pressed mid-walk is cancelled by CONDJUMP on floors.
Spiders (ANIMOPAJAK*) patrol fixed ranges; touching one (GETGRAPHICSAT rect at
Reksio's centre) resets the level to the entrance.

I drove this at `speed=1` with a small in-page helper (`play5/bot.js`: synthetic
keydown/keyup on window, and polling `engine.find("ANIMOPIOTRUS")` x+83 / y+546
as the feet position) because the timing windows are tight. Route:

1. Walk right to x=205, hold UP: a jump lands on the ladder; climb to the floor at y=435.
2. Walk left to x=151 (second ladder). Wait until spider 4 (floor 262, x 46-184)
   is at its right end, then climb (UP, release at y<=275). Walk right to x=251.
3. Climb the ladder at x=251 to the top floor (release at y<=108).
4. Walk to x=331 (6 px taps). Spider 2 patrols 337-444. When it is moving left at x<=395,
   hold RIGHT+UP: Reksio jumps over it, lands at ~403. Release UP and keep RIGHT to x~505.
5. Hold RIGHT+UP from a standstill at 505 to jump the gap; land at ~595.
6. Walk right to ~705: GUPIDULA is picked up (menu icon appears top-left).
7. Walk back to x~600. Wait until spider 3 (floor 180, x 555-624) is moving right
   at x>=572, then walk left off the ledge and release LEFT as soon as the fall
   starts. Reksio lands at ~553,183.
8. Step left to ~541. When spider 3 is moving left at x<=611, hold RIGHT+UP:
   Reksio jumps over it, then keeps running right into the exit -> S54_0_WAWOZ.

Notes: the ANN sound reference `SFX\00rex1.wavSFX\00rex1.wav` in PIOTRUS.ANN
(bite sound) is a data defect: a missing `;` separator.

## S54_0_WAWOZ (hub)

Four exits: BUTTONPLAT_53 (back), BUTTONPLAT_55, BUTTONPLAT_57, BUTTONPLAT_59.
BEHGOTOLEVEL ignores clicks while Reksio's entry animation is playing, so wait
about 2 s after entering.

```
wait:2000
clickname:BUTTONPLAT_59
waitscene:S59_0_PLAT4
```

## S59_0_PLAT4 (items RAMBEDAL and GUPIDAMIS)

Layout (ALPHA.IMG): ropes (105) at x~182 (y 43-543), ~302 (43-475), ~466 (43-443),
~589 (43-230), each topped by 89 at y 0-43. There's a ledge at 341-449,y98 (RAMBEDAL at
367,50), a ledge at 504-633,y437, a ledge at 671-800,y436 with a ladder (749-773) up to
672-800,y256 (GUPIDAMIS at 704,209), and the exit to S510 (56) at 763-800,y176.
The bottom floor has tar (77, which halves speed) at 280-548, and the exit to S54 (54) is at the far left.
Hazards: stones KAMIEN2/3/4 fall along ropes 2/3 and at x~570 (about 6 s falling,
then a pause); spikes KOLEC1-3 fly left to right along y 58/208/368 (2.57 s flying,
2.56 s paused, all three in sync); spider PAJAK2 walks the tar at x 301-570.

Rope mechanics: UP/DOWN climb. Holding only LEFT/RIGHT on a rope jumps off
sideways (BEHSKOK is called with RUN, which skips its UP CONDITION). On a rope top (89),
LEFT/RIGHT walks off, and with the key held Reksio falls diagonally and grabs the
next rope he crosses. Release the key as soon as he grabs it, or he jumps off again.

Route (speed=1, bot helper):
1. Step to x=182, UP to grab rope 1. When the spikes go PLAY->PAUSE, climb to y=260.
   When the spike is past x 240, climb to the top (y~52, 89).
2. When stone 2 is paused or below y 260, hold RIGHT: walk off the top, fall
   diagonally, grab rope 2 at ~y 124-160, release RIGHT.
3. Climb rope 2 to y~112, then hold RIGHT: Reksio jumps onto the ledge and
   picks up RAMBEDAL (373,100).
4. On the ledge, wait for the spikes to go PLAY->PAUSE with stone 3 paused or far
   below. Hold RIGHT to walk off and grab rope 3 (~463,106), release, hold DOWN to y=420,
   then immediately hold RIGHT: Reksio jumps onto the 504-633 ledge (~565,442).
5. Step to 625, RIGHT+UP from a standstill: jump to the 671 ledge (~703,436).
6. Step to 763. When the spikes go PLAY->PAUSE, climb the ladder to y=256, then step left to
   ~725: GUPIDAMIS is picked up.
7. Getting back to the left exit is very hard (spider in the tar, stones on the
   ropes). Being bitten resets Reksio to the level entrance and keeps the
   collected items (they are saved to the INI when picked up). So the
   practical way out is to get hit, then walk left into the exit -> S54.

Engine: no bugs found here. All the hazard behaviour matched the scripts.
