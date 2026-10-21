// The runtime: object containers (application -> episode -> scene), script
// host, scene switching, input routing and the main loop.

import type { ObjectDef } from '../formats/cnv.ts';
import { decodeText, parseDefinitions } from '../formats/cnv.ts';
import { decodeImg } from '../formats/img.ts';
import {
  BREAK,
  Interpreter,
  argValue,
  type Arg,
  type CallResult,
  type Ctx,
  type ScriptHost,
  type ScriptObject,
} from '../script/interpreter.ts';
import { Value, literal } from '../script/values.ts';
import { AudioSystem, Voice } from './audio.ts';
import { normalizePath, PathResolver, type GameFS } from './fs.ts';
import { IniStore } from './ini.ts';
import { Behaviour, ComplexCondition, Condition, Expression, Group, Rand, Timer, Vector } from './logic.ts';
import { Animo, Graphic, ImageObj, Music, Sound } from './media.ts';
import { GameObject } from './object.ts';
import { Project } from './project.ts';
import { Renderer, SCREEN_H, SCREEN_W, makeSprite } from './renderer.ts';
import { Sequence } from './sequence.ts';
import { Filter, StaticFilter } from './filters.ts';
import { Matrix } from './matrix.ts';
import { Font } from './fonts.ts';
import { Button, CanvasObserver, Keyboard, Mouse, TextObj } from './ui.ts';
import { ArrayVar, BoolVar, DoubleVar, IntegerVar, StringVar } from './variables.ts';

type Ctor = new (engine: Engine, def: ObjectDef) => GameObject;

const FACTORY: Record<string, Ctor> = {
  INTEGER: IntegerVar,
  DOUBLE: DoubleVar,
  STRING: StringVar,
  BOOL: BoolVar,
  ARRAY: ArrayVar,
  BEHAVIOUR: Behaviour,
  CONDITION: Condition,
  COMPLEXCONDITION: ComplexCondition,
  EXPRESSION: Expression,
  TIMER: Timer,
  RAND: Rand,
  GROUP: Group,
  VECTOR: Vector,
  ANIMO: Animo,
  IMAGE: ImageObj,
  SOUND: Sound,
  MUSIC: Music,
  SEQUENCE: Sequence,
  BUTTON: Button,
  MOUSE: Mouse,
  KEYBOARD: Keyboard,
  CANVAS_OBSERVER: CanvasObserver,
  CANVASOBSERVER: CanvasObserver,
  TEXT: TextObj,
  FONT: Font,
  STATICFILTER: StaticFilter,
  FILTER: Filter,
  MATRIX: Matrix,
};

class Container {
  readonly name: string;
  readonly objects = new Map<string, GameObject>();
  readonly list: GameObject[] = [];

  constructor(name: string) {
    this.name = name;
  }

  add(o: GameObject): void {
    this.objects.set(o.name, o);
    this.list.push(o);
  }
}

/** Reflective call used by APPLICATION^RUN and SCENE^RUN: RUN(obj, method, args...). */
function reflectiveRun(engine: Engine, args: Arg[], ctx: Ctx): CallResult {
  const target = engine.find(argValue(args[0]).toStr());
  if (!target) return undefined;
  return target.call(argValue(args[1]).toStr().toUpperCase(), args.slice(2), ctx);
}

class ApplicationObj extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('RUN', (a, ctx) => reflectiveRun(engine, a, ctx));
    this.method('EXIT', () => engine.exit());
    this.method('SETLANGUAGE', (a) => {
      engine.language = argValue(a[0]).toStr();
    });
    this.method('GETLANGUAGE', () => Value.str(engine.language));
  }
}

class EpisodeObj extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('GOTO', (a) => engine.requestScene(argValue(a[0]).toStr()));
    this.method('BACK', () => engine.back());
    this.method('GETLATESTSCENE', () => Value.str(engine.previousScene ?? ''));
    this.method('GETCURRENTSCENE', () => Value.str(engine.sceneName ?? ''));
  }
}

