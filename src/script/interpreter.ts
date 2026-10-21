// String-based script interpreter, ported from PIKLIB8.dll's own algorithms
// (docs/script-semantics.md). The original never tokenizes: it splits text on
// ';' and ',' by parenthesis depth, substitutes $n textually and resolves each
// piece by its first character. Reproducing that keeps the quirks the shipped
// scripts rely on (e.g. tolerance of unbalanced quotes).

import { Value, calculate, literal, type ArithOp } from './values.ts';

export const BREAK = Symbol('BREAK'); // entry result -1
export const ONE_BREAK = Symbol('ONE_BREAK'); // entry result -2
export type Signal = typeof BREAK | typeof ONE_BREAK;

export interface ScriptObject {
  readonly name: string;
  readonly type: string;
  /** Value of a variable object (types 1-4), else null. */
  asValue(): Value | null;
  call(method: string, args: Arg[], ctx: Ctx): CallResult;
}

export type Arg = Value | ScriptObject;
export type CallResult = Value | ScriptObject | Signal | undefined | void;

export interface Ctx {
  /** THIS. */
  self: ScriptObject | null;
  /** Raw $1..$9 strings. */
  params: string[];
}

export interface ScriptHost {
  find(name: string): ScriptObject | null;
  keyword(name: string, args: Arg[], ctx: Ctx): CallResult;
  warn(message: string): void;
}

export class ScriptError extends Error {}

export function isSignal(r: unknown): r is Signal {
  return r === BREAK || r === ONE_BREAK;
}

export function argValue(a: Arg | undefined): Value {
  if (!a) return Value.str('');
  if (a instanceof Value) return a;
  return a.asValue() ?? Value.str(a.name);
}

/** Text of a code value with the outer braces removed. */
function stripBraces(code: string): string {
  let s = code.trim();
  if (s.startsWith('{')) s = s.slice(1);
  if (s.endsWith('}') || s.endsWith(']')) s = s.slice(0, -1);
  return s;
}

/** CMC_Behaviour_Entry::getCodeLines (0x10050750). */
export function splitStatements(code: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of stripBraces(code)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    } else if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') continue;
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.length > 0);
}

