// BEHAVIOUR, CONDITION, COMPLEXCONDITION, EXPRESSION, TIMER, RAND, GROUP, VECTOR.

import type { ObjectDef } from '../formats/cnv.ts';
import { BREAK, ONE_BREAK, argValue, type Arg, type CallResult, type Ctx } from '../script/interpreter.ts';
import { Value, calculate, type ArithOp } from '../script/values.ts';
import type { Engine } from './engine.ts';
import { GameObject } from './object.ts';

/** CMC_Behaviour (run 0x1004dd00, runner 0x100522b0 / 0x10052340 / 0x100523d0). */
export class Behaviour extends GameObject {
  enabled = true;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    const params = (args: Arg[]) => args.map((a) => argValue(a).toStr());
    this.method('RUN', (args, ctx) => this.runForResult(ctx.self, params(args), false));
    this.method('RUNC', (args, ctx) => this.runForResult(ctx.self, params(args), true));
    this.method('RUNLOOPED', (args, ctx) => {
      const start = argValue(args[0]).toInt();
      const len = argValue(args[1]).toInt();
      const step = args.length > 2 ? argValue(args[2]).toInt() || 1 : 1;
      const extra = params(args.slice(3));
      for (let i = start; i < start + len; i += step) {
        if (this.run(ctx.self, [String(i), ...extra], true) === BREAK) break;
      }
      return undefined;
    });
    this.method('ENABLE', () => {
      this.enabled = true;
    });
    this.method('DISABLE', () => {
      this.enabled = false;
    });
  }

  /** Behaviours are only run explicitly, never on scene init. */
  init(): void {}

  /** Returns BREAK if the code broke (propagates to callers). */
  run(self: GameObject | Ctx['self'], params: string[], checkCondition: boolean): typeof BREAK | undefined {
    if (!this.enabled) return undefined;
    if (checkCondition) {
      const condName = this.prop('CONDITION');
      if (condName) {
        const cond = this.engine.find(condName);
        if (cond instanceof Condition || cond instanceof ComplexCondition) {
          if (!cond.valid(true)) return undefined;
        }
      }
    }
    return this.engine.interp.runCode(this.prop('CODE', '{}'), { self, params });
  }

  private runForResult(self: Ctx['self'], params: string[], checkCondition: boolean): CallResult {
    const result = this.engine.withReturnSlot(() => this.run(self, params, checkCondition));
    return result.broke ? BREAK : result.value;
  }
}

const COMPARATORS: Record<string, (c: number, eq: boolean) => boolean> = {
  EQUAL: (_c, eq) => eq,
  NOTEQUAL: (_c, eq) => !eq,
  LESS: (c) => c < 0,
  LESSEQUAL: (c) => c <= 0,
  GREATER: (c) => c > 0,
  GREATEREQUAL: (c) => c >= 0,
};

function conditionMethods(obj: GameObject & { valid(fire: boolean): boolean }): void {
  const fire = (args: Arg[]) => (args.length ? argValue(args[0]).toBool() : true);
  obj.method('CHECK', (args) => Value.bool(obj.valid(fire(args))));
  obj.method('BREAK', (args) => (obj.valid(fire(args)) ? BREAK : undefined));
  obj.method('ONE_BREAK', (args) => (obj.valid(fire(args)) ? ONE_BREAK : undefined));
  obj.method('ONEBREAK', (args) => (obj.valid(fire(args)) ? ONE_BREAK : undefined));
}

/** CMC_Condition::valid (0x100607e0). */
export class Condition extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    conditionMethods(this);
  }

  init(): void {}

  valid(fireEvents: boolean): boolean {
    const ctx: Ctx = { self: null, params: [] };
    const a = argValue(this.engine.interp.resolveParameter(this.prop('OPERAND1'), ctx));
    const b = argValue(this.engine.interp.resolveParameter(this.prop('OPERAND2'), ctx));
    const cmp = COMPARATORS[this.prop('OPERATOR').toUpperCase()] ?? COMPARATORS.EQUAL;
    const result = cmp(a.compare(b), a.equals(b));
    if (fireEvents) this.signal(result ? 'ONRUNTIMESUCCESS' : 'ONRUNTIMEFAILED');
    return result;
  }
}

/** CMC_ComplexCondition: CONDITION1 AND/OR CONDITION2. */
export class ComplexCondition extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    conditionMethods(this);
  }

  init(): void {}

  valid(fireEvents: boolean): boolean {
    const get = (n: string) => {
      const c = this.engine.find(this.prop(n));
      return c instanceof Condition || c instanceof ComplexCondition ? c : null;
    };
    const c1 = get('CONDITION1');
    const c2 = get('CONDITION2');
    const v1 = c1?.valid(false) ?? false;
    // TODO(unverified): whether the original short-circuits.
    const result = this.prop('OPERATOR').toUpperCase() === 'OR' ? v1 || (c2?.valid(false) ?? false) : v1 && (c2?.valid(false) ?? false);
    if (fireEvents) this.signal(result ? 'ONRUNTIMESUCCESS' : 'ONRUNTIMEFAILED');
    return result;
  }
}

const EXPR_OPS: Record<string, ArithOp> = { ADD: '+', SUB: '-', MUL: '*', DIV: '@', MOD: '%' };

/** EXPRESSION: a variable whose value is OPERAND1 OP OPERAND2, computed on read. */
export class Expression extends GameObject {
  init(): void {}

