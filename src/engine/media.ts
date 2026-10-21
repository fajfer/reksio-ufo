// ANIMO, IMAGE, SOUND, MUSIC.

import { decodeAnnImage, parseAnn, type Ann, type AnnEvent } from '../formats/ann.ts';
import { decodeImg } from '../formats/img.ts';
import type { ObjectDef } from '../formats/cnv.ts';
import { argValue, type Arg } from '../script/interpreter.ts';
import { Value } from '../script/values.ts';
import { Voice } from './audio.ts';
import type { Engine } from './engine.ts';
import { GameObject } from './object.ts';
import { makeSprite, spriteAlphaAt, type Drawable, type Sprite } from './renderer.ts';

const int = (a: Arg | undefined) => argValue(a).toInt();
const str = (a: Arg | undefined) => argValue(a).toStr();

/** Something drawn on the canvas that can also be hit-tested by the mouse. */
export abstract class Graphic extends GameObject implements Drawable {
  x = 0;
  y = 0;
  visible: boolean;
  priority: number;
  readonly order: number;
  opacity = 255;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.visible = this.boolProp('VISIBLE', true);
    this.priority = this.numProp('PRIORITY', 0);
    this.order = engine.nextOrder();
    this.method('SHOW', () => {
      this.visible = true;
    });
    this.method('HIDE', () => {
      this.visible = false;
    });
    this.method('ISVISIBLE', () => Value.bool(this.visible));
    this.method('SETPOSITION', (a) => {
      this.x = int(a[0]);
      this.y = int(a[1]);
    });
    this.method('MOVE', (a) => {
      this.x += int(a[0]);
      this.y += int(a[1]);
    });
    this.method('SETPRIORITY', (a) => {
      this.priority = int(a[0]);
    });
    this.method('GETPRIORITY', () => Value.int(this.priority));
    this.method('SETOPACITY', (a) => {
      this.opacity = Math.max(0, Math.min(255, int(a[0])));
    });
    this.method('GETPOSITIONX', () => Value.int(this.x));
    this.method('GETPOSITIONY', () => Value.int(this.y));
    this.method('GETWIDTH', () => Value.int(this.bounds()?.w ?? 0));
    this.method('GETHEIGHT', () => Value.int(this.bounds()?.h ?? 0));
    this.method('GETCENTERX', () => {
      const b = this.bounds();
      return Value.int(b ? b.x + Math.floor(b.w / 2) : this.x);
    });
    this.method('GETCENTERY', () => {
      const b = this.bounds();
      return Value.int(b ? b.y + Math.floor(b.h / 2) : this.y);
    });
    this.method('GETALPHA', (a) => {
      const b = this.bounds();
      if (!b) return Value.int(0);
      return Value.int(spriteAlphaAt(b.sprite, int(a[0]) - b.x, int(a[1]) - b.y));
    });
  }

  /** Absolute screen rectangle of what is currently drawn. */
  abstract bounds(): { x: number; y: number; w: number; h: number; sprite: Sprite } | null;

  isVisible(): boolean {
    return this.visible;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const b = this.bounds();
    if (!b) return;
    if (this.opacity < 255) ctx.globalAlpha = this.opacity / 255;
    ctx.drawImage(b.sprite.bitmap, b.x, b.y);
    ctx.globalAlpha = 1;
  }

  /** Opaque pixel under (px, py)? */
  hitTest(px: number, py: number): boolean {
    const b = this.bounds();
    if (!b || !this.visible) return false;
    return spriteAlphaAt(b.sprite, px - b.x, py - b.y) > 0;
  }

  inRect(px: number, py: number): boolean {
    const b = this.bounds();
    return !!b && px >= b.x && py >= b.y && px < b.x + b.w && py < b.y + b.h;
  }

  init(): void {
    this.engine.renderer.add(this);
    super.init();
  }

  dispose(): void {
    this.engine.renderer.remove(this);
  }
}

export class ImageObj extends Graphic {
  sprite: Sprite | null = null;
  private imgX = 0;
  private imgY = 0;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('LOAD', (a) => {
      void this.loadFile(str(a[0]));
    });
  }

  async load(): Promise<void> {
    const f = this.prop('FILENAME');
    if (f) await this.loadFile(f);
  }

  private async loadFile(name: string): Promise<void> {
    const path = this.engine.resolver.resolve(name);
    if (!path) {
      this.engine.warn(`IMAGE ${this.name}: missing ${name}`);
      return;
    }
    const img = decodeImg(await this.engine.fs.read(path));
    this.sprite = makeSprite(img.width, img.height, img.rgba);
    this.imgX = img.x;
    this.imgY = img.y;
  }

  bounds() {
    if (!this.sprite) return null;
    return { x: this.x + this.imgX, y: this.y + this.imgY, w: this.sprite.width, h: this.sprite.height, sprite: this.sprite };
  }
}

