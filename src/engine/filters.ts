// STATICFILTER and FILTER objects. See docs/filters-fonts.md for the
// reverse-engineered semantics (addresses refer to PIKLIB8.dll).
//
// The original filters rewrite the linked graphic's pixel buffers. The port
// instead attaches a transform (rotation) or drives the existing opacity, so
// the renderer can apply it at draw time without touching decoded sprites.

import type { ObjectDef } from '../formats/cnv.ts';
import { argValue, type Arg } from '../script/interpreter.ts';
import type { Engine } from './engine.ts';
import { GameObject } from './object.ts';

const str = (a: Arg | undefined) => argValue(a).toStr();

/**
 * Per-graphic transform set by a ROTATE static filter.
 *
 * - `angle` in degrees; positive turns CLOCKWISE on screen. The DLL computes
 *   theta = ANGLE * -pi/180 (constant 0x10147f88) and samples
 *   src = R(theta) * dst with y pointing down (sub_1002e410).
 * - `pivotX`/`pivotY`: pivot in pixels relative to the current frame's
 *   top-left corner. `null` means the frame's own integer center
 *   (trunc(w/2), trunc(h/2)), which is what the original uses
 *   (CGraphicsObject::getCenterPoint 0x1002cf70) for every frame.
 */
export interface FilterTransform {
  angle: number;
  pivotX: number | null;
  pivotY: number | null;
}

/** Anything a filter can be linked to: Graphic subclasses satisfy this structurally. */
export interface FilterTarget {
  opacity: number;
  filterTransform?: FilterTransform | null;
}

const isTarget = (o: unknown): o is FilterTarget & GameObject =>
  o instanceof GameObject && typeof (o as Partial<FilterTarget>).opacity === 'number';

/** Resolve the pivot of a transform for a frame of size w x h. */
export function pivotOf(t: FilterTransform, w: number, h: number): { px: number; py: number } {
  return { px: t.pivotX ?? Math.trunc(w / 2), py: t.pivotY ?? Math.trunc(h / 2) };
}

/**
 * Size of the buffer the original allocates for a rotated w x h frame:
 * the max of the absolute extents of both rotated diagonals, each truncated
 * (sub_1002e410).
 */
export function rotatedSize(w: number, h: number, angle: number): { w: number; h: number } {
  const th = (angle * -Math.PI) / 180;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const cx = Math.trunc(w / 2);
  const cy = Math.trunc(h / 2);
  const rot = (x: number, y: number) => [x * c - y * s, x * s + y * c] as const;
  const a = rot(-cx, -cy);
  const b = rot(w - cx, h - cy);
  const p = rot(w - cx, -cy);
  const q = rot(-cx, h - cy);
  const W = Math.max(Math.abs(Math.trunc(q[0] - p[0])), Math.abs(Math.trunc(b[0] - a[0])));
  const H = Math.max(Math.abs(Math.trunc(q[1] - p[1])), Math.abs(Math.trunc(b[1] - a[1])));
  return { w: W, h: H };
}

/**
 * Screen rectangle of a rotated frame drawn at (x, y) with size w x h:
 * the original grows the frame to rotatedSize() and moves it by
 * (cx - W/2, cy - H/2) so the frame center stays put (Move 0x1002aba0).
 */
export function rotatedRect(x: number, y: number, w: number, h: number, t: FilterTransform) {
  const r = rotatedSize(w, h, t.angle);
  const { px, py } = pivotOf(t, w, h);
  return { x: x + px - Math.trunc(r.w / 2), y: y + py - Math.trunc(r.h / 2), w: r.w, h: r.h };
}

/**
 * Pixel-exact port of the rotate routine (sub_1002e410) on RGBA data:
 * nearest neighbour, truncating, transparent where out of range or where the
 * source alpha is 0. Returns the new buffer plus the offset of its top-left
 * relative to the source frame's top-left.
 */
export function rotateRGBA(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  angle: number,
): { rgba: Uint8ClampedArray; width: number; height: number; dx: number; dy: number } {
  const th = (angle * -Math.PI) / 180;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const { w: W, h: H } = rotatedSize(w, h, angle);
  const out = new Uint8ClampedArray(W * H * 4);
  const hw = Math.trunc(w / 2);
  const hh = Math.trunc(h / 2);
  const nhw = Math.trunc(W / 2);
  const nhh = Math.trunc(H / 2);
  for (let i = 0; i < W; i++) {
    const dx = i - nhw;
    for (let j = 0; j < H; j++) {
      const dy = j - nhh;
      const sx = Math.trunc(dx * c - dy * s + hw);
      const sy = Math.trunc(dx * s + dy * c + hh);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const si = (sy * w + sx) * 4;
      if (rgba[si + 3] === 0) continue;
      const di = (j * W + i) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, width: W, height: H, dx: hw - nhw, dy: hh - nhh };
}

/**
 * Draw `image` (frame of size w x h whose top-left is at x, y) with the
 * transform applied. Canvas equivalent of the original's re-sampled frame.
 */
export function drawTransformed(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  t: FilterTransform,
): void {
  const { px, py } = pivotOf(t, w, h);
  ctx.save();
  ctx.translate(x + px, y + py);
  ctx.rotate((t.angle * Math.PI) / 180);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, -px, -py);
  ctx.restore();
}

const truthy = (v: string) => v.trim().toUpperCase() === 'TRUE';

/**
 * STATICFILTER (CMC_Object type 0x7df, ctor sub_100a4490). ACTION picks the
 * filter; only ROTATE is used by this game. Properties (SETPROPERTY or the
 * CNV): CANUNDO (default FALSE), CURRENTFRAME (default TRUE), ANGLE.
 */
