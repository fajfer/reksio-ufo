// SEQUENCE: plays a .SEQ tree of animation events and lip-synced dialogue.
//
// Tree semantics are inferred from the data: PARAMETER nodes pick a child by
// the 1-based SEQEVENT number of the PLAY argument, SEQUENCE nodes play their
// children in order, RANDOM nodes play one child. SIMPLE leaves play an event
// on the scene ANIMO with the same FILENAME; SPEAKING leaves play a WAV while
// the ANIMO runs PREFIX_START, random PREFIX_<n> loops, then PREFIX_STOP.

import { decodeText, parseSeq, type SeqNode } from '../formats/cnv.ts';
import type { ObjectDef } from '../formats/cnv.ts';
import { argValue } from '../script/interpreter.ts';
import { Value } from '../script/values.ts';
import { Voice } from './audio.ts';
import type { Engine } from './engine.ts';
import { normalizePath } from './fs.ts';
import { Animo } from './media.ts';
import { GameObject } from './object.ts';

type Leaf = Extract<SeqNode, { kind: 'SIMPLE' | 'SPEAKING' }>;

type Running =
  | { leaf: Extract<Leaf, { kind: 'SIMPLE' }>; animo: Animo | null }
  | {
      leaf: Extract<Leaf, { kind: 'SPEAKING' }>;
      animo: Animo | null;
      voice: Voice | null;
      voiceDone: boolean;
      phase: 'start' | 'talk' | 'stop';
    };

export class Sequence extends GameObject {
  private root: SeqNode | null = null;
  private queue: Leaf[] = [];
  private current: Running | null = null;
  private param = '';
  private playing = false;
  /** Bumped on every PLAY/STOP so stale async voice loads are ignored. */
  private generation = 0;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('PLAY', (a) => this.play(argValue(a[0]).toStr()));
    this.method('STOP', (a) => this.stop(a.length ? argValue(a[0]).toBool() : true));
    this.method('ISPLAYING', () => Value.bool(this.playing));
    this.method('HIDE', () => {
      for (const a of this.animos()) a.visible = false;
    });
    this.method('SHOW', () => {
      for (const a of this.animos()) a.visible = true;
    });
  }

  async load(): Promise<void> {
    const f = this.prop('FILENAME');
    const path = f && this.engine.resolver.resolve(f);
    if (!path) {
      if (f) this.engine.warn(`SEQUENCE ${this.name}: missing ${f}`);
      return;
    }
    this.root = parseSeq(decodeText(await this.engine.fs.read(path)));
  }

  private animoFor(file: string): Animo | null {
    const key = normalizePath(file);
    return this.engine.findAnimoByFile(key);
  }

  private animos(): Animo[] {
    const out = new Set<Animo>();
    const visit = (n: SeqNode | null) => {
      if (!n) return;
      if (n.kind === 'SEQUENCE') n.children.forEach(visit);
      else {
        const a = this.animoFor(n.kind === 'SIMPLE' ? n.filename : n.animoFilename);
        if (a) out.add(a);
      }
    };
    visit(this.root);
    return [...out];
  }

  private flatten(node: SeqNode, param: string, out: Leaf[]): void {
    if (node.kind !== 'SEQUENCE') {
      out.push(node);
      return;
    }
    if (node.mode === 'PARAMETER') {
      const idx = node.events.get(param.toUpperCase());
      const child = idx !== undefined ? node.children[idx - 1] : undefined;
      if (child) this.flatten(child, param, out);
      else this.engine.warn(`SEQUENCE ${this.name}: no branch for ${param}`);
    } else if (node.mode === 'RANDOM') {
      const child = node.children[Math.floor(Math.random() * node.children.length)];
      if (child) this.flatten(child, param, out);
    } else {
      for (const c of node.children) this.flatten(c, param, out);
    }
  }

  play(param: string): void {
    if (!this.root) return;
    this.abortCurrent();
    this.generation++;
    this.param = param.toUpperCase();
    this.queue = [];
    this.flatten(this.root, this.param, this.queue);
    this.playing = true;
    this.signal('ONSTARTED', this.param, [this.param]);
    this.next();
  }

  stop(fireEvent: boolean): void {
    if (!this.playing) return;
    this.abortCurrent();
    this.generation++;
    this.queue = [];
    this.playing = false;
    if (fireEvent) this.signal('ONFINISHED', this.param, [this.param]);
  }

  private abortCurrent(): void {
    const cur = this.current;
    this.current = null;
    if (!cur) return;
    if ('voice' in cur) cur.voice?.dispose();
    if (cur.animo?.playing) cur.animo.stop(false);
  }

  private next(): void {
    const leaf = this.queue.shift();
    if (!leaf) {
      this.current = null;
      this.playing = false;
      this.signal('ONFINISHED', this.param, [this.param]);
      return;
    }
    if (leaf.kind === 'SIMPLE') {
      const animo = this.animoFor(leaf.filename);
      this.current = { leaf, animo };
      animo?.play(leaf.event);
      return;
    }
    const animo = this.animoFor(leaf.animoFilename);
    const run: Running = { leaf, animo, voice: null, voiceDone: false, phase: 'start' };
    this.current = run;
    const gen = this.generation;
    const path = this.engine.resolver.resolve(leaf.wavFilename);
    if (path) {
      this.engine.audio
        .load(path)
        .then((buf) => {
          if (gen !== this.generation || this.current !== run) return;
          run.voice = new Voice(this.engine.audio, buf, this.engine.audio.sfxBus);
          run.voice.onEnded = () => (run.voiceDone = true);
          run.voice.play();
        })
        .catch(() => (run.voiceDone = true));
    } else {
      this.engine.warnOnce(`SEQUENCE ${this.name}: missing ${leaf.wavFilename}`);
      run.voiceDone = true;
    }
    if (leaf.starting && animo?.findEvent(`${leaf.prefix}_START`)) animo.play(`${leaf.prefix}_START`);
    else this.talk(run);
  }

  private talkEvents(animo: Animo, prefix: string): string[] {
    const re = new RegExp(`^${prefix}_\\d+$`);
    return animo.ann?.events.filter((e) => re.test(e.name)).map((e) => e.name) ?? [];
  }

  private talk(run: Extract<Running, { voice: unknown }>): void {
    run.phase = 'talk';
    const evs = run.animo ? this.talkEvents(run.animo, run.leaf.prefix) : [];
    if (run.animo && evs.length) run.animo.play(evs[Math.floor(Math.random() * evs.length)]);
  }

  tick(): void {
    const cur = this.current;
    if (!cur || !this.playing) return;
    const animoBusy = !!cur.animo?.playing;
    if (!('voice' in cur)) {
      if (!animoBusy) this.next();
      return;
    }
    if (cur.phase === 'start') {
      if (!animoBusy) this.talk(cur);
    } else if (cur.phase === 'talk') {
      if (cur.voiceDone) {
        cur.phase = 'stop';
        if (cur.leaf.ending && cur.animo?.findEvent(`${cur.leaf.prefix}_STOP`)) cur.animo.play(`${cur.leaf.prefix}_STOP`);
      } else if (!animoBusy) {
        this.talk(cur);
      }
    } else if (!animoBusy) {
      this.next();
    }
  }

  dispose(): void {
    this.abortCurrent();
  }
}