/** CMC_Behaviour_Entry::fillParams (0x10051d50). */
export function fillParams(line: string, params: string[]): string {
  if (!line.includes('$')) return line;
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '$' && i + 1 < line.length) {
      const idx = line.charCodeAt(i + 1) - 0x31;
      if (idx >= 0 && idx < params.length) {
        out += params[idx];
        i++;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** CMC_Behaviour::resolveParameters (0x1004ea00): ',' at paren depth 0, no quote awareness. */
export function splitArgs(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.filter((s) => s.length > 0);
}

/**
 * Split an expression body into operands and operators at depth 0.
 * TODO(unverified): CMC_Expression's constructor was not traced; this assumes
 * it skips operators inside (), [] and quotes, which all shipped scripts satisfy.
 */
export function splitExpression(text: string): { operands: string[]; ops: ArithOp[] } {
  const operands: string[] = [];
  const ops: ArithOp[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && i > start && (ch === '+' || ch === '-' || ch === '*' || ch === '@' || ch === '%')) {
      operands.push(text.slice(start, i));
      ops.push(ch);
      start = i + 1;
    }
  }
  operands.push(text.slice(start));
  return { operands, ops };
}

/** Index of the ']' matching the '[' at `open`. */
function matchBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

// Types 1-4 plus EXPRESSION (computed on read).
const VARIABLE_TYPES = new Set(['INTEGER', 'STRING', 'BOOL', 'DOUBLE', 'EXPRESSION']);

export class Interpreter {
  private host: ScriptHost;
  private codeCache = new Map<string, string[]>();

  constructor(host: ScriptHost) {
    this.host = host;
  }

  compile(code: string): string[] {
    let lines = this.codeCache.get(code);
    if (!lines) {
      lines = splitStatements(code);
      this.codeCache.set(code, lines);
    }
    return lines;
  }

  /**
   * Run a code block like CMC_Behaviour::run's entry loop: returns BREAK if a
   * statement broke (propagates to callers), otherwise undefined.
   */
  runCode(code: string, ctx: Ctx): typeof BREAK | undefined {
    for (const line of this.compile(code)) {
      const r = this.runStatement(line, ctx);
      if (r === BREAK) return BREAK;
      if (r === ONE_BREAK) return undefined;
    }
    return undefined;
  }

  /** CMC_Behaviour_Entry::run + CMC_Behaviour::runLine for one statement. */
  runStatement(rawLine: string, ctx: Ctx): CallResult {
    const line = fillParams(rawLine, ctx.params);
    try {
      return this.runLine(line, ctx);
    } catch (e) {
      if (e instanceof ScriptError) {
        this.host.warn(`${e.message} in: ${line}`);
        return undefined;
      }
      throw e;
    }
  }

  private runLine(line: string, ctx: Ctx): CallResult {
    // Dynamic target: [expr]^METHOD(args)
    if (line.startsWith('[')) {
      const close = matchBracket(line, 0);
      if (close > 0 && line[close + 1] === '^') {
        const name = this.evalExpression(line.slice(1, close), ctx).toStr();
        return this.callOn(name, line.slice(close + 2), ctx);
      }
    }

    const paren = line.indexOf('(');
    const head = paren >= 0 ? line.slice(0, paren) : line;
    const argText = paren >= 0 ? stripCallParens(line.slice(paren)) : '';

    if (line.startsWith('@')) {
      const args = splitArgs(argText).map((a) => this.resolveParameter(a, ctx));
      return this.host.keyword(head.slice(1).toUpperCase(), args, ctx);
    }

    const firstCaret = head.indexOf('^');
    const lastCaret = head.lastIndexOf('^');
    if (firstCaret < 0) {
      // A bare expression statement (e.g. a stray value); nothing to call.
      if (line.length) this.resolveParameter(line, ctx);
      return undefined;
    }
    let targetName = head.slice(0, firstCaret);
    const method = head.slice(lastCaret + 1).toUpperCase();

    let target: ScriptObject | null;
    if (targetName.startsWith('*')) {
      targetName = argValue(this.resolveParameter(targetName.slice(1), ctx)).toStr();
      target = this.host.find(targetName);
    } else if (targetName.toUpperCase() === 'THIS') {
      target = ctx.self;
    } else {
      target = this.host.find(targetName);
    }
    if (!target) throw new ScriptError(`Unknown object ${targetName}`);
    const args = splitArgs(argText).map((a) => this.resolveParameter(a, ctx));
    return target.call(method, args, ctx);
  }

  private callOn(name: string, rest: string, ctx: Ctx): CallResult {
    const paren = rest.indexOf('(');
    const method = (paren >= 0 ? rest.slice(0, paren) : rest).toUpperCase();
    const argText = paren >= 0 ? stripCallParens(rest.slice(paren)) : '';
    const target = this.host.find(name);
    if (!target) throw new ScriptError(`Unknown object ${name}`);
    return target.call(method, splitArgs(argText).map((a) => this.resolveParameter(a, ctx)), ctx);
  }

  /** CMC_Behaviour::resolveParameter (0x1004ec10). */
  resolveParameter(text: string, ctx: Ctx): Arg {
    const t = text.trim();
    if (t.startsWith('[')) {
      const close = matchBracket(t, 0);
      return this.evalExpression(t.slice(1, close > 0 ? close : t.length), ctx);
    }
    if (t.includes('^') && !t.startsWith('"')) {
      const r = this.runLine(t, ctx);
      if (r === undefined || isSignal(r)) return Value.str('');
      return r as Arg;
    }
    const c = t[0];
    if (c === '-' || c === '"' || (c >= '0' && c <= '9')) return literal(t);
    const obj = this.host.find(t);
    if (obj && VARIABLE_TYPES.has(obj.type)) return obj;
    return literal(t);
  }

  /** CMC_Expression::calculate (0x1006d4c0): strictly left to right. */
  evalExpression(body: string, ctx: Ctx): Value {
    const { operands, ops } = splitExpression(body);
    let acc = argValue(this.resolveParameter(operands[0], ctx));
    for (let i = 0; i < ops.length; i++) {
      acc = calculate(acc, argValue(this.resolveParameter(operands[i + 1], ctx)), ops[i]);
    }
    return acc;
  }
}

/**
 * runLine strips one leading '(' and one trailing ')'. Text after the last ')'
 * is dropped: the intro's `{THIS^PLAY("2"):;}` must still play event "2" for
 * the scene to progress, so the original evidently tolerates trailing junk.
 */
function stripCallParens(s: string): string {
  let r = s;
  if (r.startsWith('(')) r = r.slice(1);
  const close = r.lastIndexOf(')');
  if (close >= 0) r = r.slice(0, close);
  return r;
}
