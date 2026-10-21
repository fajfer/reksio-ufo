import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BREAK,
  Interpreter,
  ONE_BREAK,
  argValue,
  fillParams,
  splitArgs,
  splitStatements,
  type Arg,
  type CallResult,
  type Ctx,
  type ScriptHost,
  type ScriptObject,
} from '../src/script/interpreter.ts';
import { Value, calculate, literal } from '../src/script/values.ts';
import { decodeText, parseDefinitions } from '../src/formats/cnv.ts';

class Var implements ScriptObject {
  readonly name: string;
  readonly type: string;
  value: Value;
  constructor(name: string, value: Value) {
    this.name = name;
    this.type = value.kind;
    this.value = value;
  }
  asValue() {
    return this.value;
  }
  call(method: string, args: Arg[]): CallResult {
    if (method === 'SET') this.value = argValue(args[0]).convert(this.value.kind);
    if (method === 'GET') return this.value;
    if (method === 'INC') this.value = Value.int(this.value.toInt() + 1);
    return undefined;
  }
}

class Recorder implements ScriptObject {
  readonly name: string;
  readonly type = 'ANIMO';
  calls: string[] = [];
  constructor(name: string) {
    this.name = name;
  }
  asValue() {
    return null;
  }
  call(method: string, args: Arg[]): CallResult {
    this.calls.push(`${method}(${args.map((a) => argValue(a).toStr()).join(',')})`);
    if (method === 'BRK') return BREAK;
    if (method === 'ONEBRK') return ONE_BREAK;
    return undefined;
  }
}

function setup(objects: ScriptObject[]) {
  const map = new Map(objects.map((o) => [o.name, o]));
  const warnings: string[] = [];
  const host: ScriptHost = {
    find: (n) => map.get(n.toUpperCase()) ?? null,
    keyword: () => undefined,
    warn: (m) => warnings.push(m),
  };
  return { interp: new Interpreter(host), warnings };
}

const ctx = (params: string[] = [], self: ScriptObject | null = null): Ctx => ({ self, params });

test('statement splitting strips spaces and ignores quotes', () => {
  assert.deepEqual(splitStatements('{A^SET("x y");B^RUN(C^GET(1;2));}'), ['A^SET("xy")', 'B^RUN(C^GET(1;2))']);
  assert.deepEqual(splitStatements('{PRZYGODA^GOTO("S62_PAKMAN");]'), ['PRZYGODA^GOTO("S62_PAKMAN")']);
});

test('argument splitting tolerates the broken quote in the race scene', () => {
  const parts = splitArgs('"ANNCAR0,"ANNCAR1","ANNCAR2","ANNCAR3"');
  assert.deepEqual(parts.map((p) => literal(p).toStr()), ['ANNCAR0', 'ANNCAR1', 'ANNCAR2', 'ANNCAR3']);
});

test('$n substitution is textual and leaves $WAVS alone', () => {
  assert.equal(fillParams('$1^PLAY("$2")', ['ANNWORM_1', 'GO']), 'ANNWORM_1^PLAY("GO")');
  assert.equal(fillParams('S^LOAD("$WAVS\\X.WAV")', ['A']), 'S^LOAD("$WAVS\\X.WAV")');
});

test('literals', () => {
  assert.deepEqual(literal('12'), Value.int(12));
  assert.deepEqual(literal('-3.5'), Value.double(-3.5));
  assert.deepEqual(literal('TRUE'), Value.bool(true));
  assert.deepEqual(literal('""OPEN""'), Value.str('"OPEN"'));
  assert.deepEqual(literal('GADA'), Value.str('GADA'));
});

test('arithmetic is left to right, typed by the left operand', () => {
  const a = new Var('A', Value.int(2));
  const { interp } = setup([a, new Var('S', Value.str('ANIMO'))]);
  assert.equal(interp.evalExpression('A+3*4', ctx()).toInt(), 20);
  assert.equal(interp.evalExpression('7@2', ctx()).toInt(), 3);
  assert.equal(interp.evalExpression('S+A', ctx()).toStr(), 'ANIMO2');
  assert.equal(interp.evalExpression('"X"+[A-1]', ctx()).toStr(), 'X1');
  assert.equal(calculate(Value.str('A'), Value.int(1), '-').toStr(), 'A');
});

test('dynamic targets, THIS and nested calls', () => {
  const a3 = new Recorder('ANIMO3');
  const self = new Recorder('ME');
  const v = new Var('V', Value.int(5));
  const { interp } = setup([a3, v, self]);
  interp.runCode('{["ANIMO"+$1]^HIDE();THIS^SHOW([V^GET()+1]);V^INC();}', ctx(['3'], self));
  assert.deepEqual(a3.calls, ['HIDE()']);
  assert.deepEqual(self.calls, ['SHOW(6)']);
  assert.equal(v.value.toInt(), 6);
});

test('variables pass by reference, other objects by name', () => {
  const r = new Recorder('R');
  const { interp } = setup([r, new Var('V', Value.int(9)), new Recorder('OTHER')]);
  interp.runCode('{R^X(V,OTHER,UNKNOWN);}', ctx());
  assert.deepEqual(r.calls, ['X(9,OTHER,UNKNOWN)']);
});

test('BREAK propagates, ONE_BREAK stops only the current block', () => {
  const r = new Recorder('R');
  const { interp } = setup([r]);
  assert.equal(interp.runCode('{R^A();R^BRK();R^B();}', ctx()), BREAK);
  assert.equal(interp.runCode('{R^ONEBRK();R^C();}', ctx()), undefined);
  assert.deepEqual(r.calls, ['A()', 'BRK()', 'ONEBRK()']);
});

test('unknown objects warn instead of throwing', () => {
  const { interp, warnings } = setup([]);
  interp.runCode('{NOPE^HIDE();}', ctx());
  assert.equal(warnings.length, 1);
});

const GAME = process.env.REKSIO_DATA ?? '/home/fajfer/reksio/pfx/drive_c/Program Files (x86)/AidemMedia/Reksio i UFO/DANE';
test('every shipped statement has a call shape', { skip: !existsSync(GAME) }, () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  let n = 0;
  const odd: string[] = [];
  for (const f of walk(GAME).filter((p) => /\.(cnv|def)$/i.test(p))) {
    for (const def of parseDefinitions(decodeText(readFileSync(f)))) {
      for (const value of def.props.values()) {
        if (!value.startsWith('{')) continue;
        for (const s of splitStatements(value)) {
          n++;
          if (!s.startsWith('@') && !/^[^(]*\^/.test(s)) odd.push(`${def.name}: ${s}`);
        }
      }
    }
  }
  assert.ok(n > 8000, `only ${n} statements`);
  // Known oddities in shipped data: the debug "kontrola" scene uses '>' for '^'.
  // Bare names (e.g. `{B_NULL;}`) are no-ops.
  const unexpected = odd.filter((s) => !s.includes('>') && !/: ([A-Z0-9_]+|[}\]]+)$/.test(s));
  assert.deepEqual(unexpected.slice(0, 5), []);
});