/**
 * ANIMO playback. In this game every ANN event has loopCount 0 and no flags,
 * so an event plays frames 0..n-1 once at FPS and then fires ONFINISHED
 * (CAnimo::Next 0x10007fb0); looping is done by scripts re-playing events.
 */
export class Animo extends Graphic {
  ann: Ann | null = null;
  private buf: Uint8Array | null = null;
  private sprites: (Sprite | null)[] = [];
  event: AnnEvent | null = null;
  frame = 0;
  playing = false;
  paused = false;
  fps: number;
  private acc = 0;
  /** Set by SETASBUTTON. */
  asButton = false;
  hovered = false;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.fps = this.numProp('FPS', 16);

    this.method('PLAY', (a) => this.play(str(a[0])));
    this.method('STOP', (a) => this.stop(a.length ? argValue(a[0]).toBool() : true));
    this.method('PAUSE', () => {
      this.paused = true;
    });
    this.method('RESUME', () => {
      this.paused = false;
    });
    this.method('SETFRAME', (a) => {
      // SETFRAME(event, frame) or SETFRAME(frame) within the current event.
      if (a.length >= 2) {
        const ev = this.findEvent(str(a[0]));
        if (ev) this.event = ev;
        this.frame = int(a[1]);
      } else {
        this.frame = int(a[0]);
      }
      if (this.event) this.frame = Math.max(0, Math.min(this.frame, this.event.frames.length - 1));
    });
    this.method('SETFPS', (a) => {
      this.fps = int(a[0]) || this.fps;
    });
    this.method('GETFRAME', () => Value.int(this.frame));
    this.method('GETFRAMENAME', () => Value.str(this.event?.frames[this.frame]?.name ?? ''));
    this.method('GETEVENTNAME', () => Value.str(this.event?.name ?? ''));
    this.method('GETNOFINEVENT', (a) => Value.int(this.findEvent(str(a[0]))?.frames.length ?? 0));
    this.method('ISPLAYING', () => Value.bool(this.playing && !this.paused));
    this.method('GETCURRFRAMEPOSX', () => Value.int(this.bounds()?.x ?? this.x));
    this.method('GETCURRFRAMEPOSY', () => Value.int(this.bounds()?.y ?? this.y));
    this.method('GETMAXWIDTH', () => Value.int(Math.max(0, ...(this.ann?.images.map((i) => i.width) ?? [0]))));
    this.method('SETASBUTTON', (a) => {
      this.asButton = a.length ? argValue(a[0]).toBool() : true;
    });
    this.method('ISNEAR', (a) => {
      const other = this.engine.find(str(a[0]));
      const dist = int(a[1]);
      if (!(other instanceof Graphic)) return Value.bool(false);
      const b1 = this.bounds();
      const b2 = other.bounds();
      if (!b1 || !b2) return Value.bool(false);
      const dx = b1.x + b1.w / 2 - (b2.x + b2.w / 2);
      const dy = b1.y + b1.h / 2 - (b2.y + b2.h / 2);
      return Value.bool(Math.hypot(dx, dy) <= dist);
    });
  }

  async load(): Promise<void> {
    const f = this.prop('FILENAME');
    if (!f) return;
    const path = this.engine.resolver.resolve(f);
    if (!path) {
      this.engine.warn(`ANIMO ${this.name}: missing ${f}`);
      return;
    }
    this.buf = await this.engine.fs.read(path);
    this.ann = parseAnn(this.buf);
    this.sprites = this.ann.images.map(() => null);
    if (!this.props.has('FPS') && this.ann.fps) this.fps = this.ann.fps;
    this.event = this.ann.events[0] ?? null;
    if (this.pendingPlay !== null) {
      const ev = this.pendingPlay;
      this.pendingPlay = null;
      this.play(ev);
    }
  }

  /** Clones share the parsed file and decoded sprites. */
  copyResourcesFrom(src: Animo): void {
    this.buf = src.buf;
    this.ann = src.ann;
    this.sprites = src.sprites;
    this.event = src.event;
    this.fps = src.fps;
  }

  findEvent(name: string): AnnEvent | null {
    if (!this.ann) return null;
    const n = name.toUpperCase();
    const byName = this.ann.events.find((e) => e.name === n);
    if (byName) return byName;
    // TODO(unverified): CAnimo::resolveEventName fallback to an index.
    const idx = Number(n);
    return Number.isInteger(idx) ? (this.ann.events[idx] ?? null) : null;
  }

  /** PLAY requested before the ANN finished loading (CNVLOADER objects). */
  private pendingPlay: string | null = null;

  play(name: string): void {
    if (!this.ann && this.prop('FILENAME')) {
      this.pendingPlay = name;
      this.visible = true;
      return;
    }
    const ev = this.findEvent(name);
    if (!ev) {
      this.engine.warn(`ANIMO ${this.name}: no event ${name}`);
      return;
    }
    this.event = ev;
    this.frame = 0;
    this.acc = 0;
    this.playing = true;
    this.paused = false;
    this.visible = true;
    this.signal('ONSTARTED', ev.name, [ev.name]);
    this.enterFrame();
  }

  stop(fireEvent: boolean): void {
    if (!this.playing) return;
    this.playing = false;
    if (fireEvent && this.event) this.signal('ONFINISHED', this.event.name, [this.event.name]);
  }

  private enterFrame(): void {
    const fr = this.event?.frames[this.frame];
    if (!fr) return;
    if (fr.sounds.length) this.engine.playSfx(fr.sounds[Math.floor(Math.random() * fr.sounds.length)]);
    this.signal('ONFRAMECHANGED', this.event!.name, [this.event!.name, String(this.frame)]);
  }

  tick(dt: number): void {
    if (!this.playing || this.paused || !this.event || this.fps <= 0) return;
    this.acc += dt;
    const frameMs = 1000 / this.fps;
    while (this.playing && this.acc >= frameMs) {
      this.acc -= frameMs;
      if (this.frame + 1 >= this.event.frames.length) {
        this.playing = false;
        this.signal('ONFINISHED', this.event.name, [this.event.name]);
        break;
      }
      this.frame++;
      this.enterFrame();
    }
  }

  private sprite(i: number): Sprite | null {
    if (!this.ann || !this.buf) return null;
    let s = this.sprites[i];
    if (s === undefined) return null;
    if (!s) {
      const h = this.ann.images[i];
      if (!h || !h.width || !h.height) return null;
      s = makeSprite(h.width, h.height, decodeAnnImage(this.buf, h));
      this.sprites[i] = s;
    }
    return s;
  }

  bounds() {
    const fr = this.event?.frames[this.frame];
    if (!fr || !this.ann) return null;
    const h = this.ann.images[fr.image];
    const sprite = this.sprite(fr.image);
    if (!h || !sprite) return null;
    return { x: this.x + h.x + fr.dx, y: this.y + h.y + fr.dy, w: sprite.width, h: sprite.height, sprite };
  }
}