class SceneObj extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('RUN', (a, ctx) => reflectiveRun(engine, a, ctx));
    // RUNCLONES(name, from, to, behaviour): run behaviour with $1 = each clone's name.
    this.method('RUNCLONES', (a, ctx) => {
      const base = engine.find(argValue(a[0]).toStr());
      const beh = engine.find(argValue(a[3]).toStr());
      if (!base || !(beh instanceof Behaviour)) return undefined;
      const from = argValue(a[1]).toInt();
      const to = argValue(a[2]).toInt();
      for (const c of base.clones) {
        if ((from >= 0 && c.cloneIndex < from) || (to >= 0 && c.cloneIndex > to)) continue;
        if (beh.run(ctx.self, [c.name], true) === BREAK) break;
      }
      return undefined;
    });
    this.method('SETMUSICVOLUME', (a) => engine.setMusicVolume(argValue(a[0]).toInt()));
    this.method('GETMUSICVOLUME', () => Value.int(engine.musicVolume));
    this.method('SETMINHSPRIORITY', (a) => {
      engine.minHotspotPriority = argValue(a[0]).toInt();
    });
    this.method('PAUSE', () => {
      engine.paused = true;
    });
    this.method('RESUME', () => {
      engine.paused = false;
    });
    this.method('STARTMUSIC', () => engine.playSceneMusic());
    this.method('STOPMUSIC', () => engine.stopMusic());
  }
}

/** CNVLOADER^LOAD("X.CNV"): add another definitions file to the current scene. */
class CnvLoader extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('LOAD', (a) => engine.loadExtraCnv(argValue(a[0]).toStr()));
    this.method('RELEASE', () => undefined);
  }
}

FACTORY.CNVLOADER = CnvLoader;

export interface InputState {
  x: number;
  y: number;
  enabled: boolean;
  keys: Set<string>;
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ' ': 'SPACE',
  Enter: 'ENTER',
  Escape: 'ESCAPE',
};

export class Engine implements ScriptHost {
  readonly fs: GameFS;
  readonly resolver: PathResolver;
  readonly renderer: Renderer;
  readonly audio: AudioSystem;
  readonly interp: Interpreter;
  readonly ini: IniStore;
  project!: Project;

  readonly input: InputState = { x: 0, y: 0, enabled: true, keys: new Set() };
  readonly buttons = new Set<Button>();
  readonly mice = new Set<Mouse>();
  readonly keyboards = new Set<Keyboard>();

  language = '0415';
  sceneName: string | null = null;
  previousScene: string | null = null;
  currentContainerName = '';
  minHotspotPriority = -Infinity;
  musicVolume = 1000;
  paused = false;
  /** Log every fired handler (?trace=1). */
  trace = false;

  private app!: Container;
  private episode!: Container;
  private scene: Container | null = null;
  private pendingScene: string | null = null;
  /** Extra .CNV files of the current scene dir, pre-read so CNVLOADER^LOAD is synchronous. */
  private extraCnv = new Map<string, ObjectDef[]>();
  private switching = false;
  private orderCounter = 0;
  private returnSlots: (Value | undefined)[] = [];
  private warned = new Set<string>();
  private music: { file: string; voice: Voice | null } | null = null;
  private hover: Button | Animo | null = null;
  private pressed: Button | Animo | null = null;
  private canvas: HTMLCanvasElement;
  private lastTime = 0;
  private running = false;

  constructor(fs: GameFS, canvas: HTMLCanvasElement) {
    this.fs = fs;
    this.canvas = canvas;
    this.resolver = new PathResolver(fs);
    this.renderer = new Renderer(canvas);
    this.audio = new AudioSystem(fs);
    this.interp = new Interpreter(this);
    this.ini = new IniStore('reksio-ufo');
  }

  // --- ScriptHost ------------------------------------------------------------

