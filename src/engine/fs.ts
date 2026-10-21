// Case-insensitive virtual filesystem over the original game install.
//
// The original runs on Windows, so scripts mix cases freely ("UFO.ANN" vs
// "ufo.ann") and use backslashes. Every implementation indexes paths by a
// normalized lower-case, forward-slash key relative to the install root.

export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

export interface GameFS {
  has(path: string): boolean;
  /** Normalized paths of the files directly inside a directory. */
  list(dir: string): string[];
  read(path: string): Promise<Uint8Array>;
  /** Object URL / fetchable URL for streaming media (audio). */
  url(path: string): Promise<string>;
}

/** Install served over HTTP with a manifest listing every file. */
export class HttpFS implements GameFS {
  private index = new Map<string, string>();
  private base: string;

  private constructor(base: string, files: string[]) {
    this.base = base.replace(/\/$/, '');
    for (const f of files) this.index.set(normalizePath(f), f);
  }

  static async open(base: string): Promise<HttpFS> {
    const res = await fetch(`${base.replace(/\/$/, '')}/manifest.json`);
    if (!res.ok) throw new Error(`No game manifest at ${base}`);
    return new HttpFS(base, (await res.json()) as string[]);
  }

  has(path: string): boolean {
    return this.index.has(normalizePath(path));
  }

  /** Install-relative paths of every file (used by the offline download). */
  paths(): string[] {
    return [...this.index.values()];
  }

  list(dir: string): string[] {
    const prefix = normalizePath(dir).replace(/\/$/, '') + '/';
    return [...this.index.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'));
  }

  async url(path: string): Promise<string> {
    const real = this.index.get(normalizePath(path));
    if (!real) throw new Error(`File not found: ${path}`);
    return `${this.base}/${real.split('/').map(encodeURIComponent).join('/')}`;
  }

  async read(path: string): Promise<Uint8Array> {
    const res = await fetch(await this.url(path));
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Install picked by the player with <input webkitdirectory>. */
export class FileListFS implements GameFS {
  private index = new Map<string, File>();
  private urls = new Map<string, string>();

  constructor(files: Iterable<File>) {
    const list = [...files];
    // webkitRelativePath includes the picked folder name; strip it so paths
    // are relative to the install root regardless of what the folder is called.
    const roots = new Set(list.map((f) => f.webkitRelativePath.split('/')[0]));
    const strip = roots.size === 1;
    for (const f of list) {
      const rel = strip ? f.webkitRelativePath.split('/').slice(1).join('/') : f.webkitRelativePath;
      this.index.set(normalizePath(rel || f.name), f);
    }
  }

  has(path: string): boolean {
    return this.index.has(normalizePath(path));
  }

  list(dir: string): string[] {
    const prefix = normalizePath(dir).replace(/\/$/, '') + '/';
    return [...this.index.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'));
  }

  private file(path: string): File {
    const f = this.index.get(normalizePath(path));
    if (!f) throw new Error(`File not found: ${path}`);
    return f;
  }

  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await this.file(path).arrayBuffer());
  }

  async url(path: string): Promise<string> {
    const key = normalizePath(path);
    let u = this.urls.get(key);
    if (!u) {
      u = URL.createObjectURL(this.file(path));
      this.urls.set(key, u);
    }
    return u;
  }
}

/** Locates the data root ("DANE") and Wavs dir inside an install. */
export class PathResolver {
  readonly fs: GameFS;
  /** Directories searched for bare filenames, most specific first. */
  private searchDirs: string[] = [];

  constructor(fs: GameFS) {
    this.fs = fs;
  }

  setSearchDirs(dirs: string[]): void {
    this.searchDirs = dirs.map((d) => normalizePath(d).replace(/\/$/, ''));
  }

  /**
   * Resolve a script filename to an install-relative path, mirroring
   * CPath::resolveFileName (0x100c6ca0): "$" or "&" anchors at the install root,
   * a path with directories is relative to DANE, a bare name is looked up in the
   * current scene/episode/application dirs, and sounds fall back to Wavs/.
   */
  resolve(name: string): string | null {
    const n = normalizePath(name.trim().replace(/^"|"$/g, ''));
    if (!n) return null;
    const candidates: string[] = [];
    if (n.startsWith('$') || n.startsWith('&')) {
      candidates.push(n.slice(1));
    } else {
      for (const d of this.searchDirs) candidates.push(`${d}/${n}`);
      candidates.push(`dane/${n}`);
      if (n.endsWith('.wav')) candidates.push(`wavs/${n}`, `wavs/sfx/${n}`);
      candidates.push(n);
    }
    return candidates.find((c) => this.fs.has(c)) ?? null;
  }
}