export class Sound extends GameObject {
  private voice: Voice | null = null;
  private file: string;
  private pendingPlay = false;
  private loading: Promise<void> | null = null;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.file = this.prop('FILENAME');
    this.method('PLAY', () => this.play());
    this.method('STOP', () => {
      this.pendingPlay = false;
      this.voice?.stop();
    });
    this.method('PAUSE', () => this.voice?.pause());
    this.method('RESUME', () => this.voice?.resume());
    this.method('ISPLAYING', () => Value.bool(!!this.voice?.playing || this.pendingPlay));
    this.method('LOAD', (a) => {
      this.voice?.stop();
      this.voice = null;
      this.file = str(a[0]);
      this.loading = null;
    });
  }

  private ensureLoaded(): Promise<void> {
    if (this.loading) return this.loading;
    const path = this.file && this.engine.resolver.resolve(this.file);
    if (!path) {
      this.engine.warnOnce(`SOUND ${this.name}: missing ${this.file}`);
      this.loading = Promise.resolve();
      return this.loading;
    }
    this.loading = this.engine.audio
      .load(path)
      .then((buf) => {
        this.voice = new Voice(this.engine.audio, buf, this.engine.audio.sfxBus);
        this.voice.onEnded = () => this.signal('ONFINISHED');
      })
      .catch((e) => this.engine.warn(`SOUND ${this.name}: ${(e as Error).message}`));
    return this.loading;
  }

  async load(): Promise<void> {
    if (this.boolProp('PRELOAD', true)) await this.ensureLoaded();
  }

  play(): void {
    if (this.voice) {
      this.voice.play();
      this.signal('ONSTARTED');
      return;
    }
    this.pendingPlay = true;
    void this.ensureLoaded().then(() => {
      if (!this.pendingPlay) return;
      this.pendingPlay = false;
      if (this.voice) {
        this.voice.play();
        this.signal('ONSTARTED');
      }
    });
  }

  dispose(): void {
    this.pendingPlay = false;
    this.voice?.dispose();
  }
}

/** MUSIC objects mirror the scene's MUSIC property, which the engine plays. */
export class Music extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('PLAY', () => this.engine.playMusic(this.prop('FILENAME')));
    this.method('STOP', () => this.engine.stopMusic());
  }
}
