// Small gameplay tweaks applied on top of the original scripts — the game
// data itself stays untouched. Every entry documents what it changes;
// `?classic=1` skips all of them to play the original balance.

import type { ObjectDef } from './formats/cnv.ts';

export function applySceneTweaks(scene: string, defs: ObjectDef[]): void {
  if (scene === 'S16_SPACEINVADERS') {
    invaderRapidFire(defs);
    invaderTapFire(defs);
    invaderSkipButton(defs);
  }
}

/**
 * Alien Invaders (16_SpaceInvaders): throws are gated by CONDBURAKFIRE =
 * `ANIMOBURAK^ISPLAYING() == FALSE`, i.e. one throw per beetroot flight
 * (PLAY0 is 21 frames at 16 fps, ~1.3 s). A missed beetroot therefore locks
 * the throw for over a second. Replace the gate with a 0.2 s cooldown:
 * VARFIREOK starts at 1; BEHREKSIOFIRE clears it and arms TIMERFIRE, whose
 * one-shot tick sets it back after 200 ms. Re-throwing restarts the beetroot
 * animation, exactly like the script's own PLAY("PLAY0") does.
 */
function invaderRapidFire(defs: ObjectDef[]): void {
  const byName = (name: string): ObjectDef | undefined => defs.find((d) => d.name.toUpperCase() === name);

  const gate = byName('CONDBURAKFIRE');
  if (gate) {
    gate.props.set('OPERAND1', 'VARFIREOK');
    gate.props.set('OPERATOR', 'EQUAL');
    gate.props.set('OPERAND2', '1');
  }

  const fire = byName('BEHREKSIOFIRE');
  const code = fire?.props.get('CODE');
  if (fire && code?.startsWith('{')) {
    fire.props.set('CODE', `{VARFIREOK^SET(0);TIMERFIRE^ENABLE();${code.slice(1)}`);
  }

  defs.push(
    { name: 'VARFIREOK', props: new Map([['TYPE', 'INTEGER'], ['VALUE', '1']]) },
    {
      name: 'TIMERFIRE',
      props: new Map([
        ['TYPE', 'TIMER'],
        ['ENABLED', 'FALSE'],
        ['ELAPSE', '200'],
        ['TICKS', '1'],
        ['ONTICK', '{VARFIREOK^SET(1);}'],
      ]),
    },
  );
}

/** How close to Reksio's center a click must be to throw (px). */
const TAP_RADIUS = 70;

/**
 * Alien Invaders: a tap used to throw first and only then start moving Reksio,
 * which makes dodging beams on a touch screen awkward. Route the click through
 * a range check instead: clicking near Reksio (within TAP_RADIUS of his
 * center) throws, clicking away just walks him there — the scene's own
 * BEHREKSIOMOVE already moves Reksio toward the pointer each idle frame.
 */
function invaderTapFire(defs: ObjectDef[]): void {
  const mouse = defs.find((d) => d.name.toUpperCase() === 'MOUSE');
  mouse?.props.set('ONCLICK', 'BEHCLICK');
  defs.push(
    { name: 'VARCLICKDX', props: new Map([['TYPE', 'INTEGER']]) },
    {
      name: 'BEHCLICK',
      props: new Map([
        ['TYPE', 'BEHAVIOUR'],
        ['CODE', '{VARCLICKDX^SET([MOUSE^GETPOSX()-ANIMOREKSIO^GETCENTERX()]);CONDCLICKNEAR1^CHECK(TRUE);}'],
      ]),
    },
    {
      name: 'CONDCLICKNEAR1',
      props: new Map([
        ['TYPE', 'CONDITION'],
        ['OPERAND1', 'VARCLICKDX'],
        ['OPERATOR', 'LESS'],
        ['OPERAND2', String(TAP_RADIUS)],
        ['ONRUNTIMESUCCESS', '{CONDCLICKNEAR2^CHECK(TRUE);}'],
      ]),
    },
    {
      name: 'CONDCLICKNEAR2',
      props: new Map([
        ['TYPE', 'CONDITION'],
        ['OPERAND1', 'VARCLICKDX'],
        ['OPERATOR', 'GREATER'],
        ['OPERAND2', String(-TAP_RADIUS)],
        ['ONRUNTIMESUCCESS', 'BEHREKSIOFIRE'],
      ]),
    },
  );
}

/** How long the skip button stays on screen (seconds). */
const SKIP_SECONDS = 5;

/**
 * Alien Invaders: a "POMIŃ" (skip) button on the right, shown for the first
 * SKIP_SECONDS seconds. Pressing it stops the UFOs and their beams and plays
 * Reksio's SUCCESS — the scene's normal win path (narration, then the next
 * scene). STOP(FALSE) keeps ONFINISHED handlers (farm landings) out of it.
 */
function invaderSkipButton(defs: ObjectDef[]): void {
  const rect = '640,250,780,310';
  defs.push(
    {
      name: 'FNTBIG',
      // Size and weight come from the DEF_ name; ARIAL14.FNT is missing from
      // this install, so this renders with the canvas fallback at 26px bold.
      props: new Map([
        ['TYPE', 'FONT'],
        ['DEF_ARIAL_BOLD_26', 'ARIAL14.FNT'],
      ]),
    },
    {
      name: 'TEXTSKIP',
      props: new Map([
        ['TYPE', 'TEXT'],
        ['VISIBLE', 'TRUE'],
        ['FONT', 'FNTBIG'],
        ['TOCANVAS', 'TRUE'],
        ['RECT', rect],
        ['PRIORITY', '400'],
        ['HJUSTIFY', 'CENTER'],
        ['VJUSTIFY', 'TRUE'],
        ['TEXT', 'POMIŃ'],
        ['MONITORCOLLISION', 'FALSE'],
      ]),
    },
    {
      name: 'BUTTONSKIP',
      props: new Map([
        ['TYPE', 'BUTTON'],
        ['VISIBLE', 'TRUE'],
        ['ENABLE', 'TRUE'],
        ['RECT', rect],
        ['ONRELEASED', 'BEHSKIP'],
      ]),
    },
    {
      name: 'TIMERHINT',
      props: new Map([
        ['TYPE', 'TIMER'],
        ['ENABLED', 'TRUE'],
        ['ELAPSE', String(SKIP_SECONDS * 1000)],
        ['TICKS', '1'],
        ['ONTICK', '{BUTTONSKIP^DISABLE();TEXTSKIP^HIDE();}'],
      ]),
    },
    {
      name: 'BEHSKIPSTOP',
      props: new Map([
        ['TYPE', 'BEHAVIOUR'],
        ['CODE', '{$1^STOP(FALSE);$1^HIDE();}'],
      ]),
    },
    {
      name: 'BEHSKIP',
      props: new Map([
        ['TYPE', 'BEHAVIOUR'],
        [
          'CODE',
          '{TIMER1^DISABLE();TIMERHINT^DISABLE();BUTTONSKIP^DISABLE();TEXTSKIP^HIDE();' +
            'S16_SPACEINVADERS^RUNCLONES("ANIMOUFO",-1,-1,"BEHSKIPSTOP");' +
            'S16_SPACEINVADERS^RUNCLONES("ANIMOUFOFIRE",-1,-1,"BEHSKIPSTOP");' +
            'ANIMOBURAK^STOP(FALSE);ANIMOBURAK^HIDE();ANIMOREKSIO^PLAY("SUCCESS");}',
        ],
      ]),
    },
  );
}
