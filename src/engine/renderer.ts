// Canvas2D compositor. The original draws to a fixed 800x600 surface,
// sorted by PRIORITY; ties keep insertion order.

export const SCREEN_W = 800;
export const SCREEN_H = 600;

export interface Sprite {
  bitmap: CanvasImageSource;
  width: number;
  height: number;
  /** Raw RGBA kept for pixel-accurate hit tests (alpha). */
  rgba: Uint8ClampedArray;
}

export function makeSprite(width: number, height: number, rgba: Uint8ClampedArray): Sprite {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (width > 0 && height > 0) ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return { bitmap: canvas, width, height, rgba };
}

export function spriteAlphaAt(s: Sprite, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return 0;
  return s.rgba[(Math.floor(y) * s.width + Math.floor(x)) * 4 + 3];
}

export interface Drawable {
  /** Higher priority draws on top. */
  readonly priority: number;
  /** Stable tiebreaker: creation order. */
  readonly order: number;
  isVisible(): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  background: Sprite | null = null;
  private drawables = new Set<Drawable>();

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.ctx = ctx;
  }

  add(d: Drawable): void {
    this.drawables.add(d);
  }

  remove(d: Drawable): void {
    this.drawables.delete(d);
  }

  clear(): void {
    this.drawables.clear();
    this.background = null;
  }

  /** Visible drawables from top to bottom, for hit testing. */
  topmostFirst(): Drawable[] {
    return this.sorted().reverse();
  }

  private sorted(): Drawable[] {
    return [...this.drawables].filter((d) => d.isVisible()).sort((a, b) => a.priority - b.priority || a.order - b.order);
  }

  render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (this.background) ctx.drawImage(this.background.bitmap, 0, 0);
    for (const d of this.sorted()) d.draw(ctx);
  }
}