export class StaticFilter extends GameObject {
  readonly action: string;
  angle = 0;
  canUndo = false;
  currentFrame = true;
  /** Other properties (FACTORX, BYCENTER, ...), stored for completeness. */
  readonly extra = new Map<string, string>();
  readonly linked = new Set<FilterTarget & GameObject>();

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.action = this.prop('ACTION').toUpperCase();
    for (const k of ['ANGLE', 'CANUNDO', 'CURRENTFRAME']) {
      const v = this.props.get(k);
      if (v !== undefined) this.setProperty(k, v);
    }
    this.method('SETPROPERTY', (a) => {
      this.setProperty(str(a[0]), str(a[1]));
    });
    this.method('LINK', (a) => {
      this.link(str(a[0]));
    });
    this.method('UNLINK', (a) => {
      this.unlink(str(a[0]));
    });
  }

  setProperty(name: string, value: string): void {
    const key = name.trim().toUpperCase();
    if (key === 'CANUNDO') this.canUndo = truthy(value);
    else if (key === 'CURRENTFRAME') this.currentFrame = truthy(value);
    else if (key === 'ANGLE' && this.action === 'ROTATE') {
      const n = Number(value);
      this.angle = Number.isFinite(n) ? n : 0;
      // The original only re-filters on the next frame change or relink; the
      // scripts always UNLINK/SETPROPERTY/LINK, so updating live is equivalent.
      for (const t of this.linked) if (t.filterTransform) t.filterTransform.angle = this.angle;
    } else this.extra.set(key, value);
  }

  link(name: string): void {
    const target = this.engine.find(name);
    if (!isTarget(target)) {
      this.engine.warnOnce(`STATICFILTER ${this.name}: cannot LINK ${name}`);
      return;
    }
    if (this.action !== 'ROTATE') {
      this.engine.warnOnce(`STATICFILTER ACTION=${this.action} not implemented (${this.name})`);
      return;
    }
    this.linked.add(target);
    target.filterTransform = { angle: this.angle, pivotX: null, pivotY: null };
  }

  /**
   * Detach (sub_100a5d20). With CANUNDO the original restores the pristine
   * frames; without it the rotated pixels stay. The port always restores,
   * since every use in the game sets CANUNDO=TRUE.
   */
  unlink(name: string): void {
    const target = this.engine.find(name);
    if (!isTarget(target) || !this.linked.has(target)) return;
    this.linked.delete(target);
    target.filterTransform = null;
  }

  dispose(): void {
    for (const t of this.linked) t.filterTransform = null;
    this.linked.clear();
  }
}

interface FadeState {
  cur: number;
  done: boolean;
}

/**
 * FILTER (dynamic filter, sub_1006dbb0). Only the fades are implemented:
 * FADEIN (START 0 -> END 255), FADEOUT (255 -> 0), FADEINOUT (starts as
 * FADEIN). SPEED defaults to 0.1 opacity units per step
 * (sub_1006f080); each step adds/subtracts SPEED, clamps at END and sets the
 * linked graphic's opacity to trunc(cur) (sub_10020270 / sub_10020300).
 */
export class Filter extends GameObject {
  readonly action: string;
  speed = 0.1;
  start: number;
  end: number;
  /** Milliseconds per step. The DLL steps once per engine tick (rate inferred). */
  stepMs = 1000 / 60;
  readonly linked = new Map<FilterTarget & GameObject, FadeState>();
  private acc = 0;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.action = this.prop('ACTION').toUpperCase();
    const fadeOut = this.action === 'FADEOUT';
    this.start = fadeOut ? 255 : 0;
    this.end = fadeOut ? 0 : 255;
    for (const k of ['SPEED', 'START', 'END']) {
      const v = this.props.get(k);
      if (v !== undefined) this.setProperty(k, v);
    }
    this.method('SETPROPERTY', (a) => {
      this.setProperty(str(a[0]), str(a[1]));
    });
    this.method('LINK', (a) => {
      this.link(str(a[0]));
    });
    this.method('UNLINK', (a) => {
      const t = this.engine.find(str(a[0]));
      if (isTarget(t)) this.linked.delete(t);
    });
  }

  setProperty(name: string, value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const key = name.trim().toUpperCase();
    if (key === 'SPEED') this.speed = n;
    else if (key === 'START') this.start = n;
    else if (key === 'END') this.end = n;
  }

  link(name: string): void {
    const t = this.engine.find(name);
    if (!isTarget(t)) {
      this.engine.warnOnce(`FILTER ${this.name}: cannot LINK ${name}`);
      return;
    }
    if (!['FADEIN', 'FADEOUT', 'FADEINOUT'].includes(this.action)) {
      this.engine.warnOnce(`FILTER ACTION=${this.action} not implemented (${this.name})`);
      return;
    }
    this.linked.set(t, { cur: this.start, done: false });
    t.opacity = Math.trunc(this.start);
  }

  /** One DLL step for every linked graphic. */
  step(): void {
    const up = this.end >= this.start;
    for (const [t, st] of this.linked) {
      if (st.done) continue;
      const before = Math.trunc(st.cur);
      st.cur += up ? this.speed : -this.speed;
      if (up ? st.cur >= this.end : st.cur <= this.end) {
        st.cur = this.end;
        st.done = true;
      }
      const now = Math.trunc(st.cur);
      if (now !== before) t.opacity = Math.max(0, Math.min(255, now));
    }
  }

  tick(dt: number): void {
    if (!this.linked.size) return;
    this.acc += dt;
    while (this.acc >= this.stepMs) {
      this.acc -= this.stepMs;
      this.step();
    }
  }

  dispose(): void {
    this.linked.clear();
  }
}
