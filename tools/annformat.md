# Piklib NVP `.ANN` animation format (Reksio i UFO, PIKLIB8.dll)

All integers are little-endian. "lpstr" means `u32 length` followed by `length` bytes
(the stored string normally includes its trailing NUL). Text is Windows-1250.
Addresses are PIKLIB8.dll virtual addresses (image base 0x10000000).

## Loader dispatch

`CAnimo::Load(CFile*)` 0x100063e0 compares the magic against the strings at
0x10145cc0..0x10145ce7 (`POS SEQ EXT PI3 PI2 PIK PAK NVP NV+ NVI`). For `NVP`, `NV+`
and `NVI` it seeks back and calls **`CAnimo::Load3` 0x1000a940**, which reads the
whole layout below. All 805 game files are `NVP`. In Load3, when `magic[2] == '+'`,
image headers go through `CFrame::LoadHeaderNew` (0x20 bytes); otherwise they go
through `CFrame::LoadHeaderNew2` (0x34 bytes).
If the magic is neither `NV+` nor `NVP`, Load3 also ORs 0x200000 into the animo flags
(0x1000b15c..0x1000b1d0).

`CAnimo::Save3` 0x1000b510 is the matching writer and confirms the field order.

## File layout

```
FileHeader            0x2c bytes
lpstr author
lpstr description
Event[n_events]       each: EventHeader(0x43) + u16 frame_images[n_frames] + FrameRecord[n_frames]
ImageHeader[n_images] 0x34 bytes each (0x20 if magic[2]=='+')
ImageData[n_images]   each: color[data_size] then alpha[alpha_size]
```

All 805 shipped files are consumed exactly to EOF by this layout (0 trailing bytes).

### FileHeader (0x2c) — Load3 0x1000a97b (Read 0x2c), fields stored at 0x1000aa1d..0x1000aa76

| off | type | field | stored to | notes |
|---|---|---|---|---|
| 0x00 | char[4] | magic `"NVP\0"` | — | Load 0x100063e0 |
| 0x04 | u16 | n_images | CAnimo+0x1f4 | number of CFrame bitmaps (Load3 0x1000aa1d) |
| 0x06 | u16 | bpp | CAnimo+0x48 | always 16 (RGB565). Also copied to every CFrame+0x48 (0x1000adcb) |
| 0x08 | u16 | n_events | CAnimo+0x200 | |
| 0x0a | char[12] | unknown string | — | written by Save3 via `strncpy(...,12)` (0x1000b620); always empty in the game data; not read by Load3 |
| 0x16 | u8 | 0 | — | Save3 writes 0 (0x1000b657) |
| 0x17 | u32 | default FPS | CAnimo+0x228 (0x1000aa31) | `Play` 0x10008da0 substitutes 15 when it is 0. Data: 16 (797 files), 15 (8 files) |
| 0x1b | u32 | low byte -> CAnimo+0x4c (unknown, always 0); bits 8..23 -> **animo flags** CAnimo+0x208 (`GetAnimoFlags` 0x10003620) | | 0x40000 = see `Play` 0x10008da0; 0x400000 = do not load frame SFX (Load3 0x1000ae2f); 0x800000 = when an event finishes, continue to the next event (`Next` 0x10007fb0). Always 0 in the data |
| 0x1f | u8 | opacity | CAnimo+0xf8 (0x1000aa57) | 0xff in all files |
| 0x20 | i16 | random_frames_number | CAnimo+0x22c (`RandomFramesNumber` 0x10003630) | 0 in all files |
| 0x22 | 10 bytes | unused | | |

Next come two lpstrs: author -> CAnimo+0x1d4 (0x1000a9bf) and description -> CAnimo+0x1e4 (0x1000aa05).

### Event (`_annEventInfo3`, 0x43 bytes) — Load3 0x1000aab4 (Read 0x43)

Default values come from `__fill_event_info` 0x100091b0.

| off | type | field | notes |
|---|---|---|---|
| 0x00 | char[32] | name | NUL-padded; scripts use it in `PLAY("NAME")`, `ONFINISHED^NAME`, `SETFRAME("NAME",n)` |
| 0x20 | u16 | n_frames | |
| 0x22 | u32 | (pointer slot) | garbage in file; replaced by the frame-list buffer |
| 0x26 | i16 | loop_start | `GetLoop` 0x10009120 returns CXPoint(+0x26,+0x28) |
| 0x28 | i16 | loop_end | `Next` 0x10007fb0: when non-zero and the frame index > loop_end, the loop/ping-pong logic applies |
| 0x2a | i16 | loop_count | return value of `GetLoop` |
| 0x2c | u16 | runtime counter | zeroed by `Play` 0x10008da0; garbage in file |
| 0x2e | u32 | fps | default 0xf; data: 16 or 15 |
| 0x32 | u32 | event flags | `Next`: 0x20000 = ping-pong (bounce back), 0x100000 = wait for the frame sound to finish. Data: 0 everywhere except one 0x100 (s33_Meteory/dymek.ann "OUT"), whose meaning is unknown |
| 0x36 | u8 | opacity | default 0xff. Used when frame opacity is 0xff (`SetEventFrame` 0x100074b0) |
| 0x37 | 12 bytes | unknown | zeroed by `__fill_event_info` (u16@0x37, u8@0x39, u8@0x3a, u32@0x3b, u32@0x3f). Always zero |

