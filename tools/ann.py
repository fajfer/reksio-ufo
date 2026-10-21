"""Piklib "NVP" .ANN animation decoder (Reksio i UFO, PIKLIB8.dll).

See tools/annformat.md for the byte layout and the procedures each field was
recovered from.

    from ann import parse_ann, decode_image
    meta = parse_ann(data)                  # dict, no pixel decoding
    w, h, rgba = decode_image(data, meta["images"][0])   # RGBA8888 bytes

CLI:
    python3 -I ann.py FILE.ann [--png OUTDIR]   # dumps metadata JSON, optional PNGs
"""
import json
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lzo  # noqa: E402

# Image compression codes (CGraphicsObject::DeCompress 0x1002c5d0,
# CGraphicsObject::DeCompressRLE2 0x1002c820)
COMP_NONE = 0       # raw RGB565 + raw alpha
COMP_LZO = 2        # LZO(color) + LZO(alpha)
COMP_LZO_RLE = 3    # LZO(RLE(color)) + LZO(RLE(alpha))
COMP_RLE = 4        # RLE(color) + RLE(alpha)
COMP_JPEG = 5       # JPEG(color) + LZO(alpha)
COMP_NAMES = {0: "none", 2: "lzo", 3: "lzo+rle", 4: "rle", 5: "jpeg+lzo-alpha"}


class ANNError(ValueError):
    pass


def _cstr(b):
    return b.split(b"\0", 1)[0].decode("cp1250", "replace")


class _Reader:
    def __init__(self, data):
        self.d = data
        self.o = 0

    def read(self, n):
        if self.o + n > len(self.d):
            raise ANNError("truncated at 0x%x (+%d)" % (self.o, n))
        v = self.d[self.o:self.o + n]
        self.o += n
        return v

    def u32(self):
        return struct.unpack("<I", self.read(4))[0]

    def lpstr(self):
        """u32 length + bytes (may include a trailing NUL)."""
        n = self.u32()
        return self.read(n)


