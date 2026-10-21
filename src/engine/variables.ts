// INTEGER / DOUBLE / STRING / BOOL / ARRAY objects (CMC_Variable family).

import type { ObjectDef } from '../formats/cnv.ts';
import { argValue, type Arg } from '../script/interpreter.ts';
import { Value, literal, type Kind } from '../script/values.ts';
import type { Engine } from './engine.ts';
import { GameObject } from './object.ts';

const num = (a: Arg | undefined) => argValue(a).toDouble();
const int = (a: Arg | undefined) => argValue(a).toInt();

export class Variable extends GameObject {
  readonly kind: Kind;
  value: Value;
  private toIni: boolean;

  constructor(engine: Engine, def: ObjectDef, kind: Kind) {
    super(engine, def);
    this.kind = kind;
    this.toIni = this.boolProp('TOINI');
    this.value = this.initialValue();

    this.method('SET', (args) => this.set(argValue(args[0])));
    this.method('GET', () => this.value);
    this.method('SETDEFAULT', (args) => {
      this.props.set('VALUE', argValue(args[0]).toStr());
    });
    this.method('CLEAR', () => this.set(this.defaultValue()));
    this.method('RESETINI', () => this.set(this.defaultValue()));
    this.method('SWITCH', (args) => {
      // SWITCH(a, b): toggle between two values (BOOL: no args flips).
      if (args.length < 2) this.set(Value.bool(!this.value.toBool()));
      else this.set(this.value.equals(argValue(args[0])) ? argValue(args[1]) : argValue(args[0]));
    });
  }

  private defaultValue(): Value {
    const raw = this.props.get('VALUE');
    if (raw === undefined || raw === '') return zero(this.kind);
    return literal(raw).convert(this.kind);
  }

  private initialValue(): Value {
    if (this.toIni) {
      const stored = this.engine.ini.get(this.iniSection(), this.name);
      if (stored !== undefined) return literal(stored).convert(this.kind);
    }
    return this.defaultValue();
  }

  private iniSection(): string {
    return this.containerName || this.engine.currentContainerName;
  }

  asValue(): Value {
    return this.value;
  }

  /** CMC_Variable::onChange (0x100b3360): brutal always, changed only on change. */
  set(v: Value): void {
    const next = v.convert(this.kind);
    const changed = !next.equals(this.value) || next.toStr() !== this.value.toStr();
    this.value = next;
    const s = next.toStr();
    this.signal('ONBRUTALCHANGED', s, [s]);
    if (changed) {
      this.signal('ONCHANGED', s, [s]);
      if (this.toIni) this.engine.ini.set(this.iniSection(), this.name, s);
    }
  }
}

function zero(kind: Kind): Value {
  switch (kind) {
    case 'INTEGER':
      return Value.int(0);
    case 'DOUBLE':
      return Value.double(0);
    case 'BOOL':
      return Value.bool(false);
    case 'STRING':
      return Value.str('');
  }
}

export class IntegerVar extends Variable {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def, 'INTEGER');
    const v = () => this.value.v as number;
    this.method('INC', () => this.set(Value.int(v() + 1)));
    this.method('DEC', () => this.set(Value.int(v() - 1)));
    this.method('ADD', (a) => this.set(Value.int(v() + int(a[0]))));
    this.method('SUB', (a) => this.set(Value.int(v() - int(a[0]))));
    this.method('MUL', (a) => this.set(Value.int(Math.imul(v(), int(a[0])))));
    this.method('DIV', (a) => {
      const d = int(a[0]);
      if (d !== 0) this.set(Value.int(v() / d));
    });
    this.method('MOD', (a) => {
      const d = int(a[0]);
      if (d !== 0) this.set(Value.int(v() % d));
    });
    this.method('ABS', (a) => this.set(Value.int(Math.abs(a.length ? int(a[0]) : v()))));
    this.method('CLAMP', (a) => this.set(Value.int(Math.min(Math.max(v(), int(a[0])), int(a[1])))));
    this.method('AND', (a) => this.set(Value.int(v() & int(a[0]))));
    this.method('OR', (a) => this.set(Value.int(v() | int(a[0]))));
    this.method('XOR', (a) => this.set(Value.int(v() ^ int(a[0]))));
    this.method('NOT', () => this.set(Value.int(~v())));
    this.method('RANDOM', (a) => this.set(Value.int(Math.floor(Math.random() * int(a[0])) + (a.length > 1 ? int(a[1]) : 0))));
  }
}

