// WebAudio playback for SOUND / MUSIC objects and per-frame animation sounds.
// Game audio is plain PCM WAV, which every browser decodes natively.

import type { GameFS } from './fs.ts';

export class AudioSystem {
  readonly ctx: AudioContext;
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;
  private cache = new Map<string, Promise<AudioBuffer>>();
  private fs: GameFS;

  constructor(fs: GameFS) {
    this.fs = fs;
    this.ctx = new AudioContext();
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.ctx.destination);
    this.musicBus.connect(this.ctx.destination);
  }

  /** Browsers start audio suspended until a user gesture. */
  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  load(path: string): Promise<AudioBuffer> {
    const key = path.toLowerCase();
    let p = this.cache.get(key);
    if (!p) {
      p = this.fs.read(path).then((bytes) => this.ctx.decodeAudioData(bytes.slice().buffer));
      this.cache.set(key, p);
    }
    return p;
  }

  evict(path: string): void {
    this.cache.delete(path.toLowerCase());
  }
}

/** One playing (or paused) instance of a buffer. */
export class Voice {
  private audio: AudioSystem;
  private buffer: AudioBuffer;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  private startedAt = 0;
  private offset = 0;
  loop = false;
  onEnded: (() => void) | null = null;

  constructor(audio: AudioSystem, buffer: AudioBuffer, bus: AudioNode) {
    this.audio = audio;
    this.buffer = buffer;
    this.gain = audio.ctx.createGain();
    this.gain.connect(bus);
  }

  get playing(): boolean {
    return this.source !== null;
  }

  get duration(): number {
    return this.buffer.duration;
  }

  setVolume(v: number): void {
    this.gain.gain.value = v;
  }

  play(from = 0): void {
    this.stopSource();
    const src = this.audio.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.connect(this.gain);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.offset = 0;
      this.onEnded?.();
    };
    this.offset = from;
    this.startedAt = this.audio.ctx.currentTime - from;
    src.start(0, from);
    this.source = src;
  }

  pause(): void {
    if (!this.source) return;
    this.offset = (this.audio.ctx.currentTime - this.startedAt) % this.buffer.duration;
    this.stopSource();
  }

  resume(): void {
    if (!this.source) this.play(this.offset);
  }

  stop(): void {
    this.offset = 0;
    this.stopSource();
  }

  private stopSource(): void {
    const s = this.source;
    this.source = null;
    if (s) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
  }

  dispose(): void {
    this.stop();
    this.gain.disconnect();
  }
}
