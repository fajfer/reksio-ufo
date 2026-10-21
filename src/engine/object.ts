// Base class for every scripted object (CMC_Object).

import type { ObjectDef } from '../formats/cnv.ts';
import { BREAK, argValue, type Arg, type CallResult, type Ctx, type ScriptObject } from '../script/interpreter.ts';
import { Value } from '../script/values.ts';
import type { Engine } from './engine.ts';

export type Method = (args: Arg[], ctx: Ctx) => CallResult;

export class GameObject implements ScriptObject {
  readonly name: string;
  readonly type: string;
  readonly props: Map<string, string>;
  readonly engine: Engine;
  /** Event handlers keyed "EVENT" or "EVENT^PARAM" -> code block or behaviour name. */
  readonly handlers = new Map<string, string>();
  /** Name of the defining application/episode/scene (also the INI section). */
  containerName = '';
  /** Clone number; 0 for the original. */
  cloneIndex = 0;
  /** The original this object was cloned from. */
  cloneOf: GameObject | null = null;
  clones: GameObject[] = [];
  protected methods = new Map<string, Method>();

  constructor(engine: Engine, def: ObjectDef) {
    this.engine = engine;
    this.name = def.name;
    this.type = (def.props.get('TYPE') ?? '').toUpperCase();
    this.props = def.props;
    for (const [key, value] of def.props) {
      if (key.startsWith('ON')) this.handlers.set(key, value);
    }
    this.method('GETNAME', () => Value.str(this.name));
    this.method('GETCLONEINDEX', () => Value.int(this.cloneIndex));
    this.method('ADDBEHAVIOUR', (args) => {
      // "ONFINISHED$INIT" names the handler key "ONFINISHED^INIT".
      const key = argValue(args[0]).toStr().toUpperCase().replace('$', '^');
      this.handlers.set(key, argValue(args[1]).toStr());
    });
    this.method('REMOVEBEHAVIOUR', (args) => {
      this.handlers.delete(argValue(args[0]).toStr().toUpperCase().replace('$', '^'));
    });
    this.method('CLONE', (args) => {
      this.engine.cloneObject(this, argValue(args[0]).toInt());
    });
  }

  method(name: string, fn: Method): void {
    this.methods.set(name, fn);
  }

  prop(name: string, fallback = ''): string {
    return this.props.get(name) ?? fallback;
  }

  boolProp(name: string, fallback = false): boolean {
    const v = this.props.get(name);
    return v === undefined ? fallback : v.toUpperCase() === 'TRUE';
  }

  numProp(name: string, fallback = 0): number {
    const v = this.props.get(name);
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  asValue(): Value | null {
    return null;
  }

  call(method: string, args: Arg[], ctx: Ctx): CallResult {
    const fn = this.methods.get(method);
    if (!fn) {
      this.engine.warnOnce(`${this.type}^${method} not implemented (${this.name})`);
      return undefined;
    }
    return fn(args, ctx);
  }

  /** Load resources before ONINIT. */
  async load(): Promise<void> {}

  /** Called after every object of a scene is loaded. */
  init(): void {
    this.signal('ONINIT');
  }

  /** Per-frame update; dt in milliseconds. */
  tick(_dt: number): void {}

  /** Release resources when the owning scene is unloaded. */
  dispose(): void {}

  hasHandler(event: string, param?: string): boolean {
    return (param !== undefined && this.handlers.has(`${event}^${param.toUpperCase()}`)) || this.handlers.has(event);
  }

  /**
   * Fire an event. As in CMC_Variable::onChange (0x100b3360) and the
   * CMC_Object::onSignal callers, "EVENT^PARAM" is tried first and plain
   * "EVENT" is the fallback. Returns BREAK if the handler broke.
   */
  signal(event: string, param?: string, params: string[] = []): typeof BREAK | undefined {
    let handler: string | undefined;
    if (param !== undefined) handler = this.handlers.get(`${event}^${param.toUpperCase()}`);
    handler ??= this.handlers.get(event);
    if (handler === undefined) return undefined;
    if (this.engine.trace) console.debug(`[signal] ${this.name}:${event}${param !== undefined ? '^' + param : ''}`);
    return this.engine.runHandler(handler, this, params);
  }
}