Then `u16 frame_images[n_frames]`, which maps each event frame to an image index (Load3 0x1000ab2f; used by `SetEventFrame` 0x100074b0 -> `CAnimo::Set(image)`).

Then `n_frames` × **FrameRecord** (`_anmFrameInfo3`, 0x1e bytes, Load3 0x1000abc0, defaults from `__fill_frame_info` 0x10009280):

| off | type | field | notes |
|---|---|---|---|
| 0x00 | u32 | has_name (pointer slot) | if non-zero, an lpstr **frame name** follows (0x1000abd6). Used by GETFRAMENAME. Present on 100% of frames in the data |
| 0x04 | u32 | has_blob (pointer slot) | if non-zero, an lpstr of raw bytes follows (0x1000ac2e). Never present in the data; purpose unknown |
| 0x08 | i16 | dx | added to the animo draw position (`SetEventFrame` 0x100074b0) |
| 0x0a | i16 | dy | ditto |
| 0x0c | i32 | unknown | default -1; -1 in all data |
| 0x10 | u32 | has_sfx (pointer slot) | if non-zero, an lpstr **sound filename** follows (0x1000ac87). It may hold several names separated by `;`, which selects a random-sound object (sub_100cb7c0) instead of `CSound4` (0x1000b06e). The path is resolved with `CWindow::GetSoundFXFullPath` (e.g. `SFX\00step1.wav;SFX\00step2.wav`) |
| 0x14 | u32 | unknown | 0 |
| 0x18 | u8 | opacity | 0xff means "use the event opacity" (`SetEventFrame`) |
| 0x19 | u8 | unknown | 0 |
| 0x1a | u32 | unknown | 0 |

The optional lpstrs follow the 0x1e-byte record in the order name, blob, sfx.

### ImageHeader (0x34) — `CFrame::LoadHeaderNew2` 0x10004a10

| off | type | field | CFrame / CGraphicsObject slot |
|---|---|---|---|
| 0x00 | u16 | width | +0x38 |
| 0x02 | u16 | height | +0x3c |
| 0x04 | i16 | x offset | +0x148, +0x7c |
| 0x06 | i16 | y offset | +0x14c, +0x80 |
| 0x08 | u16 | compression | +0xc4 (see below) |
| 0x0a | u32 | color data size (bytes in file) | +0xc0/+0xbc/+0xb8 |
| 0x0e | i16 | n_extra (always 4) | +0x90 |
| 0x10 | u32[n_extra] | extra dwords copied to +0x94.. | [0..2] are unknown and always 0; **[3] (+0xa0) = alpha data size** (read by `CFrame::LoadNew` 0x10004850) |
| 0x20 | char[20] | image name | present in the file but **not consumed** by LoadHeaderNew2. It usually matches the frame name |

For `NV+` the header is the first 0x20 bytes only (`CFrame::LoadHeaderNew` 0x10004ab0).

The image's draw position is animo position + image (x,y) + frame (dx,dy) (`SetFrame` 0x10007620 copies image x/y; `SetEventFrame` adds frame dx/dy).

### ImageData — `CFrame::LoadNew` 0x10004850

For each image, in header order: `color[data_size]`, then `alpha[alpha_size]` (only if alpha_size > 0).

## Compression (`CGraphicsObject::DeCompress` 0x1002c5d0, `DeCompressRLE2` 0x1002c820)

| value | meaning | count in game ANNs |
|---|---|---|
| 0 | raw: color = w*h u16 RGB565, alpha = w*h u8 | 173 |
| 2 | "CLZWCompression2" = LZO1X on both planes; afterwards compression becomes 0 | 91 |
| 3 | LZO1X on both planes, then compression becomes 4 (RLE) | 6764 |
| 4 | RLE on both planes (`DeCompressRLE2`) | 2348 |
| 5 | JPEG color (`JPEG::decompress`) + LZO alpha, then compression becomes 0 | 0 |

DeCompress sets the new compression with `(c == 3) ? 4 : 0`. After LZO it also sets the alpha size to w*h.

**LZO container** (sub_100eaaa0): `u32 decompressed_size, u32 compressed_size, LZO1X stream`.

**RLE16 color** (`CRLECompression::__decompress` 0x10019e80): read a control byte `c` and loop until the output reaches `w*h*2` bytes (`__get_data_size` 0x10026cc0 = w*h*2):
- `c & 0x80`: read one u16 and repeat it `c & 0x7f` times;
- otherwise: copy `c` u16 values literally.

**RLE8 alpha** (`__decompresschar` 0x10019ef0): the same scheme with byte units, output w*h.

**Pixel format:** 16-bit RGB565, little-endian (`r = v>>11`, `g = (v>>5)&63`, `b = v&31`).
The file bpp field is 16. In `GetRealBpp` 0x1002c230 the code 4 maps to 16 and 2 maps to 15, so 16 means 565. Rendered samples (red/yellow menu icons, the white Piotrus dog) show correct colors under 565. Alpha is 8-bit straight alpha. When alpha_size is 0 the image is opaque.

## Unknowns

- Header 0x0a char[12], the 0x1b low byte (CAnimo+0x4c), and the meaning of animo flag 0x40000.
- Event bytes 0x37..0x42, event flag 0x100, and the exact loop_count semantics.
- Frame 0x04 blob, 0x0c (always -1), 0x14, 0x19, 0x1a.
- Image extra dwords [0..2].
- JPEG variant (compression 5) is not used by the game's ANNs and is not implemented.
