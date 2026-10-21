// Parser for Piklib behaviour code: `{A^PLAY("X");B^SET([C+1]);@IF(...)}`.
// Produces a small AST; evaluation semantics live in interpreter.ts.

export type Expr =
  | { k: 'str'; v: string }
  | { k: 'num'; v: number; raw: string }
  | { k: 'ident'; name: string }
  | { k: 'arg'; index: number } // $1..$n
  | { k: 'call'; target: Expr; method: string; args: Expr[] }
  | { k: 'arith'; operands: Expr[]; ops: ArithOp[] }
  | { k: 'block'; body: Stmt[] };

export type ArithOp = '+' | '-' | '*' | '@' | '%';

export type Stmt =
  | { k: 'expr'; e: Expr }
  | { k: 'keyword'; name: string; args: Expr[] }
  | { k: 'error'; text: string; message: string };

const IDENT_STOP = new Set([...'^(),;[]{}"+-*@%: \t\r\n']);

export class ParseError extends Error {}

class Parser {
  private src: string;
  private i = 0;

  constructor(src: string) {
    this.src = src;
  }

  private peek(): string {
    return this.src[this.i] ?? '';
  }

  private skipWs(): void {
    while (/\s/.test(this.peek())) this.i++;
  }

  private eat(ch: string): boolean {
    this.skipWs();
    if (this.peek() === ch) {
      this.i++;
      return true;
    }
    return false;
  }

  private expect(ch: string): void {
    if (!this.eat(ch)) throw new ParseError(`Expected '${ch}' at ${this.i} in ${this.src}`);
  }

  get done(): boolean {
    this.skipWs();
    return this.i >= this.src.length;
  }

  block(): Stmt[] {
    this.expect('{');
    const body = this.statements('}');
    // One shipped script closes a block with ']' instead of '}'; accept it
    // (and a missing terminator at end of input) like the original does.
    if (!this.eat('}')) this.eat(']');
    return body;
  }

  statements(end: string): Stmt[] {
    const out: Stmt[] = [];
    for (;;) {
      this.skipWs();
      const c = this.peek();
      if (c === '' || c === end || c === ']') return out;
      // ';' separates statements; stray ':' (seen as `PLAY("2"):;`) is noise.
      if (c === ';' || c === ':') {
        this.i++;
        continue;
      }
      const start = this.i;
      try {
        let stmt: Stmt;
        if (c === '@') {
          this.i++;
          const name = this.ident().toUpperCase();
          const args = this.eat('(') ? this.args() : [];
          stmt = { k: 'keyword', name, args };
        } else {
          stmt = { k: 'expr', e: this.expr() };
        }
        this.skipWs();
        const next = this.peek();
        if (next !== ';' && next !== ':' && next !== end && next !== ']' && next !== '') {
          throw new ParseError(`Unexpected '${next}' at ${this.i} in ${this.src}`);
        }
        out.push(stmt);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.i = start;
        this.skipStatement(end);
        out.push({ k: 'error', text: this.src.slice(start, this.i), message: e.message });
      }
    }
  }

  /** Skip to the next top-level ';' (or block end), honouring quotes and brackets. */
  private skipStatement(end: string): void {
    let depth = 0;
    let inStr = false;
    for (; this.i < this.src.length; this.i++) {
      const ch = this.src[this.i];
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0 && ch === end) return;
        depth--;
      } else if (ch === ';' && depth <= 0) return;
    }
  }

  private args(): Expr[] {
    const args: Expr[] = [];
    this.skipWs();
    if (this.eat(')')) return args;
    for (;;) {
      args.push(this.expr());
      if (this.eat(',')) continue;
      this.expect(')');
      return args;
    }
  }

  private ident(): string {
    const start = this.i;
    while (this.i < this.src.length && !IDENT_STOP.has(this.src[this.i])) this.i++;
    return this.src.slice(start, this.i);
  }

  private primary(): Expr {
    this.skipWs();
    const c = this.peek();
    if (c === '"' && this.src[this.i + 1] === '"' && !/[,)\s]/.test(this.src[this.i + 2] ?? ')')) {
      // Doubled quotes (`""OPEN""`, `""-4""`) wrap a string that keeps its
      // quote characters, as used by @IF operands and BEHMOVE args.
      const end = this.src.indexOf('""', this.i + 2);
      if (end < 0) throw new ParseError(`Unterminated string in ${this.src}`);
      const v = `"${this.src.slice(this.i + 2, end)}"`;
      this.i = end + 2;
      return { k: 'str', v };
    }
    if (c === '"') {
      this.i++;
      const end = this.src.indexOf('"', this.i);
      if (end < 0) throw new ParseError(`Unterminated string in ${this.src}`);
      const v = this.src.slice(this.i, end);
      this.i = end + 1;
      return { k: 'str', v };
    }
    if (c === '[') {
      this.i++;
      const e = this.arith();
      this.expect(']');
      return e;
    }
    if (c === '{') return { k: 'block', body: this.block() };
    if (c === '-' || c === '+') {
      // Signed literal in argument position, e.g. RUNCLONES("X",-1,-1,...).
      this.i++;
      const inner = this.primary();
      if (inner.k === 'num') return c === '-' ? { k: 'num', v: -inner.v, raw: '-' + inner.raw } : inner;
      return c === '-' ? { k: 'arith', operands: [{ k: 'num', v: 0, raw: '0' }, inner], ops: ['-'] } : inner;
    }
    const word = this.ident();
    if (!word) throw new ParseError(`Unexpected '${c}' at ${this.i} in ${this.src}`);
    if (/^\$\d+$/.test(word)) return { k: 'arg', index: Number(word.slice(1)) };
    if (/^\d+(\.\d+)?$/.test(word)) return { k: 'num', v: Number(word), raw: word };
    return { k: 'ident', name: word.toUpperCase() };
  }

  private expr(): Expr {
    let e = this.primary();
    while (this.eat('^')) {
      const method = this.ident().toUpperCase();
      const args = this.eat('(') ? this.args() : [];
      e = { k: 'call', target: e, method, args };
    }
    return e;
  }

  private arith(): Expr {
    const operands: Expr[] = [this.expr()];
    const ops: ArithOp[] = [];
    for (;;) {
      this.skipWs();
      const c = this.peek() as ArithOp;
      if (c !== '+' && c !== '-' && c !== '*' && c !== '@' && c !== '%') break;
      this.i++;
      ops.push(c);
      operands.push(this.expr());
    }
    return operands.length === 1 ? operands[0] : { k: 'arith', operands, ops };
  }
}

/** Parse a `{...}` code value. */
export function parseCode(src: string): Stmt[] {
  const p = new Parser(src.trim());
  const body = p.block();
  return body;
}

/** Parse a single expression, e.g. a CONDITION operand or an argument string. */
export function parseExpr(src: string): Expr {
  const p = new Parser(`{${src}}`);
  const body = p.block();
  if (body.length !== 1 || body[0].k !== 'expr') throw new ParseError(`Not an expression: ${src}`);
  return body[0].e;
}
