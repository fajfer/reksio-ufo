// MATRIX: the grid helper behind the S44 digging minigame ("Boulder Dash").
//
// The original lives in the plug-in Matrix.dll (CMatrix extern object, script
// object vtable 0x1000dbb4, model vtable 0x1000d5b0), loaded by PIKLIB8's
// CMC_DLLExModuleInterface. Addresses below are Matrix.dll unless noted.
// See docs/matrix.md for the full analysis.

import type { ObjectDef } from '../formats/cnv.ts';
import { argValue, type Arg } from '../script/interpreter.ts';
import { Value } from '../script/values.ts';
import type { Engine } from './engine.ts';
import { GameObject } from './object.ts';

/** Cell codes as named by the S44 scripts (IC_FIELD_CODE_*). */
export const CODE = {
  EMPTY: 0,
  GROUND: 1,
  STONE: 2,
  DYNAMITE: 3,
  WALL_WEAK: 4,
  ENEMY: 5,
  WALL_STRONG: 6,
  DYNAMITE_FIRED: 7,
  EXPLOSION: 8,
  EXIT: 9,
  MOLE: 99,
} as const;

/** Planned stone moves (TICK) = the code passed to ONNEXT/ONLATEST. */
export const MOVE = { NONE: 0, DOWN: 1, DOWN_LEFT: 2, DOWN_RIGHT: 3, ONTO_ENEMY: 4 } as const;

/** Signal sink for the model; the script object fires real events. */
export type MatrixSignal = (event: 'ONNEXT' | 'ONLATEST', x: number, y: number, move: number) => void;

function parsePoint(text: string | undefined): [number, number] {
  const [a, b] = (text ?? '').split(',').map((s) => parseInt(s.trim(), 10));
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
}

/** C integer division (truncates toward zero). */
const idiv = (a: number, b: number) => Math.trunc(a / b) | 0;

/**
 * The grid model (operator new(0x50), ctor 0x100022e0). Pure logic, no engine
 * dependency, so it can be unit-tested directly.
 */
export class MatrixModel {
  readonly width: number;
  readonly height: number;
  readonly baseX: number;
  readonly baseY: number;
  readonly cellW: number;
  readonly cellH: number;
  /** model+0xc: cell codes (bytes). */
  readonly code: Uint8Array;
  /** model+0x10: per-TICK move plan (bytes). */
  readonly plan: Uint8Array;
  /** Cell record +8 (setter 0x10004100, getter 0x10004110). */
  readonly state: Int32Array;
  /** model+0x14 / +0x18: NEXT scan position. */
  iterX = 0;
  iterY = -1;
  /** model+0x20 CXRect: left, top, right, bottom (cell units). */
  gate = { left: 0, top: 0, right: 0, bottom: 0 };
  signal: MatrixSignal = () => {};

  constructor(width: number, height: number, baseX = 0, baseY = 0, cellW = 1, cellH = 1) {
    this.width = width;
    this.height = height;
    this.baseX = baseX;
    this.baseY = baseY;
    this.cellW = cellW;
    this.cellH = cellH;
    const n = Math.max(0, width * height);
    this.code = new Uint8Array(n);
    this.plan = new Uint8Array(n);
    this.state = new Int32Array(n);
  }

  /**
   * Byte read with the original's flat indexing. Out-of-range reads (which
   * the C code would make into neighbouring memory) yield 0xff here, a value
   * no rule treats as EMPTY or STONE.
   */
  private at(arr: Uint8Array, i: number): number {
    return i >= 0 && i < arr.length ? arr[i] : 0xff;
  }

  private setState(i: number, v: number): void {
    if (i >= 0 && i < this.state.length) this.state[i] = v;
  }

  offset(x: number, y: number): number {
    return y * this.width + x; // 0x100034b0, no clamping
  }

  get(i: number): number {
    return this.at(this.code, i); // 0x10002d00
  }

  set(i: number, v: number): void {
    if (i >= 0 && i < this.code.length) this.code[i] = v & 0xff; // 0x10002cc0
  }

