// CNV / DEF / SEQ definition files.
//
// Encrypted files start with "{<C:N>}" and are decoded per CTextCoder::getLine
// (0x100e0640): every byte has getOffset(idx) (0x100e0610) subtracted, where
// idx cycles 0..N-1 across the whole body and "<E>" marks a line break.

const decoder = new TextDecoder('windows-1250');

function cipherOffset(i: number): number {
  return ((i + 2) >> 1) * (i & 1 ? -1 : 1);
}

export function decryptCnv(raw: Uint8Array): Uint8Array {
  const head = decoder.decode(raw.subarray(0, 16));
  const m = /^\{<([CD]):(\d+)>\}\r?\n/.exec(head);
  if (!m) return raw;
  const key = Number(m[2]);
  const out: number[] = [];
  let idx = 0;
  for (let i = m[0].length; i < raw.length; i++) {
    const b = raw[i];
    if (b === 0x0d || b === 0x0a) continue;
    if (b === 0x3c && raw[i + 1] === 0x45 && raw[i + 2] === 0x3e) {
      // "<E>" line separator
      out.push(0x0a);
      i += 2;
      continue;
    }
    out.push((b - cipherOffset(idx)) & 0xff);
    idx = idx === key - 1 ? 0 : idx + 1;
  }
  return Uint8Array.from(out);
}

export function decodeText(raw: Uint8Array): string {
  return decoder.decode(decryptCnv(raw));
}

export interface ObjectDef {
  name: string;
  /** Property name (upper-cased, may include "^PARAM") -> raw value. Insertion ordered. */
  props: Map<string, string>;
}

/**
 * Parse `OBJECT=NAME` / `NAME:PROP=VALUE` definitions. Objects keep their file
 * order, which matters for ONINIT dispatch.
 */
export function parseDefinitions(text: string): ObjectDef[] {
  const objects: ObjectDef[] = [];
  const byName = new Map<string, ObjectDef>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const left = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (left.toUpperCase() === 'OBJECT') {
      const name = value.toUpperCase();
      const def = { name, props: new Map<string, string>() };
      objects.push(def);
      byName.set(name, def);
      continue;
    }
    const colon = left.indexOf(':');
    if (colon < 0) continue;
    const owner = left.slice(0, colon).toUpperCase();
    const prop = left.slice(colon + 1).toUpperCase();
    const def = byName.get(owner);
    if (def) def.props.set(prop, value);
  }
  return objects;
}

// --- SEQ ---------------------------------------------------------------------

export type SeqNode =
  | { kind: 'SEQUENCE'; name: string; mode: 'SEQUENCE' | 'RANDOM' | 'PARAMETER'; children: SeqNode[]; events: Map<string, number> }
  | { kind: 'SIMPLE'; name: string; filename: string; event: string }
  | {
      kind: 'SPEAKING';
      name: string;
      animoFilename: string;
      wavFilename: string;
      prefix: string;
      starting: boolean;
      ending: boolean;
    };

/**
 * 1-based child number of a SEQEVENT value. CSequencedPlayable::play
 * (0x100d0bc0) uses the first character: '1'-'9' -> child 0-8, 'A'-'Z' ->
 * c - 0x38 (A = child 9), 'a'-'z' -> c - 0x3e.
 */
export function seqEventIndex(value: string): number {
  const c = value.charCodeAt(0);
  if (c <= 0x39) return c - 0x31 + 1;
  if (c <= 0x5a) return c - 0x38 + 1;
  return c - 0x3e + 1;
}

/**
 * Parse a .SEQ file into its root node. Children attach to parents with
 * `CHILD:ADD PARENT`; PARAMETER nodes map event names to 1-based child
 * indices via `NAME:SEQEVENT:EVENT = n`.
 */
export function parseSeq(text: string): SeqNode | null {
  const props = new Map<string, Map<string, string>>();
  const order: string[] = [];
  const parentOf = new Map<string, string>();
  const seqEvents = new Map<string, Map<string, number>>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    let m = /^NAME\s*=\s*(.+)$/i.exec(line);
    if (m) {
      const name = m[1].trim().toUpperCase();
      if (!props.has(name)) {
        props.set(name, new Map());
        order.push(name);
      }
      continue;
    }
    m = /^([^:]+):ADD\s+(.+)$/i.exec(line);
    if (m) {
      parentOf.set(m[1].trim().toUpperCase(), m[2].trim().toUpperCase());
      continue;
    }
    m = /^([^:]+):SEQEVENT:([^=]+?)\s*=\s*(\S+)$/i.exec(line);
    if (m) {
      const owner = m[1].trim().toUpperCase();
      if (!seqEvents.has(owner)) seqEvents.set(owner, new Map());
      seqEvents.get(owner)!.set(m[2].trim().toUpperCase(), seqEventIndex(m[3]));
      continue;
    }
    m = /^([^:]+):([^=]+?)\s*=\s*(.*)$/.exec(line);
    if (m) {
      const owner = m[1].trim().toUpperCase();
      if (!props.has(owner)) {
        props.set(owner, new Map());
        order.push(owner);
      }
      props.get(owner)!.set(m[2].trim().toUpperCase(), m[3].trim());
    }
  }

  const nodes = new Map<string, SeqNode>();
  for (const name of order) {
    const p = props.get(name)!;
    const type = (p.get('TYPE') ?? '').toUpperCase();
    if (type === 'SEQUENCE') {
      const mode = (p.get('MODE') ?? 'SEQUENCE').toUpperCase() as 'SEQUENCE' | 'RANDOM' | 'PARAMETER';
      nodes.set(name, { kind: 'SEQUENCE', name, mode, children: [], events: seqEvents.get(name) ?? new Map() });
    } else if (type === 'SPEAKING') {
      nodes.set(name, {
        kind: 'SPEAKING',
        name,
        animoFilename: p.get('ANIMOFN') ?? '',
        wavFilename: p.get('WAVFN') ?? '',
        prefix: (p.get('PREFIX') ?? '').toUpperCase(),
        starting: (p.get('STARTING') ?? '').toUpperCase() === 'TRUE',
        ending: (p.get('ENDING') ?? '').toUpperCase() === 'TRUE',
      });
    } else if (type === 'SIMPLE') {
      nodes.set(name, { kind: 'SIMPLE', name, filename: p.get('FILENAME') ?? '', event: (p.get('EVENT') ?? '').toUpperCase() });
    }
  }

  let root: SeqNode | null = null;
  for (const name of order) {
    const node = nodes.get(name);
    if (!node) continue;
    const parent = parentOf.get(name);
    const pnode = parent ? nodes.get(parent) : undefined;
    if (pnode && pnode.kind === 'SEQUENCE') pnode.children.push(node);
    else if (!root) root = node;
  }
  return root;
}
