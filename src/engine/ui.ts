// BUTTON, MOUSE, KEYBOARD, CANVAS_OBSERVER, TEXT, FONT.

import type { ObjectDef } from '../formats/cnv.ts';
import { argValue, type Arg } from '../script/interpreter.ts';
import { Value } from '../script/values.ts';
import type { Engine } from './engine.ts';
import { Font } from './fonts.ts';
import { Graphic } from './media.ts';
import { spriteAlphaAt } from './renderer.ts';
import { GameObject } from './object.ts';
import type { Drawable } from './renderer.ts';

const int = (a: Arg | undefined) => argValue(a).toInt();
const str = (a: Arg | undefined) => argValue(a).toStr();

/**
 * BUTTON: a hotspot (RECT, or the bounds of GFXSTANDARD) that swaps between
 * three graphics objects. CButton::Enable(false) (0x100155f0) hides all of
 * them; DisableButVisible (0x100155a0) keeps the standard one shown.
 */
export class Button extends GameObject {
  enabled: boolean;
  visible: boolean;
  priority: number;
  readonly order: number;
  state: 'standard' | 'move' | 'click' = 'standard';
  private rect: [number, number, number, number] | null = null;
  /** Name of the graphic whose bounds form the hotspot (RECT=OBJECTNAME). */
  private rectObject: string | null = null;

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.enabled = this.boolProp('ENABLE', true);
    // CMC_Button::createButton (0x10055e00) applies ENABLE via CButton::Enable
    // (0x100155f0), which hides the standard graphic when false.
    this.visible = this.enabled && this.boolProp('VISIBLE', true);
    this.priority = this.numProp('PRIORITY', 0);
    this.order = engine.nextOrder();
    // createButton (0x10055e00): RECT may name a graphics object, whose
    // rectangle and priority become the hotspot's; otherwise it is x1,y1,x2,y2.
    const r = this.prop('RECT').split(',').map(Number);
    if (r.length === 4 && r.every(Number.isFinite)) this.rect = [r[0], r[1], r[2], r[3]];
    else if (this.prop('RECT')) this.rectObject = this.prop('RECT').toUpperCase();

    this.method('ENABLE', () => {
      this.enabled = true;
      this.visible = true;
      this.applyGfx();
    });
    this.method('DISABLE', () => {
      this.enabled = false;
      this.visible = false;
      this.state = 'standard';
      this.applyGfx();
    });
    this.method('DISABLEBUTVISIBLE', () => {
      this.enabled = false;
      this.visible = true;
      this.state = 'standard';
      this.applyGfx();
    });
    this.method('SETPRIORITY', (a) => {
      this.priority = int(a[0]);
    });
    this.method('SETRECT', (a) => {
      this.rect = [int(a[0]), int(a[1]), int(a[2]), int(a[3])];
    });
  }

  private gfx(prop: string): Graphic | null {
    const name = this.prop(prop);
    const o = name ? this.engine.find(name) : null;
    return o instanceof Graphic ? o : null;
  }

  init(): void {
    this.engine.buttons.add(this);
    this.applyGfx();
    super.init();
  }

  dispose(): void {
    this.engine.buttons.delete(this);
  }

  /** Show exactly one of the state graphics. */
  applyGfx(): void {
    const std = this.gfx('GFXSTANDARD');
    const move = this.gfx('GFXONMOVE');
    const click = this.gfx('GFXONCLICK');
    const show = !this.visible
      ? null
      : this.state === 'click'
        ? (click ?? move ?? std)
        : this.state === 'move'
          ? (move ?? std)
          : std;
    for (const g of [std, move, click]) if (g) g.visible = g === show;
  }

  /** The graphic whose bounds define the hotspot, if any. */
  private shapeGraphic(): Graphic | null {
    if (this.rectObject) {
      const o = this.engine.find(this.rectObject);
      return o instanceof Graphic ? o : null;
    }
    return this.rect ? null : this.gfx('GFXSTANDARD');
  }

  contains(x: number, y: number): boolean {
    if (this.rect) {
      const [x1, y1, x2, y2] = this.rect;
      return x >= x1 && y >= y1 && x < x2 && y < y2;
    }
    return !!this.shapeGraphic()?.inRect(x, y);
  }

  debugRect(): { x: number; y: number; w: number; h: number } | null {
    if (this.rect) {
      const [x1, y1, x2, y2] = this.rect;
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    const b = this.shapeGraphic()?.shapeBounds();
    return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
  }

  hitPriority(): number {
    return this.shapeGraphic()?.priority ?? this.gfx('GFXSTANDARD')?.priority ?? this.priority;
  }

  setState(s: Button['state']): void {
    if (this.state === s) return;
    this.state = s;
    this.applyGfx();
  }
}