export class DoubleVar extends Variable {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def, 'DOUBLE');
    const v = () => this.value.v as number;
    const deg = Math.PI / 180;
    this.method('ADD', (a) => this.set(Value.double(v() + num(a[0]))));
    this.method('SUB', (a) => this.set(Value.double(v() - num(a[0]))));
    this.method('MUL', (a) => this.set(Value.double(v() * num(a[0]))));
    this.method('DIV', (a) => {
      const d = num(a[0]);
      if (d !== 0) this.set(Value.double(v() / d));
    });
    this.method('SINUS', (a) => this.set(Value.double(Math.sin(num(a[0]) * deg))));
    this.method('COSINUS', (a) => this.set(Value.double(Math.cos(num(a[0]) * deg))));
    // ARCTANEX(y, x): angle in degrees of the vector (x, y).
    this.method('ARCTANEX', (a) => this.set(Value.double(Math.atan2(num(a[0]), num(a[1])) / deg)));
    this.method('MAXA', (a) => this.set(Value.double(Math.max(...a.map(num)))));
    this.method('MINA', (a) => this.set(Value.double(Math.min(...a.map(num)))));
    this.method('SQRT', (a) => this.set(Value.double(Math.sqrt(a.length ? num(a[0]) : v()))));
    this.method('ABS', (a) => this.set(Value.double(Math.abs(a.length ? num(a[0]) : v()))));
  }
}

export class StringVar extends Variable {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def, 'STRING');
    const v = () => this.value.v as string;
    this.method('ADD', (a) => this.set(Value.str(v() + argValue(a[0]).toStr())));
    this.method('UPPER', () => this.set(Value.str(v().toUpperCase())));
    this.method('LOWER', () => this.set(Value.str(v().toLowerCase())));
    this.method('LENGTH', () => Value.int(v().length));
    this.method('FIND', (a) => Value.int(v().indexOf(argValue(a[0]).toStr())));
    this.method('CUT', (a) => this.set(Value.str(v().substr(int(a[0]), a.length > 1 ? int(a[1]) : undefined))));
  }
}

export class BoolVar extends Variable {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def, 'BOOL');
  }
}

/** ARRAY: an ordered list of values, persisted with SAVEINI/LOADINI. */
export class ArrayVar extends GameObject {
  items: Value[] = [];

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    const at = (a: Arg[]) => int(a[0]);
    const mutateAt = (a: Arg[], fn: (old: Value, arg: Value) => Value) => {
      const i = at(a);
      if (i >= 0 && i < this.items.length) this.items[i] = fn(this.items[i], argValue(a[1]));
    };
    const numeric = (old: Value, n: number) => (old.kind === 'DOUBLE' ? Value.double(n) : Value.int(n));

    this.method('ADD', (a) => {
      for (const x of a) this.items.push(argValue(x));
    });
    this.method('GET', (a) => this.items[at(a)] ?? Value.int(0));
    this.method('CHANGEAT', (a) => {
      const i = at(a);
      if (i >= 0) {
        while (this.items.length <= i) this.items.push(Value.int(0));
        this.items[i] = argValue(a[1]);
      }
    });
    this.method('REMOVEAT', (a) => {
      this.items.splice(at(a), 1);
    });
    this.method('REMOVEALL', () => {
      this.items = [];
    });
    this.method('GETSIZE', () => Value.int(this.items.length));
    this.method('FIND', (a) => Value.int(this.items.findIndex((x) => x.equals(argValue(a[0])))));
    this.method('REVERSEFIND', (a) => {
      const needle = argValue(a[0]);
      for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].equals(needle)) return Value.int(i);
      return Value.int(-1);
    });
    this.method('CONTAINS', (a) => Value.bool(this.items.some((x) => x.equals(argValue(a[0])))));
    this.method('SUM', () => Value.int(this.items.reduce((s, x) => s + x.toInt(), 0)));
    this.method('ADDAT', (a) => mutateAt(a, (o, x) => numeric(o, o.toDouble() + x.toDouble())));
    this.method('SUBAT', (a) => mutateAt(a, (o, x) => numeric(o, o.toDouble() - x.toDouble())));
    this.method('MULAT', (a) => mutateAt(a, (o, x) => numeric(o, o.toDouble() * x.toDouble())));
    this.method('MODAT', (a) => mutateAt(a, (o, x) => (x.toInt() ? Value.int(o.toInt() % x.toInt()) : o)));
    this.method('CLAMPAT', (a) => {
      const i = at(a);
      if (i >= 0 && i < this.items.length) {
        const o = this.items[i];
        this.items[i] = numeric(o, Math.min(Math.max(o.toDouble(), num(a[1])), num(a[2])));
      }
    });
    this.method('SAVEINI', () => {
      this.engine.ini.set(this.containerName, this.name, this.items.map((x) => x.toStr()).join(','));
    });
    this.method('LOADINI', () => {
      const s = this.engine.ini.get(this.containerName, this.name);
      this.items = s ? s.split(',').map((x) => literal(x)) : [];
    });
  }
}
