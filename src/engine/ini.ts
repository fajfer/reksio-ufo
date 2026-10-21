// Ufo.ini replacement: [SECTION] KEY=VALUE persisted to localStorage.

export class IniStore {
  private key: string;
  private data: Record<string, Record<string, string>> = {};

  constructor(key: string) {
    this.key = key;
    try {
      const raw = localStorage.getItem(key);
      if (raw) this.data = JSON.parse(raw) as typeof this.data;
    } catch {
      // Storage unavailable (private mode, blocked): keep an in-memory save.
    }
  }

  get(section: string, name: string): string | undefined {
    return this.data[section.toUpperCase()]?.[name.toUpperCase()];
  }

  set(section: string, name: string, value: string): void {
    const s = (this.data[section.toUpperCase()] ??= {});
    s[name.toUpperCase()] = value;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // ignore
    }
  }

  /** Import an original Ufo.ini text (used once when no save exists). */
  importIni(text: string): void {
    let section = '';
    for (const line of text.split(/\r?\n/)) {
      const sec = /^\s*\[([^\]]+)\]/.exec(line);
      if (sec) {
        section = sec[1];
        continue;
      }
      const kv = /^\s*([^=]+?)\s*=\s*(.*)$/.exec(line);
      if (kv && section) this.set(section, kv[1], kv[2]);
    }
  }

  get empty(): boolean {
    return Object.keys(this.data).length === 0;
  }
}
