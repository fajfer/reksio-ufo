// NVP animation (.ANN) format. Full layout with procedure citations:
// tools/annformat.md. Loader: CAnimo::Load3 (0x1000a940); images use the
// same compression codes as PIK images (CGraphicsObject::DeCompress).

import { decodeGraphics } from './img.ts';

const text = new TextDecoder('windows-1250');

/** Event flag: play forward then backward (CAnimo::Next 0x10007fb0). */
export const EVENT_PINGPONG = 0x20000;
/** Event flag: hold the last frame until the frame sound finishes. */
export const EVENT_WAIT_FOR_SOUND = 0x100000;
/** Animo flag: skip loading per-frame sounds. */
export const ANIMO_NO_FRAME_SOUNDS = 0x400000;
/** Animo flag: when an event ends, continue into the next event. */
export const ANIMO_CONTINUE_NEXT_EVENT = 0x800000;

export interface AnnFrame {
  image: number;
  dx: number;
  dy: number;
  /** 0..255; 255 means use the event's opacity. */
  opacity: number;
  name: string;
  /** Candidate sound files; the engine picks one at random. */
  sounds: string[];
}

export interface AnnEvent {
  name: string;
  loopStart: number;
  loopEnd: number;
  loopCount: number;
  fps: number;
  flags: number;
  opacity: number;
  frames: AnnFrame[];
}

export interface AnnImageHeader {
  width: number;
  height: number;
  x: number;
  y: number;
  compression: number;
  name: string;
  dataOffset: number;
  dataSize: number;
  alphaOffset: number;
  alphaSize: number;
}

export interface Ann {
  fps: number;
  flags: number;
  opacity: number;
  randomFramesNumber: number;
  author: string;
  description: string;
  events: AnnEvent[];
  images: AnnImageHeader[];
}

class Reader {
  private dv: DataView;
  private buf: Uint8Array;
  o = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  need(n: number): number {
    if (this.o + n > this.buf.length) throw new Error(`ANN truncated at 0x${this.o.toString(16)}`);
    const at = this.o;
    this.o += n;
    return at;
  }

  u8(at: number) {
    return this.dv.getUint8(at);
  }
  u16(at: number) {
    return this.dv.getUint16(at, true);
  }
  i16(at: number) {
    return this.dv.getInt16(at, true);
  }
  u32(at: number) {
    return this.dv.getUint32(at, true);
  }
  i32(at: number) {
    return this.dv.getInt32(at, true);
  }

  cstr(at: number, max: number): string {
    const s = this.buf.subarray(at, at + max);
    const z = s.indexOf(0);
    return text.decode(z < 0 ? s : s.subarray(0, z));
  }

  /** u32 length + bytes (may include a trailing NUL). */
  lpstr(): string {
    const n = this.u32(this.need(4));
    return this.cstr(this.need(n), n);
  }
}

export function parseAnn(buf: Uint8Array): Ann {
  const r = new Reader(buf);
  const h = r.need(0x2c);
  if (r.u8(h) !== 0x4e || r.u8(h + 1) !== 0x56) throw new Error('Not an NVP animation');
  const legacyHeaders = r.u8(h + 2) === 0x2b; // "NV+"
  const imageCount = r.u16(h + 4);
  const eventCount = r.u16(h + 8);
  const flagsWord = r.u32(h + 0x1b);
  const ann: Ann = {
    fps: r.u32(h + 0x17),
    flags: flagsWord & 0xffff00,
    opacity: r.u8(h + 0x1f),
    randomFramesNumber: r.i16(h + 0x20),
    author: r.lpstr(),
    description: r.lpstr(),
    events: [],
    images: [],
  };

  for (let e = 0; e < eventCount; e++) {
    const ev = r.need(0x43);
    const frameCount = r.u16(ev + 0x20);
    const event: AnnEvent = {
      name: r.cstr(ev, 0x20).toUpperCase(),
      loopStart: r.i16(ev + 0x26),
      loopEnd: r.i16(ev + 0x28),
      loopCount: r.i16(ev + 0x2a),
      fps: r.u32(ev + 0x2e),
      flags: r.u32(ev + 0x32),
      opacity: r.u8(ev + 0x36),
      frames: [],
    };
    const list = r.need(frameCount * 2);
    for (let i = 0; i < frameCount; i++) {
      const f = r.need(0x1e);
      const hasName = r.u32(f) !== 0;
      const hasBlob = r.u32(f + 4) !== 0;
      const hasSound = r.u32(f + 0x10) !== 0;
      const frame: AnnFrame = {
        image: r.u16(list + i * 2),
        dx: r.i16(f + 8),
        dy: r.i16(f + 0x0a),
        opacity: r.u8(f + 0x18),
        name: '',
        sounds: [],
      };
      if (hasName) frame.name = r.lpstr().toUpperCase();
      if (hasBlob) r.lpstr();
      if (hasSound) frame.sounds = r.lpstr().split(';').map((s) => s.trim()).filter(Boolean);
      event.frames.push(frame);
    }
    ann.events.push(event);
  }

  const headerSize = legacyHeaders ? 0x20 : 0x34;
  for (let i = 0; i < imageCount; i++) {
    const ih = r.need(headerSize);
    const extraCount = r.i16(ih + 0x0e);
    ann.images.push({
      width: r.u16(ih),
      height: r.u16(ih + 2),
      x: r.i16(ih + 4),
      y: r.i16(ih + 6),
      compression: r.u16(ih + 8),
      dataSize: r.u32(ih + 0x0a),
      alphaSize: extraCount >= 4 ? r.u32(ih + 0x1c) : 0,
      name: legacyHeaders ? '' : r.cstr(ih + 0x20, 0x14),
      dataOffset: 0,
      alphaOffset: 0,
    });
  }
  for (const img of ann.images) {
    img.dataOffset = r.need(img.dataSize);
    img.alphaOffset = r.need(img.alphaSize);
  }
  return ann;
}

export function decodeAnnImage(buf: Uint8Array, img: AnnImageHeader): Uint8ClampedArray {
  const color = buf.subarray(img.dataOffset, img.dataOffset + img.dataSize);
  const alpha = img.alphaSize ? buf.subarray(img.alphaOffset, img.alphaOffset + img.alphaSize) : null;
  return decodeGraphics(img.width, img.height, img.compression, color, alpha);
}
