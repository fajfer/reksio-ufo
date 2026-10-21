// SEQUENCE: plays a .SEQ tree of animation events and lip-synced dialogue.
//
// Tree semantics are inferred from the data: PARAMETER nodes pick a child by
// the 1-based SEQEVENT number of the PLAY argument, SEQUENCE nodes play their
// children in order, RANDOM nodes play one child. SIMPLE leaves play an event
// on the scene ANIMO with the same FILENAME.
//
// SPEAKING leaves follow CSpeakingAnimation (play 0x100d6ee0, playOnOf
// 0x100d6300, onPlayableFinished 0x100d7290, finish 0x100d7420):
//   - with STARTING, PREFIX_START plays first and the WAV starts when it ends;
//   - while the WAV plays, random PREFIX_* events other than START/END/STOP
//     loop (with an empty prefix: events whose name starts with a digit);
//   - when the WAV ends, ENDING plays PREFIX_END, else PREFIX_STOP, if present.

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
      /** Voice requested (after START) but its buffer may still be loading. */
      voiceStarted: boolean;
      voiceDone: boolean;
      phase: 'start' | 'talk' | 'end';
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
    const run: Running = { leaf, animo, voice: null, voiceStarted: false, voiceDone: false, phase: 'start' };
    this.current = run;
    const startEv = this.prefixed(leaf.prefix, 'START');
    if (leaf.starting && animo?.findEvent(startEv)?.frames.length) {
      animo.play(startEv);
    } else {
      this.startVoice(run);
      this.talk(run);
    }
  }

  private prefixed(prefix: string, suffix: string): string {
    return prefix ? `${prefix}_${suffix}` : suffix;
  }

  private startVoice(run: Extract<Running, { voice: unknown }>): void {
    run.voiceStarted = true;
    const gen = this.generation;
    const path = this.engine.resolver.resolve(run.leaf.wavFilename);
    if (!path) {
      this.engine.warnOnce(`SEQUENCE ${this.name}: missing ${run.leaf.wavFilename}`);
      run.voiceDone = true;
      return;
    }
    this.engine.audio
      .load(path)
      .then((buf) => {
        if (gen !== this.generation || this.current !== run) return;
        run.voice = new Voice(this.engine.audio, buf, this.engine.audio.sfxBus);
        run.voice.onEnded = () => (run.voiceDone = true);
        run.voice.play();
      })
      .catch(() => (run.voiceDone = true));
  }

  /** playOnOf: a random talk event, excluding START/END/STOP. */
  private talk(run: Extract<Running, { voice: unknown }>): void {
    run.phase = 'talk';
    const animo = run.animo;
    if (!animo?.ann) return;
    const prefix = run.leaf.prefix;
    const evs = animo.ann.events.filter((e) => {
      if (!e.frames.length) return false;
      if (!prefix) return /^\d/.test(e.name);
      if (!e.name.startsWith(`${prefix}_`)) return false;
      const suffix = e.name.slice(prefix.length + 1);
      return suffix !== 'START' && suffix !== 'END' && suffix !== 'STOP';
    });
    if (evs.length) animo.play(evs[Math.floor(Math.random() * evs.length)].name);
  }

  /** finish: PREFIX_END, else PREFIX_STOP, when ENDING; then the leaf is done. */
  private end(run: Extract<Running, { voice: unknown }>): void {
    run.phase = 'end';
    const animo = run.animo;
    if (!run.leaf.ending || !animo) return;
    for (const suffix of ['END', 'STOP']) {
      const ev = this.prefixed(run.leaf.prefix, suffix);
      if (animo.findEvent(ev)?.frames.length) {
        animo.play(ev);
        return;
      }
    }
    if (animo.playing) animo.stop(false);
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
      if (!animoBusy) {
        this.startVoice(cur);
        this.talk(cur);
      }
    } else if (cur.phase === 'talk') {
      // The voice ending interrupts the current talk loop.
      if (cur.voiceDone) this.end(cur);
      else if (!animoBusy) this.talk(cur);
    } else if (!animoBusy) {
      this.next();
    }
  }

  dispose(): void {
    this.abortCurrent();
  }
}
