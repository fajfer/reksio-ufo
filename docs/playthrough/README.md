# Playthrough testing

The goal is to play every chapter of *Reksio i UFO* from start to finish in
the web port. Along the way we record a replayable walkthrough and report
every engine bug found.

## Harness

A production build of the port is served at `http://127.0.0.1:5174/`.
Each tester runs a private persistent browser session:

```sh
node tools/session.ts serve <PORT> http://127.0.0.1:5174/ &   # once, keep running
node tools/session.ts <PORT> <step> <step> ...                 # drive it
```

### Session steps

| Step | Meaning |
|---|---|
| `goto:scene=NAME&speed=4` | Reload the page into a scene. `speed=4` runs the game clock and audio 4× faster. Add `&trace=1` to log every fired script event. |
| `state` | Current scene and the active hotspots with click points. |
| `hotspots` | Active hotspots only. |
| `clickname:NAME` | Click a hotspot by object name. |
| `click:x,y`, `move:x,y` | Mouse, in game pixels (800×600). |
| `key:ArrowLeft` | Tap a key. |
| `hold:ArrowUp,800` | Hold a key for 800 ms. Use `Space` for the space bar. |
| `wait:ms` | Wait. |
| `waitscene:NAME[,ms]` | Wait until that scene is active. |
| `shot:/abs/path.png` | Screenshot. Look at it with the Read tool. |
| `eval:<js>` | Evaluate JavaScript. `window.engine` is the running engine. |

Useful `eval` snippets:

- `engine.find("VARNAME").value.v` reads a variable.
- `engine.find("OBJ").call("SET", [], {self:null, params:[]})` calls a method;
  avoid this except to unblock yourself.
- `engine.ini.set("PRZYGODA","VARROZDZIAL3","1")` unlocks chapter 3 in the
  main menu. It persists in localStorage across `goto`.
- `engine.sceneName` is the current scene.

## Chapters

Main menu buttons go through `BEHGOTOROZDZIAL(n, scene)`; the menu sets the
right variables. Start each chapter from `MENUGLOWNE` with its
`VARROZDZIALn` unlocked, and click `BUTTONROZDZIALn`:

| Chapter | Entry | Extra vars set by the menu |
|---|---|---|
| 1 | S12_0_WBUDZIE | |
| 2 | S14_3_PODWORKO | |
| 3 | S31_0_ZIEMIA | |
| 4 | S41_0_CRASH | |
| 5 | S34_PRZELOT_A | VARPRZELOT=1 |
| 6 | S34_PRZELOT_A | VARPRZELOT=3 |
| 7 | S43_LRBIN | VARLEVEL4XX=4 |
| 8 | S82_DOK | B_82_RESTART=FALSE |

A chapter ends when the game sets the next `VARROZDZIAL` or plays the
chapter's closing scene. Find the end condition in the scripts.

## Working out the solution

Decrypted scripts are in `scripts/ReksioUfo/PRZYGODA/<scene dir>/*.cnv`
(sequences are in `*.seq`). `docs/script-semantics.md` and
`docs/object-semantics.md` explain the language. Follow the event chains:

- Which BUTTON or ANIMO handlers (ONCLICKED, ONRELEASED, ONCLICK,
  ONFOCUSON) set which variables.
- Which CONDITIONs then pass.
- Where `PRZYGODA^GOTO("…")` leads.

Minigames are keyboard- or mouse-driven. Read their scripts for the
controls and win condition, then play them for real with `hold:` and `click:`
steps. Only fall back to `eval` to force a win when the game is genuinely
too hard to automate, and say so in the walkthrough.

## Reporting

- Record the walkthrough in `docs/playthrough/chapterN.md`, written as you
  go. For each scene: the goal, then the exact session steps that solve it,
  then notes.
- Report each engine bug to the coordinator immediately with SendMessage
  (to: "main"). Include:
  - the scene;
  - a minimal step list that reproduces it;
  - expected behaviour, citing the script line that implies it;
  - observed behaviour;
  - the suspected engine file/function, if you can tell.
- Do **not** edit `src/`. The coordinator fixes bugs and rebuilds. When told
  "rebuilt", `goto` again to load the new build, then continue. Prefer
  continuing past a bug (for example via `eval`) and noting it, over stopping.
- Ignore known original-data defects:
  - missing `JEZ2.WAV`/`JEZ4.WAV`;
  - `PRAWA.ANN`, `KONWEKA.ANN`;
  - events missing from `OFERTA`/`METEOR3`;
  - undefined `BTNEXIT` in S49, `VARFOTKASEEN`;
  - the orphaned `s64_Brama/s01.cnv` objects.