export class Mouse extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('GETPOSX', () => Value.int(this.engine.input.x));
    this.method('GETPOSY', () => Value.int(this.engine.input.y));
    this.method('ENABLE', () => {
      this.engine.input.enabled = true;
    });
    this.method('DISABLE', () => {
      this.engine.input.enabled = false;
    });
    this.method('SET', (a) => {
      this.engine.setCursor(str(a[0]).trim().toUpperCase());
    });
    this.method('SHOW', () => this.engine.setCursor('ARROW'));
    this.method('HIDE', () => this.engine.setCursor('NONE'));
  }

  init(): void {
    this.engine.mice.add(this);
    super.init();
  }

  dispose(): void {
    this.engine.mice.delete(this);
  }
}

export class Keyboard extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('ISKEYDOWN', (a) => Value.bool(this.engine.input.keys.has(str(a[0]).toUpperCase())));
  }

  init(): void {
    this.engine.keyboards.add(this);
    super.init();
  }

  dispose(): void {
    this.engine.keyboards.delete(this);
  }
}

export class CanvasObserver extends GameObject {
  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.method('SETBACKGROUND', (a) => {
      void this.engine.setBackground(str(a[0]));
    });
    this.method('REFRESH', () => undefined);
    // GETGRAPHICSAT(x, y, visibleOnly, minPriority, maxPriority[, ...]):
    // CRefreshScreen::getGraphicsAt (0x100d0000) walks all graphics, keeps
    // those in the priority range (-1 = unbounded), optionally only visible
    // ones, tests the rect then the pixel alpha, and returns the
    // highest-priority hit's name.
    this.method('GETGRAPHICSAT', (a) => {
      const x = int(a[0]);
      const y = int(a[1]);
      const visibleOnly = a.length > 2 ? argValue(a[2]).toBool() : true;
      const min = a.length > 3 ? int(a[3]) : -1;
      const max = a.length > 4 ? int(a[4]) : -1;
      let best: Graphic | null = null;
      for (const d of this.engine.renderer.all()) {
        if (!(d instanceof Graphic)) continue;
        if (visibleOnly && !d.visible) continue;
        if ((min > -1 && d.priority < min) || (max > -1 && d.priority > max)) continue;
        if (!d.inRect(x, y)) continue;
        const b = d.bounds();
        if (!b || spriteAlphaAt(b.sprite, x - b.x, y - b.y) === 0) continue;
        if (!best || d.priority >= best.priority) best = d;
      }
      return Value.str(best ? best.name : 'NULL');
    });
  }
}

/** TEXT: draws a string inside RECT. Bitmap FONT files are approximated. */
export class TextObj extends GameObject implements Drawable {
  text = '';
  visible: boolean;
  priority: number;
  readonly order: number;
  private rect: number[];

  constructor(engine: Engine, def: ObjectDef) {
    super(engine, def);
    this.visible = this.boolProp('VISIBLE', true);
    this.priority = this.numProp('PRIORITY', 0);
    this.order = engine.nextOrder();
    this.rect = this.prop('RECT').split(',').map(Number);
    this.text = this.prop('TEXT');
    this.method('SETTEXT', (a) => {
      this.text = str(a[0]);
    });
    this.method('SHOW', () => {
      this.visible = true;
    });
    this.method('HIDE', () => {
      this.visible = false;
    });
  }

  isVisible(): boolean {
    return this.visible && !!this.text;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const [x1 = 0, y1 = 0, x2 = 800, y2 = 600] = this.rect;
    const font = this.engine.find(this.prop('FONT'));
    if (font instanceof Font) {
      font.drawInRect(ctx, this.text, [x1, y1, x2, y2], this.prop('HJUSTIFY'), this.prop('VJUSTIFY'));
      return;
    }
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textBaseline = 'middle';
    const h = this.prop('HJUSTIFY').toUpperCase();
    ctx.textAlign = h === 'CENTER' ? 'center' : h === 'RIGHT' ? 'right' : 'left';
    const tx = ctx.textAlign === 'center' ? (x1 + x2) / 2 : ctx.textAlign === 'right' ? x2 : x1;
    ctx.fillText(this.text, tx, (y1 + y2) / 2);
    ctx.restore();
  }

  init(): void {
    this.engine.renderer.add(this);
    super.init();
  }

  dispose(): void {
    this.engine.renderer.remove(this);
  }
}

