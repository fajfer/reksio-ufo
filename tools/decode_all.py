#!/usr/bin/env python3
import os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cnvdecode import decode_bytes
src, dst = sys.argv[1], sys.argv[2]
hdr = collections.Counter(); bad = []
for root, _, files in os.walk(src):
    for f in files:
        if f.lower().rsplit('.', 1)[-1] not in ('cnv', 'def', 'class', 'seq', 'dta', 'arr'): continue
        p = os.path.join(root, f); raw = open(p, 'rb').read()
        hdr[raw[:8]] += 1
        out = decode_bytes(raw).decode('cp1250', 'replace')
        if sum(1 for c in out if ord(c) < 32 and c not in '\r\n\t') > 0: bad.append(p)
        q = os.path.join(dst, os.path.relpath(p, src)); os.makedirs(os.path.dirname(q), exist_ok=True)
        open(q, 'w', encoding='utf-8').write(out)
print(hdr.most_common(10)); print('bad:', bad[:10], len(bad))