  find(rawName: string): GameObject | null {
    const name = rawName.toUpperCase();
    for (const c of [this.scene, this.episode, this.app]) {
      if (!c) continue;
      const o = c.objects.get(name) ?? (name.endsWith('_0') ? c.objects.get(name.slice(0, -2)) : undefined);
      if (o) return o;
    }
    return null;
  }

  keyword(name: string, args: Arg[], ctx: Ctx): CallResult {
    switch (name) {
      case 'IF': {
        // @IF(A, OP, B, THEN, ELSE): keyword runner 0x10066590 case 1 ->
        // sub_10066750 -> CMC_Condition::valid(container, A, OP, B)
        // (0x10060ab0). A and B are evaluated like CONDITION operands.
        const operand = (a: Arg | undefined) => argValue(this.interp.resolveParameter(argValue(a).toStr(), { self: null, params: [] }));
        const lhs = operand(args[0]);
        const rhs = operand(args[2]);
        const op = argValue(args[1]).toStr();
        const cmp = lhs.compare(rhs);
        const eq = lhs.equals(rhs);
        const ok =
          op === '_' ? eq : op === '!_' || op === '<>' ? !eq : op === '<' ? cmp < 0 : op === '<_' ? cmp <= 0 : op === '>' ? cmp > 0 : op === '>_' ? cmp >= 0 : false;
        // A branch naming an object runs it; other text runs as inline code.
        const branch = argValue(args[ok ? 3 : 4]).toStr();
        if (!branch) return undefined;
        if (this.find(branch)) return this.runHandler(branch, ctx.self as GameObject | null, ctx.params);
        return this.interp.runCode(`{${branch}}`, ctx);
      }
      case 'RETURN':
        if (this.returnSlots.length) this.returnSlots[this.returnSlots.length - 1] = argValue(args[0]);
        return undefined;
      case 'GETCURRENTSCENE':
        return Value.str(this.sceneName ?? '');
      case 'GETAPPLICATIONNAME':
        return Value.str(this.project.appName);
      case 'MSGBOX':
        console.info('[MSGBOX]', ...args.map((a) => argValue(a).toStr()));
        return undefined;
      default:
        this.warnOnce(`@${name} not implemented`);
        return undefined;
    }
  }

  warn(message: string): void {
    console.warn(message);
  }

  warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    console.warn(message);
  }

  // --- object helpers --------------------------------------------------------

  nextOrder(): number {
    return this.orderCounter++;
  }

  /**
   * Run an event handler value: a `{code}` block, a behaviour name, or a
   * behaviour name with arguments like `BEHFINISHEDMOVE(0)`.
   */
  runHandler(handler: string, self: GameObject | null, params: string[]): typeof BREAK | undefined {
    const h = handler.trim();
    if (h.startsWith('{')) return this.interp.runCode(h, { self, params });
    const m = /^([^(]+)(?:\((.*)\))?$/.exec(h);
    if (!m) return undefined;
    const beh = this.find(m[1]);
    if (!(beh instanceof Behaviour)) {
      if (h) this.warnOnce(`Handler ${h} is not a behaviour`);
      return undefined;
    }
    const args = m[2] !== undefined ? m[2].split(',').map((s) => argValue(this.interp.resolveParameter(s, { self, params })).toStr()) : params;
    return beh.run(self, args, true);
  }

  /** Run fn with a fresh @RETURN slot (the "__RETURN__" object of the original). */
  withReturnSlot(fn: () => typeof BREAK | undefined): { broke: boolean; value: Value | undefined } {
    this.returnSlots.push(undefined);
    try {
      const r = fn();
      return { broke: r === BREAK, value: this.returnSlots[this.returnSlots.length - 1] };
    } finally {
      this.returnSlots.pop();
    }
  }

  /** CLONE(n): create NAME_1..NAME_n sharing the original's definition. */
  cloneObject(src: GameObject, count: number): void {
    const container = [this.scene, this.episode, this.app].find((c) => c?.objects.get(src.name) === src);
    if (!container) return;
    for (let i = 0; i < count; i++) {
      const idx = src.clones.length + 1;
      const def: ObjectDef = { name: `${src.name}_${idx}`, props: new Map(src.props) };
      const ctor = FACTORY[src.type];
      if (!ctor) return;
      const clone = new ctor(this, def);
      clone.cloneIndex = idx;
      clone.containerName = src.containerName;
      // Resources are shared lazily: the original may still be loading
      // (CNVLOADER objects are cloned right after LOAD).
      clone.cloneOf = src;
      if (clone instanceof Animo && src instanceof Animo && src.ann) clone.copyResourcesFrom(src);
      if (clone instanceof ArrayVar && src instanceof ArrayVar) clone.items = [];
      src.clones.push(clone);
      container.add(clone);
      if (clone instanceof Graphic) {
        clone.x = (src as Graphic).x;
        clone.y = (src as Graphic).y;
        this.renderer.add(clone);
      }
    }
  }

  findAnimoByFile(normalizedFile: string): Animo | null {
    for (const c of [this.scene, this.episode, this.app]) {
      if (!c) continue;
      for (const o of c.list) if (o instanceof Animo && normalizePath(o.prop('FILENAME')) === normalizedFile) return o;
    }
    return null;
  }

  // --- media -----------------------------------------------------------------

  playSfx(file: string): void {
    const path = this.resolver.resolve(file);
    if (!path) return this.warnOnce(`Missing sound ${file}`);
    this.audio
      .load(path)
      .then((buf) => {
        const v = new Voice(this.audio, buf, this.audio.sfxBus);
        v.onEnded = () => v.dispose();
        v.play();
      })
      .catch(() => undefined);
  }

  playMusic(file: string): void {
    if (this.music?.file === file.toUpperCase()) return;
    this.stopMusic();
    const path = this.resolver.resolve(file);
    if (!path) return this.warnOnce(`Missing music ${file}`);
    const entry: { file: string; voice: Voice | null } = { file: file.toUpperCase(), voice: null };
    this.audio
      .load(path)
      .then((buf) => {
        if (this.music !== entry) return;
        const v = new Voice(this.audio, buf, this.audio.musicBus);
        v.loop = true;
        v.play();
        entry.voice = v;
      })
      .catch(() => undefined);
    this.music = entry;
  }

  stopMusic(): void {
    this.music?.voice?.dispose();
    this.music = null;
  }

  playSceneMusic(): void {
    const info = this.sceneName ? this.project.scenes.get(this.sceneName) : undefined;
    if (info?.music) this.playMusic(info.music);
  }

  setMusicVolume(v: number): void {
    // TODO(unverified): scale of SETMUSICVOLUME; scripts use 0..1000.
    this.musicVolume = v;
    this.audio.musicBus.gain.value = Math.max(0, Math.min(1, v / 1000));
  }

  async setBackground(file: string): Promise<void> {
    const path = this.resolver.resolve(file);
    if (!path) return this.warnOnce(`Missing background ${file}`);
    const img = decodeImg(await this.fs.read(path));
    this.renderer.background = makeSprite(img.width, img.height, img.rgba);
  }

  setCursor(kind: string): void {
    this.canvas.style.cursor = kind === 'NONE' ? 'none' : kind === 'ACTIVE' ? 'pointer' : 'default';
  }

  exit(): void {
    this.running = false;
    this.stopMusic();
    document.dispatchEvent(new CustomEvent('reksio-exit'));
  }

  // --- loading ---------------------------------------------------------------

  private createObjects(defs: ObjectDef[], container: Container): GameObject[] {
    const created: GameObject[] = [];
    this.currentContainerName = container.name;
    for (const def of defs) {
      const type = (def.props.get('TYPE') ?? '').toUpperCase();
      const ctor = FACTORY[type];
      if (!ctor) {
        this.warnOnce(`Object type ${type} not implemented (${def.name})`);
        continue;
      }
      const o = new ctor(this, def);
      o.containerName = container.name;
      container.add(o);
      created.push(o);
    }
    return created;
  }

  private builtins(container: Container): GameObject[] {
    const mk = (name: string, type: string, ctor: Ctor) => {
      const o = new ctor(this, { name, props: new Map([['TYPE', type]]) });
      o.containerName = container.name;
      container.add(o);
      return o;
    };
    return [mk('RANDOM', 'RAND', Rand), mk('CNVLOADER', 'CNVLOADER', CnvLoader)];
  }

  private async loadAll(objs: GameObject[]): Promise<void> {
    await Promise.all(
      objs.map((o) =>
        o.load().catch((e: unknown) => {
          this.warn(`Failed to load ${o.name}: ${(e as Error).message}`);
        }),
      ),
    );
  }

  async start(startScene?: string): Promise<void> {
    this.project = await Project.load(this.resolver);
    // First run: adopt the original game's save (Ufo.ini) so progress carries over.
    const iniFile = `${this.project.appName}.ini`;
    if (this.ini.empty && this.fs.has(iniFile)) this.ini.importIni(new TextDecoder('windows-1250').decode(await this.fs.read(iniFile)));
    const episodeInfo = this.project.episodes.get(this.project.startEpisode)!;
    this.resolver.setSearchDirs([Project.dir(episodeInfo.path), Project.dir(this.project.appPath)]);

    // Application.def objects: the APPLICATION, its EPISODEs and SCENEs.
    this.app = new Container(this.project.appName);
    const appDefs = parseDefinitions(decodeText(await this.fs.read('DANE/Application.def')));
    for (const def of appDefs) {
      const type = def.props.get('TYPE');
      const ctor = type === 'APPLICATION' ? ApplicationObj : type === 'EPISODE' ? EpisodeObj : type === 'SCENE' ? SceneObj : null;
      if (ctor) this.app.add(new ctor(this, def));
    }
    const appObjs = this.createObjects(await this.project.loadObjects(this.resolver, this.project.appPath, this.project.appName), this.app);
    this.episode = new Container(episodeInfo.name);
    const epObjs = this.createObjects(await this.project.loadObjects(this.resolver, episodeInfo.path, episodeInfo.name), this.episode);
    await this.loadAll([...appObjs, ...epObjs]);
    for (const o of [...appObjs, ...epObjs]) o.init();

    this.attachInput();
    await this.switchScene(startScene ?? episodeInfo.startWith);
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  requestScene(name: string): void {
    this.pendingScene = name.toUpperCase();
  }

  back(): void {
    if (this.previousScene) this.requestScene(this.previousScene);
  }

  /** CMC_Scene::initialize (0x10099b90): objects, ONINIT, then __INIT__. */
  private async switchScene(name: string): Promise<void> {
    const info = this.project.scenes.get(name.toUpperCase());
    if (!info) {
      this.warn(`Unknown scene ${name}`);
      return;
    }
    this.switching = true;
    if (this.scene) {
      for (const o of this.scene.list) o.dispose();
      this.renderer.clear();
      this.audio.clearCache();
    }
    this.hover = this.pressed = null;
    this.minHotspotPriority = -Infinity;
    this.paused = false;
    this.previousScene = this.sceneName;
    this.sceneName = info.name;
    const episode = this.project.episodes.get(this.episode.name)!;
    this.resolver.setSearchDirs([Project.dir(info.path), Project.dir(episode.path), Project.dir(this.project.appPath)]);

    // Episode/app graphics persist across scenes.
    for (const c of [this.app, this.episode]) for (const o of c.list) if (o instanceof Graphic) this.renderer.add(o);

    this.extraCnv.clear();
    const mainCnv = Project.cnvFor(this.resolver, info.path, info.name);
    const extras = this.fs.list(Project.dir(info.path)).filter((f) => f.endsWith('.cnv') && f !== (mainCnv && normalizePath(mainCnv)));
    await Promise.all(
      extras.map(async (f) => this.extraCnv.set(f, parseDefinitions(decodeText(await this.fs.read(f))))),
    );

    const container = new Container(info.name);
    this.scene = container;
    const objs = [...this.builtins(container), ...this.createObjects(await this.project.loadObjects(this.resolver, info.path, info.name), container)];
    const bg = info.background ? this.setBackground(info.background) : Promise.resolve();
    await Promise.all([bg, this.loadAll(objs)]);
    this.playSceneMusic();

    for (const o of objs) o.init();
    const init = container.objects.get('__INIT__');
    const sceneObj = this.app.objects.get(info.name) ?? null;
    if (init instanceof Behaviour) init.run(sceneObj, [], true);
    sceneObj?.signal('ONINIT');
    this.switching = false;
    console.info(`Scene ${info.name}: ${objs.length} objects`);
  }

  /**
   * CNVLOADER^LOAD: objects are created immediately (scripts use them on the
   * next line); their resources load in the background and ONINIT fires once
   * they are ready.
   */
  loadExtraCnv(file: string): void {
    const container = this.scene;
    if (!container) return;
    const path = this.resolver.resolve(file);
    const defs = path ? this.extraCnv.get(normalizePath(path)) : undefined;
    if (!defs) return this.warn(`CNVLOADER: missing ${file}`);
    const objs = this.createObjects(defs, container);
    void this.loadAll(objs).then(() => {
      if (this.scene !== container) return;
      for (const o of objs) o.init();
    });
  }

  // --- main loop -------------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(100, now - this.lastTime) * this.audio.speed;
    this.lastTime = now;
    if (!this.switching) {
      if (!this.paused) {
        for (const c of [this.app, this.episode, this.scene]) {
          if (!c) continue;
          for (const o of [...c.list]) o.tick(dt);
        }
      }
      if (this.pendingScene) {
        const next = this.pendingScene;
        this.pendingScene = null;
        void this.switchScene(next);
      }
    }
    this.renderer.render();
    requestAnimationFrame(this.frame);
  };

  // --- debugging ---------------------------------------------------------------

  /** Active hotspots with a clickable point each (used by tools/fuzz.ts). */
  debugHotspots(): { name: string; x: number; y: number }[] {
    const out: { name: string; x: number; y: number }[] = [];
    const probe = (name: string, x0: number, y0: number, w: number, h: number) => {
      // Sample a small grid and keep the first point that really hits.
      for (let gy = 1; gy < 6; gy++) {
        for (let gx = 1; gx < 6; gx++) {
          const x = Math.round(x0 + (w * gx) / 6);
          const y = Math.round(y0 + (h * gy) / 6);
          const h2 = this.hotspotAt(x, y);
          if (h2 && h2.name === name) return void out.push({ name, x, y });
        }
      }
    };
    for (const b of this.buttons) {
      if (!b.enabled || !b.visible) continue;
      const r = b.debugRect();
      if (r) probe(b.name, r.x, r.y, r.w, r.h);
    }
    for (const d of this.renderer.topmostFirst()) {
      if (!(d instanceof Animo) || !d.asButton) continue;
      const bb = d.bounds();
      if (bb) probe(d.name, bb.x, bb.y, bb.w, bb.h);
    }
    return out;
  }

  get currentScene(): string | null {
    return this.switching ? null : this.sceneName;
  }

  // --- input -----------------------------------------------------------------

  private toScreen(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * SCREEN_W),
      y: Math.floor(((e.clientY - r.top) / r.height) * SCREEN_H),
    };
  }

  /** Topmost enabled hotspot: BUTTONs and ANIMOs set as buttons. */
  private hotspotAt(x: number, y: number): Button | Animo | null {
    let best: Button | Animo | null = null;
    let bestKey = -Infinity;
    for (const b of this.buttons) {
      if (!b.enabled || !b.visible || !b.contains(x, y)) continue;
      const p = b.hitPriority();
      if (p < this.minHotspotPriority) continue;
      const key = p * 1e6 + b.order;
      if (key > bestKey) [best, bestKey] = [b, key];
    }
    for (const d of this.renderer.topmostFirst()) {
      // Animo buttons hit-test their bounding rect (CXRect::IsInRect in onMouseMove).
      if (!(d instanceof Animo) || !d.asButton || d.priority < this.minHotspotPriority || !d.inRect(x, y)) continue;
      const key = d.priority * 1e6 + d.order;
      if (key > bestKey) [best, bestKey] = [d, key];
      break;
    }
    return best;
  }

  private setHover(h: Button | Animo | null): void {
    if (h === this.hover) return;
    const old = this.hover;
    this.hover = h;
    if (old instanceof Button) old.setState('standard');
    if (old instanceof Animo) old.buttonState('ONFOCUSOFF');
    old?.signal('ONFOCUSOFF');
    if (h instanceof Button) h.setState('move');
    if (h instanceof Animo) h.buttonState('ONFOCUSON');
    h?.signal('ONFOCUSON');
    this.setCursor(h ? 'ACTIVE' : 'ARROW');
  }

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener('mousemove', (e) => {
      const p = this.toScreen(e);
      this.input.x = p.x;
      this.input.y = p.y;
      if (!this.input.enabled || this.switching) return;
      this.setHover(this.hotspotAt(p.x, p.y));
    });
    c.addEventListener('mousedown', (e) => {
      this.audio.resume();
      if (!this.input.enabled || this.switching) return;
      const p = this.toScreen(e);
      const btn = (['LEFT', 'MIDDLE', 'RIGHT'] as const)[e.button] ?? 'LEFT';
      for (const m of [...this.mice]) m.signal('ONCLICK', btn, [btn]);
      if (e.button !== 0) return;
      const h = this.hotspotAt(p.x, p.y);
      this.setHover(h);
      this.pressed = h;
      if (h instanceof Button) {
        h.setState('click');
        h.signal('ONCLICKED');
      } else if (h) {
        // onClick (0x10037260): play ONCLICK, signal ONCLICK^<button> -> ONCLICK.
        h.buttonState('ONCLICK');
        h.signal('ONCLICK', btn, [btn]);
      }
    });
    c.addEventListener('mouseup', (e) => {
      if (!this.input.enabled || this.switching) return;
      const btn = (['LEFT', 'MIDDLE', 'RIGHT'] as const)[e.button] ?? 'LEFT';
      for (const m of [...this.mice]) m.signal('ONRELEASE', btn, [btn]);
      const h = this.pressed;
      this.pressed = null;
      if (!h || e.button !== 0) return;
      if (h instanceof Button) {
        if (h.state === 'click') h.setState(h === this.hover ? 'move' : 'standard');
        h.signal('ONRELEASED');
      } else {
        h.signal('ONRELEASE');
      }
    });
    c.addEventListener('dblclick', () => {
      for (const m of [...this.mice]) m.signal('ONDBLCLICK');
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      this.audio.resume();
      const k = KEY_NAMES[e.key] ?? e.key.toUpperCase();
      if (KEY_NAMES[e.key]) e.preventDefault();
      if (this.input.keys.has(k)) return;
      this.input.keys.add(k);
      for (const kb of [...this.keyboards]) kb.signal('ONKEYDOWN', k, [k]);
    });
    window.addEventListener('keyup', (e) => {
      const k = KEY_NAMES[e.key] ?? e.key.toUpperCase();
      this.input.keys.delete(k);
      for (const kb of [...this.keyboards]) kb.signal('ONKEYUP', k, [k]);
    });
  }
}

export type { ScriptObject };
