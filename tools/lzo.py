"""Pure-Python LZO1X decompressor (fallback when python-lzo is unavailable).

Piklib's "CLZWCompression2" (PIKLIB8.dll, decompressor sub_100eaaa0) is plain
LZO1X.  Piklib wraps the stream as:

    u32 decompressed_size
    u32 compressed_size
    lzo1x stream (compressed_size bytes)

Use `piklib_unwrap()` for that container, or `decompress()` for a raw stream.
"""
import struct

try:  # pragma: no cover - optional fast path
    import lzo as _lzo  # type: ignore
except Exception:  # noqa: BLE001
    _lzo = None


class LZOError(ValueError):
    pass


def _decompress_py(src, out_len=None):
    src = memoryview(bytes(src))
    n = len(src)
    out = bytearray()
    ip = 0

    def copy_match(m_pos, length):
        if m_pos < 0:
            raise LZOError("lookbehind overrun")
        if m_pos + length <= len(out):
            out.extend(out[m_pos:m_pos + length])
        else:
            for k in range(length):
                out.append(out[m_pos + k])

    state = "loop"
    t = 0
    if n == 0:
        return bytes(out)
    if src[0] > 17:
        t = src[0] - 17
        ip = 1
        if t < 4:
            state = "match_next"
        else:
            out.extend(src[ip:ip + t])
            ip += t
            state = "first_literal_run"

    while True:
        if state == "loop":
            t = src[ip]; ip += 1
            if t >= 16:
                state = "match"
                continue
            if t == 0:
                while src[ip] == 0:
                    t += 255
                    ip += 1
                t += 15 + src[ip]; ip += 1
            out.extend(src[ip:ip + t + 3])
            ip += t + 3
            state = "first_literal_run"
            continue

        if state == "first_literal_run":
            t = src[ip]; ip += 1
            if t >= 16:
                state = "match"
                continue
            m_pos = len(out) - (1 + 0x0800) - (t >> 2) - (src[ip] << 2); ip += 1
            copy_match(m_pos, 3)
            state = "match_done"
            continue

        if state == "match":
            if t >= 64:
                m_pos = len(out) - 1 - ((t >> 2) & 7) - (src[ip] << 3); ip += 1
                copy_match(m_pos, (t >> 5) - 1 + 2)
            elif t >= 32:
                t &= 31
                if t == 0:
                    while src[ip] == 0:
                        t += 255
                        ip += 1
                    t += 31 + src[ip]; ip += 1
                m_pos = len(out) - 1 - ((src[ip] | (src[ip + 1] << 8)) >> 2)
                ip += 2
                copy_match(m_pos, t + 2)
            elif t >= 16:
                m_pos = len(out) - ((t & 8) << 11)
                t &= 7
                if t == 0:
                    while src[ip] == 0:
                        t += 255
                        ip += 1
                    t += 7 + src[ip]; ip += 1
                m_pos -= (src[ip] | (src[ip + 1] << 8)) >> 2
                ip += 2
                if m_pos == len(out):
                    break  # end-of-stream marker
                m_pos -= 0x4000
                copy_match(m_pos, t + 2)
            else:
                m_pos = len(out) - 1 - (t >> 2) - (src[ip] << 2); ip += 1
                copy_match(m_pos, 2)
            state = "match_done"
            continue

        if state == "match_done":
            t = src[ip - 2] & 3
            if t == 0:
                state = "loop"
                continue
            state = "match_next"
            continue

        if state == "match_next":
            out.extend(src[ip:ip + t])
            ip += t
            t = src[ip]; ip += 1
            state = "match"
            continue

    if out_len is not None and len(out) != out_len:
        raise LZOError("size mismatch: got %d expected %d" % (len(out), out_len))
    return bytes(out)


def decompress(src, out_len=None):
    """Decompress a raw LZO1X stream."""
    if _lzo is not None and out_len is not None:
        return _lzo.decompress(bytes(src), False, out_len)
    return _decompress_py(src, out_len)


def piklib_unwrap(buf):
    """Decode Piklib's [u32 dsize][u32 csize][lzo1x] container."""
    dsize, csize = struct.unpack_from("<II", buf, 0)
    return decompress(bytes(buf[8:8 + csize]), dsize)