  /** SETROW(y, v0, v1, ...) — handler 0x10007ec0. */
  setRow(y: number, values: number[]): void {
    values.forEach((v, x) => this.set(this.offset(x, y), v));
  }

  /** 0x10003240 / 0x10003250. */
  cellsNo(code?: number): number {
    if (code === undefined) return this.width * this.height;
    const c = code & 0xff;
    let n = 0;
    for (const v of this.code) if (v === c) n++;
    return n;
  }

  /** Cell pixel position (cell record +0/+4, filled by ctor 0x100022e0). */
  cellPosX(i: number): number {
    return this.baseX + (((i % this.width) + this.width) % this.width) * this.cellW;
  }

  cellPosY(i: number): number {
    return this.baseY + Math.floor(i / this.width) * this.cellH;
  }

  /** 0x100034d0: -1 when outside the grid. */
  offsetAtPos(px: number, py: number): number {
    const cx = idiv(px - this.baseX, this.cellW);
    const cy = idiv(py - this.baseY, this.cellH);
    if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) return -1;
    return this.offset(cx, cy);
  }

  /** moveOff (0x10002c40): an EXPLOSION target swallows the mover. */
  move(from: number, to: number, state = 0): void {
    if (this.get(to) !== CODE.EXPLOSION) {
      this.set(to, this.get(from));
      if (this.get(to) === CODE.STONE) this.setState(to, state);
    }
    this.set(from, CODE.EMPTY);
    this.setState(from, 0);
  }

  clear(): void {
    this.code.fill(0); // 0x10003a50
    this.state.fill(0);
  }

  /** SETGATE (0x10002eb0). */
  setGate(left: number, top: number, right: number, bottom: number): void {
    this.gate = { left, top, right, bottom };
  }

  /** CXRect::IsInRect (PIKLIB8 0x100cc710): right/bottom exclusive. */
  isInGate(x: number, y: number): boolean {
    const g = this.gate;
    return x >= g.left && x < g.right && y >= g.top && y < g.bottom;
  }

  /** ISINGATE(i) (0x10002ef0). */
  isInGateOff(i: number): boolean {
    return this.isInGate(i % this.width | 0, idiv(i, this.width));
  }

  /** ISGATEEMPTY (0x10002d10): inclusive bounds, only stones count. */
  isGateEmpty(): boolean {
    const g = this.gate;
    for (let x = g.left; x <= g.right; x++) {
      for (let y = g.top; y <= g.bottom; y++) {
        if (this.get(this.offset(x, y)) === CODE.STONE) return false;
      }
    }
    return true;
  }

  /** CANHEROGOTO (0x100039f0). */
  canHeroGoTo(i: number): boolean {
    const c = this.get(i);
    const passable =
      c === CODE.EMPTY || c === CODE.GROUND || c === CODE.DYNAMITE || c === CODE.EXPLOSION || c === CODE.EXIT || c === CODE.ENEMY;
    return passable && !this.isInGateOff(i);
  }

  /** Direction step (0x10003d30): 0 left, 1 up, 2 right, 3 down, else stay. */
  step(i: number, dir: number): number {
    switch (dir) {
      case 0:
        return i - 1;
      case 1:
        return i - this.width;
      case 2:
        return i + 1;
      case 3:
        return i + this.width;
      default:
        return i;
    }
  }

  /** 0x10003ad0: enemies walk on EMPTY or into the MOLE, never into the gate. */
  enemyCanGo(i: number): boolean {
    const c = this.get(i);
    return (c === CODE.MOLE || c === CODE.EMPTY) && !this.isInGateOff(i);
  }

  /** CALCENEMYMOVEDIR (0x10003c50): left-turn first wall follower; 4 = stuck. */
  calcEnemyMoveDir(i: number, dir: number): number {
    // Turn helpers map 0,1,3 explicitly and everything else like 2.
    const turnA = dir === 0 ? 3 : dir === 1 ? 0 : dir === 3 ? 2 : 1; // 0x10003b50
    const turnB = dir === 0 ? 1 : dir === 1 ? 2 : dir === 3 ? 0 : 3; // 0x10003ba0
    const back = dir === 0 ? 2 : dir === 1 ? 3 : dir === 3 ? 1 : 0; // 0x10003c00
    for (const d of [turnA, dir, turnB, back]) {
      if (this.enemyCanGo(this.step(i, d))) return d;
    }
    return 4;
  }

  /** TICK (0x10002810): plan this round of stone moves. */
  tick(): void {
    const W = this.width;
    const H = this.height;
    const code = this.code;
    this.iterX = 0;
    this.iterY = H - 2;
    this.plan.fill(0);
    for (let x = 0; x < W; x++) {
      let y = H - 2;
      while (y >= 0) {
        const i = y * W + x;
        if (code[i] === CODE.STONE) {
          const below = this.at(code, i + W);
          if (below === CODE.EMPTY || below === CODE.ENEMY) {
            this.plan[i] = below === CODE.ENEMY ? MOVE.ONTO_ENEMY : MOVE.DOWN;
            // Stones stacked directly above get no plan this round.
            if (this.at(code, i - W) === CODE.STONE) {
              let k = y;
              let p = i - W;
              while (k >= 0) {
                const v = this.at(code, p - W);
                p -= W;
                k--;
                if (v !== CODE.STONE) break;
              }
              y = k;
            }
          } else if (below === CODE.STONE) {
            if (y !== 0 && this.at(code, i - W) === CODE.STONE) {
              this.setState(i, 0);
            } else if (
              (x === 0 || this.at(this.plan, i - 1) === 0) &&
              (x <= 1 || this.at(this.plan, i - 2) === 0) &&
              this.at(code, i - 1) === CODE.EMPTY &&
              this.at(code, i + W - 1) === CODE.EMPTY
            ) {
              this.setState(i, MOVE.DOWN_LEFT);
              this.plan[i] = MOVE.DOWN_LEFT;
            } else if (
              (x === W - 1 || this.at(this.plan, i + 1) === 0) &&
              (x >= W - 2 || this.at(this.plan, i + 2) === 0) &&
              this.at(code, i + 1) === CODE.EMPTY &&
              this.at(code, i + W + 1) === CODE.EMPTY
            ) {
              this.setState(i, MOVE.DOWN_RIGHT);
              this.plan[i] = MOVE.DOWN_RIGHT;
            } else {
              this.setState(i, 0);
            }
          } else {
            this.setState(i, 0);
          }
        }
        y--;
      }
    }
  }

  /** 0x10001f30: is there a planned move at or after (x, y) in scan order? */
  private hasPlanFrom(x: number, y: number): boolean {
    for (let row = y; row >= 0; row--) {
      for (let col = row === y ? x : 0; col < this.width; col++) {
        if (this.plan[row * this.width + col] !== 0) return true;
      }
    }
    return false;
  }

  /**
   * NEXT (0x100029e0): perform the next planned move and fire ONNEXT (more
   * moves follow) or ONLATEST (last one) with (x, y, move). Returns 0 when
   * nothing was done (or the last move), 1 when more follow, 2 when a stone
   * landed right above the mole.
   */
  next(): number {
    const W = this.width;
    let res = 0;
    for (let y = this.iterY; y >= 0; y--) {
      for (let x = y === this.iterY ? this.iterX : 0; x < W; x++) {
        const i = y * W + x;
        const m = this.plan[i];
        if (m === 0) continue;
        switch (m) {
          case MOVE.DOWN:
            this.move(i, this.offset(x, y + 1), MOVE.DOWN);
            if (this.at(this.code, this.offset(x, y + 2)) === CODE.MOLE) res = 2;
            break;
          case MOVE.DOWN_LEFT:
            this.move(i, this.offset(x - 1, y + 1), MOVE.DOWN_LEFT);
            break;
          case MOVE.DOWN_RIGHT:
            this.move(i, this.offset(x + 1, y + 1), MOVE.DOWN_RIGHT);
            break;
          case MOVE.ONTO_ENEMY:
            if (this.state[i] !== 1) continue; // only a falling stone crushes
            this.setState(i, 0);
            break;
          default:
            break; // jump table only covers 1..4; other values fall to the common tail
        }
        const nx = x < W - 1 ? x + 1 : 0; // 0x100022b0
        const ny = x < W - 1 ? y : y - 1;
        if (this.hasPlanFrom(nx, ny)) {
          this.iterX = nx;
          this.iterY = ny;
          this.signal('ONNEXT', x, y, m);
          return res === 0 ? 1 : res;
        }
        this.iterX = W;
        this.iterY = -1;
        this.signal('ONLATEST', x, y, m);
        return res;
      }
    }
    return 0;
  }
}

