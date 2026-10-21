#!/usr/bin/env python3
"""Decode Piklib {<C:N>} / {<D:N>} encrypted CNV/DEF/CLASS scripts.

Algorithm from PIKLIB8.dll CTextCoder::getLine / getOffset (0x100e0640, 0x100e0610):
  offset(i) = ((i+2)//2) * (-1 if i odd else 1)
  plain = cipher - offset(idx), idx cycles 0..N-1 across the whole body.
"<E>" in the cipher stream marks a line break.
"""
import re, sys

def offset(i):
    return ((i + 2) // 2) * (-1 if i & 1 else 1)

def decode_bytes(data: bytes) -> bytes:
    m = re.match(rb'\{<([CD]):(\d+)>\}\r?\n', data)
    if not m:
        return data
    mode, n = m.group(1), int(m.group(2))
    body = data[m.end():].replace(b'\r', b'').replace(b'\n', b'').replace(b'<E>', b'\n')
    out = bytearray()
    idx = 0
    for b in body:
        if b == 0x0A:
            out += b'\r\n'
            continue
        out.append((b - offset(idx)) & 0xFF)
        idx = 0 if idx == n - 1 else idx + 1
    return bytes(out)

if __name__ == '__main__':
    sys.stdout.buffer.write(decode_bytes(open(sys.argv[1], 'rb').read()))
