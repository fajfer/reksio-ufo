import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE, MOVE, Matrix, MatrixModel } from '../src/engine/matrix.ts';
import type { Engine } from '../src/engine/engine.ts';
import { Value } from '../src/script/values.ts';

const { EMPTY: E, GROUND: G, STONE: S, ENEMY: N, WALL_STRONG: W, EXPLOSION: X, MOLE: M } = CODE;

/** Build a model from rows of codes (top to bottom). */
function grid(rows: number[][]): MatrixModel {
  const m = new MatrixModel(rows[0].length, rows.length, 0, 100, 40, 40);
  rows.forEach((r, y) => m.setRow(y, r));
  return m;
}

function rows(m: MatrixModel): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < m.height; y++) out.push([...m.code.slice(y * m.width, (y + 1) * m.width)]);
  return out;
}

/** Run TICK, then NEXT until it reports done; collect signals. */
function drain(m: MatrixModel): { events: string[]; results: number[] } {
  const events: string[] = [];
  const results: number[] = [];
  m.signal = (ev, x, y, mv) => events.push(`${ev}:${x},${y},${mv}`);
  m.tick();
  for (let guard = 0; guard < 100; guard++) {
    const r = m.next();
    results.push(r);
    if (r !== 1) break;
  }
  return { events, results };
}

test('geometry: offsets, cell positions, counts', () => {
  const m = new MatrixModel(20, 11, 0, 100, 40, 40);
  assert.equal(m.offset(3, 2), 43);
  assert.equal(m.cellPosX(43), 120);
  assert.equal(m.cellPosY(43), 180);
  assert.equal(m.offsetAtPos(125, 185), 43);
  assert.equal(m.offsetAtPos(10, 50), -1);
  assert.equal(m.cellsNo(), 220);
  m.setRow(0, [9, 6, 6]);
  assert.equal(m.cellsNo(6), 2);
  assert.equal(m.cellsNo(0), 217);
  m.set(5, 99 + 256);
  assert.equal(m.get(5), 99, 'SET stores a byte');
});

test('TICK + NEXT: a stone falls one cell per round', () => {
  const m = grid([
    [W, S, W],
    [W, E, W],
    [W, E, W],
    [W, W, W],
  ]);
  const { events, results } = drain(m);
  assert.deepEqual(events, ['ONLATEST:1,0,1']);
  assert.deepEqual(results, [0]);
  assert.equal(m.get(m.offset(1, 1)), S);
  assert.equal(m.state[m.offset(1, 1)], 1, 'destination remembers it is falling');
  assert.equal(m.next(), 0, 'plan drained');
});

test('stones stacked above a falling stone wait one round', () => {
  const m = grid([
    [W, S, W],
    [W, S, W],
    [W, E, W],
    [W, W, W],
  ]);
  drain(m);
  assert.deepEqual(rows(m).map((r) => r[1]), [S, E, S, W]);
});

test('NEXT walks moves bottom row first, left to right, ONNEXT then ONLATEST', () => {
  const m = grid([
    [S, W, S, W, S],
    [E, W, E, W, E],
    [G, G, G, G, G],
  ]);
  const { events, results } = drain(m);
  assert.deepEqual(events, ['ONNEXT:0,0,1', 'ONNEXT:2,0,1', 'ONLATEST:4,0,1']);
  assert.deepEqual(results, [1, 1, 0]);
});

test('stone on stone rolls left first, then right; blocked otherwise', () => {
  const left = grid([
    [W, E, S, E, W],
    [W, E, S, E, W],
    [W, W, W, W, W],
  ]);
  left.tick();
  assert.equal(left.plan[left.offset(2, 0)], MOVE.DOWN_LEFT);
  assert.equal(left.state[left.offset(2, 0)], MOVE.DOWN_LEFT);
  left.next();
  assert.equal(left.get(left.offset(1, 1)), S);

  const right = grid([
    [W, G, S, E, W],
    [W, E, S, E, W],
    [W, W, W, W, W],
  ]);
  right.tick();
  assert.equal(right.plan[right.offset(2, 0)], MOVE.DOWN_RIGHT);

  const blocked = grid([
    [W, G, S, G, W],
    [W, E, S, E, W],
    [W, W, W, W, W],
  ]);
  blocked.tick();
  assert.equal(blocked.plan[blocked.offset(2, 0)], 0);
});