def parse_ann(data):
    """Parse an NVP .ann file into a metadata dict (no pixel decoding).

    Image entries carry 'data_offset'/'data_size'/'alpha_offset'/'alpha_size'
    pointing into `data`, for use by decode_image().
    """
    r = _Reader(data)
    # ---- file header, 0x2c bytes (CAnimo::Load3 0x1000a940) ----
    hdr = r.read(0x2C)
    magic = hdr[0:4]
    if magic[:2] != b"NV":
        raise ANNError("bad magic %r" % magic)
    n_images, bpp, n_events = struct.unpack_from("<HHH", hdr, 4)
    unk_name12 = hdr[0x0A:0x16]
    hdr_dword17 = struct.unpack_from("<I", hdr, 0x17)[0]       # -> CAnimo+0x228
    dword1b = struct.unpack_from("<I", hdr, 0x1B)[0]
    out = {
        "magic": _cstr(magic),
        "n_images": n_images,
        "bpp": bpp,
        "n_events": n_events,
        "header_name12": _cstr(unk_name12),
        "fps": hdr_dword17,                           # -> CAnimo+0x228; Play 0x10008da0 uses 15 if 0
        "unk_0x1b_lowbyte": dword1b & 0xFF,          # -> CAnimo+0x4c
        "flags": dword1b & 0xFFFF00,                 # -> CAnimo+0x208 (_animoflags)
        "opacity": hdr[0x1F],                        # -> CAnimo+0xf8
        "random_frames_number": struct.unpack_from("<h", hdr, 0x20)[0],  # -> CAnimo+0x22c
    }
    out["author"] = _cstr(r.lpstr())
    out["description"] = _cstr(r.lpstr())

    # ---- events (_annEventInfo3, 0x43 bytes each) ----
    events = []
    for _ in range(n_events):
        ev = r.read(0x43)
        nfr = struct.unpack_from("<H", ev, 0x20)[0]
        loop_a, loop_b, loop_c = struct.unpack_from("<hhh", ev, 0x26)
        e = {
            "name": _cstr(ev[0:0x20]),
            "n_frames": nfr,
            "loop_start": loop_a,     # GetLoop 0x10009120: CXPoint.x
            "loop_end": loop_b,       # GetLoop: CXPoint.y; Next 0x10007fb0 compares frame index against it
            "loop_count": loop_c,     # GetLoop return value
            "fps": struct.unpack_from("<I", ev, 0x2E)[0],    # default 0xf (__fill_event_info)
            "flags": struct.unpack_from("<I", ev, 0x32)[0],  # 0x20000 ping-pong, 0x100000 wait-for-sound (Next)
            "opacity": ev[0x36],                             # default 0xff
            "unk_0x37": ev[0x37:0x43].hex(),
        }
        frame_list = list(struct.unpack("<%dH" % nfr, r.read(2 * nfr))) if nfr else []
        e["frame_images"] = frame_list
        frames = []
        for i in range(nfr):
            fr = r.read(0x1E)
            p_name, p_blob = struct.unpack_from("<II", fr, 0)
            dx, dy = struct.unpack_from("<hh", fr, 8)
            unk_c = struct.unpack_from("<i", fr, 0x0C)[0]
            p_sfx = struct.unpack_from("<I", fr, 0x10)[0]
            f = {
                "image": frame_list[i],
                "dx": dx,
                "dy": dy,
                "opacity": fr[0x18],
                "unk_0x0c": unk_c,
                "unk_0x14": struct.unpack_from("<I", fr, 0x14)[0],
                "unk_0x19": fr[0x19],
                "unk_0x1a": struct.unpack_from("<I", fr, 0x1A)[0],
                "name": None,
                "blob": None,
                "sfx": None,
            }
            if p_name:
                f["name"] = _cstr(r.lpstr())
            if p_blob:
                f["blob"] = r.lpstr().hex()
            if p_sfx:
                f["sfx"] = _cstr(r.lpstr())
            frames.append(f)
        e["frames"] = frames
        events.append(e)
    out["events"] = events

    # ---- image headers (CFrame::LoadHeaderNew2 0x34 / LoadHeaderNew 0x20) ----
    old = magic[2:3] == b"+"
    hsize = 0x20 if old else 0x34
    images = []
    for _ in range(n_images):
        ih = r.read(hsize)
        w, h, x, y, comp = struct.unpack_from("<HHhhH", ih, 0)
        csize = struct.unpack_from("<I", ih, 0x0A)[0]
        ndw = struct.unpack_from("<h", ih, 0x0E)[0]
        dws = list(struct.unpack_from("<4I", ih, 0x10))
        img = {
            "width": w,
            "height": h,
            "x": x,
            "y": y,
            "compression": comp,
            "data_size": csize,
            "n_extra_dwords": ndw,
            "extra": dws,
            "alpha_size": dws[3] if ndw >= 4 else 0,
            "name": _cstr(ih[0x20:0x34]) if not old else "",
        }
        images.append(img)
    # ---- image payloads (CFrame::LoadNew 0x10004850) ----
    for img in images:
        img["data_offset"] = r.o
        r.read(img["data_size"])
        img["alpha_offset"] = r.o
        r.read(img["alpha_size"])
    out["images"] = images
    out["trailing_bytes"] = len(data) - r.o
    return out


# ---------------------------------------------------------------- decoding
def rle16(src, out_bytes):
    """CRLECompression::__decompress 0x10019e80 (16-bit units)."""
    out = bytearray()
    i = 0
    n = len(src)
    while len(out) < out_bytes and i < n:
        c = src[i]; i += 1
        if c & 0x80:
            cnt = c & 0x7F
            out += bytes(src[i:i + 2]) * cnt
            i += 2
        else:
            out += src[i:i + 2 * c]
            i += 2 * c
    if len(out) < out_bytes:
        out += bytes(out_bytes - len(out))
    return bytes(out[:out_bytes])


def rle8(src, out_bytes):
    """CRLECompression::__decompresschar 0x10019ef0 (8-bit units)."""
    out = bytearray()
    i = 0
    n = len(src)
    while len(out) < out_bytes and i < n:
        c = src[i]; i += 1
        if c & 0x80:
            out += bytes(src[i:i + 1]) * (c & 0x7F)
            i += 1
        else:
            out += src[i:i + c]
            i += c
    if len(out) < out_bytes:
        out += bytes(out_bytes - len(out))
    return bytes(out[:out_bytes])