/** Script object (ctor 0x10005860, runner dispatch 0x100084a0). */
export class Matrix extends GameObject {
  readonly model: MatrixModel;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    const [w, h] = parsePoint(def.props.get('SIZE'));
    const [bx, by] = parsePoint(def.props.get('BASEPOS'));
    this.model = new MatrixModel(w, h, bx, by, this.numProp('CELLWIDTH', 0) | 0, this.numProp('CELLHEIGHT', 0) | 0);
    // Handlers run with params [x, y, move] (0x10001f90).
    this.model.signal = (event, x, y, m) => {
      this.signal(event, undefined, [String(x), String(y), String(m)]);
    };

    const m = this.model;
    const int = (args: Arg[], k: number) => argValue(args[k]).toInt();
    const off = (args: Arg[]) => (args.length === 1 ? int(args, 0) : m.offset(int(args, 0), int(args, 1)));

    this.method('TICK', () => {
      m.tick();
    });
    this.method('NEXT', () => Value.int(m.next()));
    this.method('MOVE', (args) => {
      if (args.length === 2) m.move(int(args, 0), int(args, 1), 0);
      else m.move(m.offset(int(args, 0), int(args, 1)), m.offset(int(args, 2), int(args, 3)), 0);
    });
    this.method('SET', (args) => {
      if (args.length === 2) m.set(int(args, 0), int(args, 1));
      else m.set(m.offset(int(args, 0), int(args, 1)), int(args, 2));
    });
    this.method('GET', (args) => Value.int(m.get(off(args))));
    this.method('SETROW', (args) => {
      m.setRow(
        int(args, 0),
        args.slice(1).map((a) => argValue(a).toInt()),
      );
    });
    this.method('CLEAR', () => m.clear());
    this.method('GETWIDTH', () => Value.int(m.width));
    this.method('GETHEIGHT', () => Value.int(m.height));
    this.method('GETCELLSNO', (args) => Value.int(args.length === 0 ? m.cellsNo() : m.cellsNo(int(args, 0))));
    this.method('GETCELLOFFSET', (args) => Value.int(m.offset(int(args, 0), int(args, 1))));
    this.method('GETCELLOFFSETATPOS', (args) => Value.int(m.offsetAtPos(int(args, 0), int(args, 1))));
    this.method('GETCELLPOSX', (args) => Value.int(m.cellPosX(off(args))));
    this.method('GETCELLPOSY', (args) => Value.int(m.cellPosY(off(args))));
    this.method('SETGATE', (args) => m.setGate(int(args, 0), int(args, 1), int(args, 2), int(args, 3)));
    this.method('ISGATEEMPTY', () => Value.bool(m.isGateEmpty()));
    this.method('ISINGATE', (args) =>
      Value.bool(args.length === 1 ? m.isInGateOff(int(args, 0)) : m.isInGate(int(args, 0), int(args, 1))),
    );
    this.method('CANHEROGOTO', (args) => Value.bool(m.canHeroGoTo(off(args))));
    this.method('CALCENEMYMOVEDIR', (args) => Value.int(m.calcEnemyMoveDir(int(args, 0), int(args, 1))));
    this.method('CALCENEMYMOVEDEST', (args) => Value.int(m.step(int(args, 0), int(args, 1))));
  }
}
