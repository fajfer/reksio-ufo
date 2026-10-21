import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCode } from '../src/script/parser.ts';
import { decodeText, parseDefinitions } from '../src/formats/cnv.ts';

test('parses calls, args, arithmetic and keywords', () => {
  const ast = parseCode('{THIS^PLAY("1");V^SET([A^GET(0)-1]);["BEH"+$1]^RUN();@IF("V","_","FALSE","B1","");X^ADD(-1,3.5):;}');
  assert.equal(ast.length, 5);
  assert.deepEqual(ast[0], {
    k: 'expr',
    e: { k: 'call', target: { k: 'ident', name: 'THIS' }, method: 'PLAY', args: [{ k: 'str', v: '1' }] },
  });
  const set = ast[1];
  assert.ok(set.k === 'expr' && set.e.k === 'call' && set.e.args[0].k === 'arith');
  const dyn = ast[2];
  assert.ok(dyn.k === 'expr' && dyn.e.k === 'call' && dyn.e.target.k === 'arith');
  assert.equal(ast[3].k, 'keyword');
  const add = ast[4];
  assert.ok(add.k === 'expr' && add.e.k === 'call');
  assert.deepEqual(add.e.args.map((a) => (a.k === 'num' ? a.v : null)), [-1, 3.5]);
});

test('parses nested brackets', () => {
  const ast = parseCode('{S^SET([SC+[I-1]]);}');
  assert.equal(ast.length, 1);
});

const GAME = process.env.REKSIO_DATA ?? '/home/fajfer/reksio/pfx/drive_c/Program Files (x86)/AidemMedia/Reksio i UFO/DANE';
test('parses every code value in the game', { skip: !existsSync(GAME) }, () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  let n = 0;
  const failures: string[] = [];
  for (const f of walk(GAME).filter((p) => /\.(cnv|def)$/i.test(p))) {
    for (const def of parseDefinitions(decodeText(readFileSync(f)))) {
      for (const [prop, value] of def.props) {
        if (!value.startsWith('{')) continue;
        n++;
        try {
          parseCode(value);
        } catch (e) {
          failures.push(`${def.name}:${prop}: ${(e as Error).message}`);
        }
      }
    }
  }
  assert.ok(n > 3000, `only ${n} code values found`);
  assert.deepEqual(failures.slice(0, 5), []);
});

test('recovers from a malformed statement without losing its neighbours', () => {
  const ast = parseCode('{A^HIDE();GLINA>PLAY("OK");B^SHOW();}');
  assert.deepEqual(
    ast.map((s) => s.k),
    ['expr', 'error', 'expr'],
  );
});