def lzw_unwrap(buf):
    """Legacy CLZWCompression::decompress 0x10034a40 container.

    [u32 decompressed_size][u32 compressed_size][u32 n_codes] + LSB-first
    variable-width (9..16 bit) LZW codes; 0x100 = clear, first free code 0x101,
    width grows when the next code no longer fits the mask.
    """
    dsize, _csize, ncodes = struct.unpack_from("<III", buf, 0)
    src = bytes(buf[12:]) + b"\0\0\0\0"
    bitpos, width, mask, nxt = 0, 9, 0x1FF, 0x101
    table = {}
    out = bytearray()
    prev = None
    for _ in range(ncodes):
        v = int.from_bytes(src[bitpos >> 3:(bitpos >> 3) + 4], "little")
        code = (v >> (bitpos & 7)) & mask
        bitpos += width
        if code == 0x100:
            width, mask, nxt, table, prev = 9, 0x1FF, 0x101, {}, None
            continue
        if code < 0x100:
            entry = bytes((code,))
        elif code in table:
            entry = table[code]
        elif prev is not None:
            entry = prev + prev[:1]
        else:
            raise ANNError("bad LZW code %d" % code)
        out += entry
        if prev is not None and nxt < 0x10000:
            table[nxt] = prev + entry[:1]
            nxt += 1
        prev = entry
        if width < 16 and (nxt & ~mask):
            width += 1
            mask = mask * 2 + 1
    return bytes(out[:dsize]).ljust(dsize, b"\0")


def _unwrap_lzo_or_lzw(buf):
    """CGraphicsObject::DeCompress always calls CLZWCompression2 (= LZO1X).

    A few legacy files (only PRZYGODA/Droga/kura.ann) instead carry the old
    12-byte-header LZW container; detect it by its size field.
    """
    if len(buf) >= 12:
        _d, csize = struct.unpack_from("<II", buf, 0)
        if csize + 8 != len(buf) and csize + 12 == len(buf):
            return lzw_unwrap(buf)
    return lzo.piklib_unwrap(buf)


def decode_planes(data, img):
    """Return (color565: bytes len w*h*2, alpha: bytes len w*h or None)."""
    w, h, comp = img["width"], img["height"], img["compression"]
    col = data[img["data_offset"]:img["data_offset"] + img["data_size"]]
    alp = data[img["alpha_offset"]:img["alpha_offset"] + img["alpha_size"]] if img["alpha_size"] else None
    npx = w * h
    if comp in (COMP_LZO, COMP_LZO_RLE):
        col = _unwrap_lzo_or_lzw(col)
        if alp is not None:
            alp = _unwrap_lzo_or_lzw(alp)
        # DeCompress 0x1002c5d0: compression := (comp == 3) ? 4 : 0
        comp = COMP_RLE if comp == COMP_LZO_RLE else COMP_NONE
    if comp == COMP_RLE:
        col = rle16(col, npx * 2)
        if alp is not None:
            alp = rle8(alp, npx)
    elif comp == COMP_JPEG:
        raise ANNError("JPEG (compression 5) colour plane not supported")
    elif comp != COMP_NONE:
        raise ANNError("unknown compression %d" % comp)
    return col[:npx * 2].ljust(npx * 2, b"\0"), (alp[:npx].ljust(npx, b"\0") if alp is not None else None)


# RGB565 -> 8-bit lookup tables
_R5 = [(v << 3) | (v >> 2) for v in range(32)]
_G6 = [(v << 2) | (v >> 4) for v in range(64)]


def decode_image(data, img):
    """Decode an image entry to (width, height, RGBA8888 bytes)."""
    w, h = img["width"], img["height"]
    col, alp = decode_planes(data, img)
    px = struct.unpack("<%dH" % (w * h), col)
    out = bytearray(w * h * 4)
    for i, v in enumerate(px):
        j = i * 4
        out[j] = _R5[v >> 11]
        out[j + 1] = _G6[(v >> 5) & 63]
        out[j + 2] = _R5[v & 31]
        out[j + 3] = alp[i] if alp is not None else 255
    return w, h, bytes(out)


def write_png(path, w, h, rgba):
    def chunk(t, b):
        c = t + b
        return struct.pack(">I", len(b)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = b"".join(b"\0" + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 6)))
        f.write(chunk(b"IEND", b""))


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    data = open(argv[0], "rb").read()
    meta = parse_ann(data)
    printable = json.loads(json.dumps(meta))
    for im in printable["images"]:
        for k in ("data_offset", "alpha_offset"):
            im.pop(k, None)
    print(json.dumps(printable, indent=1, ensure_ascii=False))
    if "--png" in argv:
        outdir = argv[argv.index("--png") + 1]
        os.makedirs(outdir, exist_ok=True)
        base = os.path.splitext(os.path.basename(argv[0]))[0]
        for i, im in enumerate(meta["images"]):
            if im["width"] * im["height"] == 0:
                continue
            w, h, rgba = decode_image(data, im)
            write_png(os.path.join(outdir, "%s_%03d.png" % (base, i)), w, h, rgba)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
