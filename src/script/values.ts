// Script values and the arithmetic/comparison rules of the four variable
// types. See docs/script-semantics.md for the procedures each rule comes from.

export type Kind = 'INTEGER' | 'DOUBLE' | 'STRING' | 'BOOL';

export class Value {
  readonly kind: Kind;
  readonly v: number | string | boolean;

  constructor(kind: Kind, v: number | string | boolean) {
    this.kind = kind;
    this.v = v;
  }

  static int(n: number): Value {
    return new Value('INTEGER', Math.trunc(n) | 0);
  }
  static double(n: number): Value {
    return new Value('DOUBLE', n);
  }
  static str(s: string): Value {
    return new Value('STRING', s);
  }
  static bool(b: boolean): Value {
    return new Value('BOOL', b);
  }

  toInt(): number {
    switch (this.kind) {
      case 'INTEGER':
        return this.v as number;
      case 'DOUBLE':
        return Math.trunc(this.v as number) | 0; // _ftol truncates
      case 'BOOL':
        return this.v ? 1 : 0;
      case 'STRING':
        return atoi(this.v as string);
    }
  }

  toDouble(): number {
    switch (this.kind) {
      case 'STRING': {
        const n = parseFloat(this.v as string);
        return Number.isFinite(n) ? n : 0;
      }
      case 'BOOL':
        return this.v ? 1 : 0;
      default:
        return this.v as number;
    }
  }

  toStr(): string {
    switch (this.kind) {
      case 'BOOL':
        return this.v ? 'TRUE' : 'FALSE';
      case 'DOUBLE':
        return formatDouble(this.v as number);
      default:
        return String(this.v);
    }
  }

  toBool(): boolean {
    switch (this.kind) {
      case 'BOOL':
        return this.v as boolean;
      case 'STRING':
        return (this.v as string).toUpperCase() === 'TRUE' || atoi(this.v as string) !== 0;
      default:
        return (this.v as number) !== 0;
    }
  }

  convert(kind: Kind): Value {
    if (kind === this.kind) return this;
    switch (kind) {
      case 'INTEGER':
        return Value.int(this.toInt());
      case 'DOUBLE':
        return Value.double(this.toDouble());
      case 'STRING':
        return Value.str(this.toStr());
      case 'BOOL':
        return Value.bool(this.toBool());
    }
  }

  equals(other: Value): boolean {
    const o = other.convert(this.kind);
    return this.kind === 'STRING' ? (this.v as string) === (o.v as string) : this.v === o.v;
  }

  /** <0, 0, >0 like CMC_Variable::compare. */
  compare(other: Value): number {
    const o = other.convert(this.kind);
    if (this.kind === 'STRING') return (this.v as string) < (o.v as string) ? -1 : (this.v as string) > (o.v as string) ? 1 : 0;
    const a = Number(this.v);
    const b = Number(o.v);
    return a < b ? -1 : a > b ? 1 : 0;
  }
}

export function atoi(s: string): number {
  const m = /^\s*([+-]?\d+)/.exec(s);
  return m ? Number(m[1]) | 0 : 0;
}

function formatDouble(n: number): string {
  // TODO(unverified): CMC_Double::toString formatting. Mirrors printf("%g")-ish output.
  if (Number.isInteger(n)) return n.toFixed(0);
  return String(Number(n.toFixed(6)));
}

/** Literal parsing, per CMC_Variable::resolve (0x100b26a0). */
export function literal(text: string): Value {
  if (text.startsWith('"')) {
    let s = text.slice(1);
    if (s.endsWith('"')) s = s.slice(0, -1);
    return Value.str(s);
  }
  const c = text[0];
  if (c === '-' || (c >= '0' && c <= '9')) {
    return text.includes('.') ? Value.double(parseFloat(text) || 0) : Value.int(atoi(text));
  }
  if (text === 'TRUE') return Value.bool(true);
  if (text === 'FALSE') return Value.bool(false);
  return Value.str(text);
}

export type ArithOp = '+' | '-' | '*' | '@' | '%';

/** One step of CMC_Expression::calculate: left op right, typed by the left side. */
export function calculate(left: Value, right: Value, op: ArithOp): Value {
  switch (left.kind) {
    case 'INTEGER': {
      const a = left.v as number;
      const b = right.toInt();
      switch (op) {
        case '+':
          return Value.int(a + b);
        case '-':
          return Value.int(a - b);
        case '*':
          return Value.int(Math.imul(a, b));
        case '@':
          return Value.int(b === 0 ? 0 : a / b);
        case '%':
          return Value.int(b === 0 ? 0 : a % b);
      }
      break;
    }
    case 'DOUBLE': {
      const a = left.v as number;
      const b = right.toDouble();
      switch (op) {
        case '+':
          return Value.double(a + b);
        case '-':
          return Value.double(a - b);
        case '*':
          return Value.double(a * b);
        case '@':
          return Value.double(b === 0 ? 0 : a / b);
        case '%': {
          const ib = Math.trunc(b);
          return Value.double(ib === 0 ? 0 : Math.trunc(a) % ib);
        }
      }
      break;
    }
    case 'STRING':
      return op === '+' ? Value.str((left.v as string) + right.toStr()) : left;
    case 'BOOL': {
      const a = left.v as boolean;
      const b = right.toBool();
      if (op === '+') return Value.bool(a && b);
      if (op === '-') return left;
      return Value.bool(a || b);
    }
  }
  return left;
}