test('a loaded stone (stone above) does not roll', () => {
  const m = grid([
    [W, E, S, E, W],
    [W, E, S, E, W],
    [W, E, S, E, W],
    [W, W, W, W, W],
  ]);
  m.tick();
  assert.equal(m.plan[m.offset(2, 1)], 0);
  assert.equal(m.plan[m.offset(2, 0)], MOVE.DOWN_LEFT, 'top stone may roll');
});

test('two stones never roll into the same cell', () => {
  // (1,0) would roll right into (2,1); (3,0) then cannot roll left there.
  const m = grid([
    [W, S, E, S, E, W],
    [W, S, E, S, E, W],
    [W, W, W, W, W, W],
  ]);
  m.tick();
  assert.equal(m.plan[m.offset(1, 0)], MOVE.DOWN_RIGHT);
  assert.equal(m.plan[m.offset(3, 0)], MOVE.DOWN_RIGHT, 'falls back to rolling right');
});

test('stone onto enemy: only a falling stone crushes', () => {
  const resting = grid([
    [W, S, W],
    [W, N, W],
    [W, W, W],
  ]);
  const r = drain(resting);
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.results, [0]);
  assert.equal(resting.get(resting.offset(1, 1)), N);

  const falling = grid([
    [W, S, W],
    [W, E, W],
    [W, N, W],
    [W, W, W],
  ]);
  drain(falling); // falls to (1,1) with state 1
  const f = drain(falling);
  assert.deepEqual(f.events, ['ONLATEST:1,1,4']);
  assert.equal(falling.get(falling.offset(1, 2)), N, 'the matrix does not move it; the script explodes the enemy');
  assert.equal(falling.state[falling.offset(1, 1)], 0);
});

test('NEXT returns 2 when a stone lands right above the mole', () => {
  const m = grid([
    [W, S, W],
    [W, E, W],
    [W, M, W],
    [W, W, W],
  ]);
  const { events, results } = drain(m);
  assert.deepEqual(events, ['ONLATEST:1,0,1']);
  assert.deepEqual(results, [2]);
  // A stone resting on the mole does not fall into it.
  const again = drain(m);
  assert.deepEqual(again.events, []);
});

test('MOVE into an explosion destroys the mover', () => {
  const m = grid([[S, X, E]]);
  m.move(0, 1);
  assert.deepEqual(rows(m), [[E, X, E]]);
  m.set(0, M);
  m.move(0, 2);
  assert.deepEqual(rows(m), [[E, X, M]]);
});

test('gate: ISINGATE is half-open, ISGATEEMPTY inclusive', () => {
  const m = new MatrixModel(20, 11);
  assert.equal(m.isInGate(0, 0), false);
  m.setGate(3, 1, 16, 4);
  assert.equal(m.isInGate(3, 1), true);
  assert.equal(m.isInGate(15, 3), true);
  assert.equal(m.isInGate(16, 3), false);
  assert.equal(m.isInGate(3, 4), false);
  assert.equal(m.isInGateOff(m.offset(4, 2)), true);
  assert.equal(m.isGateEmpty(), true);
  m.set(m.offset(16, 4), S);
  assert.equal(m.isGateEmpty(), false, 'right/bottom edge is checked');
  m.set(m.offset(16, 4), G);
  assert.equal(m.isGateEmpty(), true, 'only stones block the gate');
});

test('CANHEROGOTO', () => {
  const m = grid([[E, G, S, 3, 4, N, W, 7, X, 9, M]]);
  const can = [...Array(11).keys()].map((i) => m.canHeroGoTo(i));
  assert.deepEqual(can, [true, true, false, true, false, true, false, false, true, true, false]);
  m.setGate(0, 0, 2, 1);
  assert.equal(m.canHeroGoTo(0), false, 'never into the gate');
});

