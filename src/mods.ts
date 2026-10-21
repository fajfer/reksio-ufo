// Small gameplay tweaks applied on top of the original scripts — the game
// data itself stays untouched. Every entry documents what it changes;
// `?classic=1` skips all of them to play the original balance.

import type { ObjectDef } from './formats/cnv.ts';

export function applySceneTweaks(scene: string, defs: ObjectDef[]): void {
  if (scene === 'S16_SPACEINVADERS') invaderRapidFire(defs);
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
