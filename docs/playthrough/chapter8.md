# Chapter 8 walkthrough

Session port used: 7114. All steps are `node tools/session.ts 7114 <steps>`.

Entry: I arrived at S82_DOK straight from the end of chapter 7
(S74_LOTNAJAJO_3 `DODOK` sets VARROZDZIAL8=1 and runs BEHRESETROZDZIAL8).
From the menu: unlock VARROZDZIAL8 (see chapter7.md, set both ini and the
variable object) and `clickname:BUTTONROZDZIAL8`.

## S82_DOK (teapot-ship lands in the dock)

Goal: watch the landing, then leave right.

```
wait:5000
clickname:BUT_EXIT
waitscene:S83_LABIRYNT,30000
```

## S83_LABIRYNT (bridge maze, curator patrolling)

Goal: walk Reksio over the bridges to the key cabinet (bridge 21, entered
at end A), then to the door (bridge 22, entered at end B). Each stop shows
two buttons BUT_<bridge>A / BUT_<bridge>B. The joint table (BEH_JOINTS_INIT)
gives these moves (pass-through bridges 4, 7, 10, 14, 17 in brackets):

| from | A → | B → |
|---|---|---|
| 5 (start) | 2 | 3 |
| 2 | 3 | 1 |
| 1 | 6 | [10] → 12 |
| 12 | 16 | 13 |
| 16 | [17] → 18 | 15 |
| 18 | 19 | 20 |
| 20 | 21 (key) | 13 |
| 21 | 11 | – |
| 11 | 1 | 12 |
| 6 | 9 | 8 |
| 9 | 22 (door) | 8 |

The curator (ENEMY) loops bridges 20, 13, 14, 16, 15, 18 (71/81/51/81/120/101
frames). He catches you (→ S88_0_KURATOR) only when on the same bridge and
the boxes overlap. Leaving 12 by A just as he enters 15 puts Reksio on 16
after he left and on 18 just after he left it.

```
eval:new Promise(r=>{let seen16=false;const t=setInterval(()=>{const v=engine.find("I_ENEMY_CURR_BRIDGE").value.v;if(v===16)seen16=true;if(seen16&&v===15){clearInterval(t);r("e="+v)}},5)})
```

Full run (W = wait until HERO stops playing:
`eval:new Promise(r=>{const t=setInterval(()=>{const h=engine.find("HERO");if(!h||!h.playing){clearInterval(t);r(1)}},5)})`):

```
clickname:BUT_5A   W
clickname:BUT_2B   W
clickname:BUT_1B   W          # via 10 to 12
<enemy-on-15 wait above>
clickname:BUT_12A  W
clickname:BUT_16A  W          # via 17 to 18
clickname:BUT_18B  W
clickname:BUT_20A  W          # 21AI → KEY_YES, B_HERO_HAS_KEY=TRUE
clickname:BUT_21A  W
clickname:BUT_11A  W
clickname:BUT_1A   W
clickname:BUT_6A   W
clickname:BUT_9A   W          # 22BI → DOOR_YES → bridge opens → DOOR_YES2
waitscene:S84_MOSTEK,30000
```

Notes: no bugs. (The BUT_<n>A/B enable code reads ARR_JOINTS^GET(1)/GET(3)
— constant indices, an original-script quirk — so both buttons always show.)

## S84_MOSTEK, first visit (VARMOSTEK=0)

Goal: none; Reksio walks to the bridge computer (WERSJA0 → REKSPOCHYLASIE),
narrator → S85_SLONCE.

```
waitscene:S85_SLONCE,60000
```

## S85_SLONCE (space billiards: shoot the egg into the sun)

Goal: the egg (bottom-left) must touch the sun in the top-right corner
(CONDSUN, GETGRAPHICSAT finds ANNSUN at the probe point 10 px ahead of the
egg). Controls (checked per ANNSTIMER frame, 30 fps): Left/Right rotate the
aim 2° per frame (VARDPOWANGLE, positive = downwards), Up adds 0.5 power
(max 9), Down removes 1, Space fires with speed = 2×power, friction 0.15
per frame. The large planet blocks every direct line, so bank off the
bottom wall: angle +34°, power ≈8.5. (Simulated window: +32..+34° at power
9, +32..+36° at 8, +30..+34° at 7.)

Input-only helper (`docs/playthrough/chapter8-s85-shot.js`) presses the
keys until VARDPOWANGLE/VARDPOWER reach the targets, then Space:

```
wait:8000                         # narration + KOM1, then the aim timer runs
eval:window.__ang=34;window.__pow=8.2;1
eval:<contents of docs/playthrough/chapter8-s85-shot.js>
waitscene:S84_MOSTEK,40000        # win → SNDKOM4, NARR3, NARR4 → VARMOSTEK=1
```

Notes: no bugs; hit on the first shot (fired at angle 34, power 8.5).

## S84_MOSTEK, second visit (VARMOSTEK=1)

Goal: none; long cutscene (curator attacks, Kretes arrives with the rocket,
final dialogue) → KRETES84 1FINAL6 → S86_JAJO. Takes ~3–4 minutes at
speed=1.

```
waitscene:S86_JAJO,300000
```

## S86_JAJO (dogfight over the egg: protect the vacuum)

Goal: the AI vacuum (ANNVACUUM) flies to the 22 chickens on the egg and
sucks them up one by one; when VARINUMCHICKEN reaches 0 the fader plays
and SNDOUTRO/SNDKRE6 → `O1B` (outro). Three enemy fighters (ANNCAR1-3)
fire torpedoes at the vacuum; each hit knocks it back (BEHHITVACUUM) and
the fighters switch to the player. Reksio's ship (ANNCAR0): Up = thrust,
Left/Right = rotate (aim ARRTOANGLE turns 6°/frame), Space = fire one
projectile along the aim; a projectile hit (priority-5 graphic) destroys a
fighter, which respawns later. There is no lose condition.

Passively it still progresses but slowly (22 → 15 chickens in ~3.5 min at
speed 1). With an input-only turret helper
(`docs/playthrough/chapter8-s86-gunner.js`: rotate toward the nearest
fighter/torpedo, hold Space when within ±5°) it went 15 → 8 in one
minute.

```
wait:20000                                  # NARR1, fly-in, dialogue; VARPLAYNORMAL=1
eval:<contents of docs/playthrough/chapter8-s86-gunner.js>
eval:new Promise(r=>{const t=setInterval(()=>{if(engine.sceneName!=="S86_JAJO"){clearInterval(t);r(engine.sceneName)}},100)})
```