test('enemy movement: left-hand wall follower', () => {
  const m = grid([
    [W, W, W, W],
    [W, E, E, W],
    [W, E, W, W],
    [W, W, W, W],
  ]);
  const at = m.offset(2, 1);
  // Heading right (2): try up (1) - wall, right - wall, down (3) - wall, back left (0).
  assert.equal(m.calcEnemyMoveDir(at, 2), 0);
  assert.equal(m.step(at, 0), m.offset(1, 1));
  // At (1,1) heading left (0): try down (3) first -> open.
  assert.equal(m.calcEnemyMoveDir(m.offset(1, 1), 0), 3);
  // Enemy may walk into the mole, but not onto ground.
  m.set(m.offset(1, 2), M);
  assert.equal(m.calcEnemyMoveDir(m.offset(1, 1), 0), 3);
  m.set(m.offset(1, 2), G);
  m.set(m.offset(2, 1), G);
  assert.equal(m.calcEnemyMoveDir(m.offset(1, 1), 0), 4, 'boxed in');
  assert.equal(m.step(5, 4), 5);
});

test('Matrix script object: props, methods and ONNEXT/ONLATEST params', () => {
  const fired: Array<[string, string[]]> = [];
  const engine = {
    trace: false,
    warnOnce: () => {},
    runHandler: (h: string, _self: unknown, params: string[]) => {
      fired.push([h, params]);
      return undefined;
    },
  } as unknown as Engine;
  const props = new Map([
    ['TYPE', 'MATRIX'],
    ['SIZE', '3,4'],
    ['BASEPOS', '0,100'],
    ['CELLHEIGHT', '40'],
    ['CELLWIDTH', '40'],
    ['ONNEXT', 'BMONNEXT'],
    ['ONLATEST', 'BMONLATEST'],
  ]);
  const mat = new Matrix(engine, { name: 'MAT', props });
  const ctx = { self: mat, params: [] } as never;
  const call = (name: string, ...args: (number | string)[]) =>
    mat.call(
      name,
      args.map((a) => (typeof a === 'number' ? Value.int(a) : Value.str(a))),
      ctx,
    ) as Value | undefined;

  for (const [y, row] of [
    [0, [6, 2, 6]],
    [1, [6, 0, 6]],
    [2, [6, 0, 6]],
    [3, [6, 6, 6]],
  ] as const) {
    call('SETROW', y, ...row);
  }
  assert.equal(call('GETCELLSNO')?.toInt(), 12);
  assert.equal(call('GETCELLSNO', 2)?.toInt(), 1);
  assert.equal(call('GET', 1)?.toInt(), 2);
  assert.equal(call('GET', 1, 0)?.toInt(), 2);
  assert.equal(call('GETCELLOFFSET', 1, 2)?.toInt(), 7);
  assert.equal(call('GETCELLPOSX', 7)?.toInt(), 40);
  assert.equal(call('GETCELLPOSY', 7)?.toInt(), 180);
  assert.equal(call('GETCELLPOSY', 1, 2)?.toInt(), 180);

  call('TICK');
  assert.equal(call('NEXT')?.toInt(), 0);
  assert.deepEqual(fired, [['BMONLATEST', ['1', '0', '1']]]);
  assert.equal(call('GET', 4)?.toInt(), 2);

  call('SET', 4, 0);
  call('SET', 1, 2, 2);
  assert.equal(call('GET', 7)?.toInt(), 2);
  call('MOVE', 7, 4);
  assert.equal(call('GET', 4)?.toInt(), 2);
  call('MOVE', 1, 1, 1, 2);
  assert.equal(call('GET', 1, 2)?.toInt(), 2);

  call('SETGATE', 1, 1, 2, 3);
  assert.equal(call('ISINGATE', 4)?.toBool(), true);
  assert.equal(call('ISINGATE', 1, 3)?.toBool(), false);
  assert.equal(call('ISGATEEMPTY')?.toBool(), false);
  assert.equal(call('CANHEROGOTO', 1, 1)?.toBool(), false);
  assert.equal(call('CALCENEMYMOVEDEST', 4, 3)?.toInt(), 7);
  assert.equal(call('CALCENEMYMOVEDIR', 4, 0)?.toInt(), 1, 'down is a stone, left a wall, up is free');
});