  asValue(): Value {
    const ctx: Ctx = { self: null, params: [] };
    const a = argValue(this.engine.interp.resolveParameter(this.prop('OPERAND1'), ctx));
    const b = argValue(this.engine.interp.resolveParameter(this.prop('OPERAND2'), ctx));
    return calculate(a, b, EXPR_OPS[this.prop('OPERATOR').toUpperCase()] ?? '+');
  }
}

/**
 * TIMER (CMC_Timer::onTimer 0x100b19f0): every ELAPSE ms the tick count is
 * incremented; when TICKS > 0 and the count reaches TICKS the timer disables
 * itself (keeping the count); then ONTICK^count / ONTICK fires.
 */
export class Timer extends GameObject {
  enabled: boolean;
  elapse: number;
  ticks: number;
  private count = 0;
  private acc = 0;
  private paused = false;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.enabled = this.boolProp('ENABLED', true);
    this.elapse = this.numProp('ELAPSE', 1000);
    this.ticks = this.numProp('TICKS', 0);
    // enable (0x100b1b50) restarts only a disabled timer.
    this.method('ENABLE', () => {
      if (this.enabled) return;
      this.enabled = true;
      this.count = 0;
      this.acc = 0;
    });
    this.method('DISABLE', () => {
      this.enabled = false;
    });
    this.method('PAUSE', () => {
      this.paused = true;
    });
    this.method('RESUME', () => {
      this.paused = false;
    });
    // reset (0x100b1bd0) / set (0x100b1bf0) restart the interval.
    this.method('RESET', () => {
      this.count = 0;
      this.acc = 0;
    });
    this.method('SET', (a) => {
      this.count = argValue(a[0]).toInt();
      this.acc = 0;
    });
    this.method('SETELAPSE', (a) => {
      this.elapse = argValue(a[0]).toInt();
      this.acc = 0;
    });
    this.method('GETTICKS', () => Value.int(this.count));
  }

  tick(dt: number): void {
    if (!this.enabled || this.paused || this.elapse <= 0) return;
    this.acc += dt;
    while (this.enabled && this.acc >= this.elapse) {
      this.acc -= this.elapse;
      this.count++;
      if (this.ticks > 0 && this.count === this.ticks) this.enabled = false;
      this.signal('ONTICK', String(this.count));
    }
  }
}

/**
 * RAND: GET(range) -> [0, range); GET(offset, range) -> offset + [0, range).
 * CMC_Rand_Runner::get (0x100949f0) calls CXRandom::random(a, b)
 * (0x100cb700), which is (GetTickCount() + rand()) % b + a.
 */
export class Rand extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('GET', (a) => {
      const offset = a.length > 1 ? argValue(a[0]).toInt() : 0;
      const range = argValue(a[a.length > 1 ? 1 : 0]).toInt();
      return Value.int(offset + Math.floor(Math.random() * Math.max(range, 0)));
    });
  }
}

/** GROUP: ADD members, then any other method is broadcast to them. */
export class Group extends GameObject {
  members: string[] = [];

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('ADD', (a) => {
      for (const x of a) this.members.push(argValue(x).toStr().toUpperCase());
    });
    this.method('REMOVE', (a) => {
      const n = argValue(a[0]).toStr().toUpperCase();
      this.members = this.members.filter((m) => m !== n);
    });
    this.method('REMOVEALL', () => {
      this.members = [];
    });
    this.method('GETSIZE', () => Value.int(this.members.length));
  }

  call(method: string, args: Arg[], ctx: Ctx): CallResult {
    if (this.methods.has(method)) return super.call(method, args, ctx);
    for (const m of this.members) this.engine.find(m)?.call(method, args, ctx);
    return undefined;
  }
}

/** VECTOR: fixed-size numeric vector (used by minigame physics). */
export class Vector extends GameObject {
  v: number[];

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    const size = this.numProp('SIZE', 2);
    const init = this.prop('VALUE').split(',').map(Number);
    this.v = Array.from({ length: size }, (_, i) => init[i] || 0);
    const other = (a: Arg) => {
      const o = this.engine.find(argValue(a).toStr());
      return o instanceof Vector ? o.v : null;
    };
    this.method('GET', (a) => Value.double(this.v[argValue(a[0]).toInt()] ?? 0));
    this.method('ASSIGN', (a) => {
      a.forEach((x, i) => (this.v[i] = argValue(x).toDouble()));
    });
    this.method('ADD', (a) => {
      const o = other(a[0]);
      if (o) this.v = this.v.map((x, i) => x + (o[i] ?? 0));
    });
    this.method('MUL', (a) => {
      const k = argValue(a[0]).toDouble();
      this.v = this.v.map((x) => x * k);
    });
    this.method('LEN', () => Value.double(Math.hypot(...this.v)));
    this.method('NORMALIZE', () => {
      const l = Math.hypot(...this.v);
      if (l) this.v = this.v.map((x) => x / l);
    });
    this.method('REFLECT', (a) => {
      // Reflect this vector about the normal given by another vector.
      const n = other(a[0]);
      if (!n) return;
      const nl = Math.hypot(...n) || 1;
      const nn = n.map((x) => x / nl);
      const d = this.v.reduce((s, x, i) => s + x * (nn[i] ?? 0), 0);
      this.v = this.v.map((x, i) => x - 2 * d * (nn[i] ?? 0));
    });
  }
}
