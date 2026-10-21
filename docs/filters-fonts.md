# Piklib STATICFILTER / FILTER / FONT semantics

Status: in progress. "observed" = seen in DLL/scripts/data; "inferred" = guess.

## Script usage (observed, scripts/)
- STATICFILTER objects: FROTATE (x2), FROTPOW, FROTSINGLE (s67_Wyscigi, s85_Slonce, s86_Jajo, s65_Zamek, s16_SpaceInvaders).
- FILTER object: FFADEIN (x1).
- FONT objects: FARIAL, FNTARIAL (x2), property `DEF_ARIAL_STANDARD_14=ARIAL14.FNT`.
- No *.fnt file found under game/ by name search yet. TODO: locate ARIAL14.FNT (maybe case/extension differs or packed).

## TODO
- Rotation semantics (pivot, units, direction, CURRENTFRAME, CANUNDO).
- Fade semantics.
- Font file format and draw routine.

## Script evidence (observed)
- All STATICFILTERs use `ACTION=ROTATE`. FFADEIN (s65_Zamek) has `ACTION=FADEOUT` and is never called from any script.
- Usage pattern (s67 BEHROTATE, s85 BEHROTPOW, s86 BEHROTATE/BEHROTATESINGLE): `F^UNLINK(anim); F^SETPROPERTY("ANGLE",a); F^LINK(anim)`. Init: `SETPROPERTY("CANUNDO","TRUE"); SETPROPERTY("CURRENTFRAME","TRUE"); LINK(...)`.
- Angle units: degrees. s67 BEHONKEYRIGHT does `ARRANGLE^ADDAT(p,9)`, LEFT `SUBAT(p,9)`, `MODAT(p,360)`; BEHANGLETODIR sets dirx=COSINUS(angle), diry=SINUS(angle) (screen y down) => increasing angle turns clockwise on screen, so the filter must rotate clockwise for positive ANGLE (inferred from gameplay consistency; DLL TODO).
- TEXT objects using fonts are debug readouts (TXTDEBUG*, TXTV*): FONT, TOCANVAS=TRUE, RECT=x1,y1,x2,y2, PRIORITY, HJUSTIFY=LEFT, VJUSTIFY=TRUE.
- ARIAL14.FNT is NOT shipped in game/ (find -iname '*.fnt' empty in game/ and ~/reksio).

## REA status
- Hopper session became unreachable (search_procedures timed out). Switched to llvm-objdump on PIKLIB8.dll exports.

## DLL: STATICFILTER (observed)
- `sub_100a4490` = STATICFILTER object ctor (CMC_Object type id 0x7df). Reads property `ACTION` and builds a filter by name:
  COLORCHANNEL, GRAYSCALE, BLUR, ROTATE, SCALE, NEGATIVE, RANDOMJITTER, WAVES. Wrapper object (0x14 bytes) + inner filter.
  ROTATE: wrapper vtable 0x1014cd08 (secondary 0x1014ccf8), inner filter 0x18 bytes, vtable 0x1014ccf0, created via `sub_100a4f60(0x66)`, with byte fields +0xc=0, +0xd=1 (inferred: +0xc/+0xd are CURRENTFRAME/CANUNDO-like flags; TODO confirm).
- `sub_100a4b40` = serialize/deserialize (same ACTION switch).
- `sub_100a67b0` = SCALE filter SETPROPERTY: FACTORX/FACTORY (double), BYCENTER (bool), else falls to base `sub_100a4fa0`.
- Filter property strings: CURRENTFRAME, CANUNDO, SIZE, RGB, CHANNELS, MAXJITTER, ANGLE, BYCENTER, FACTORY, FACTORX, OFFSET (0x1014cecc..0x1014cfb8).

## DLL: ROTATE filter internals (observed unless marked)
- Inner filter base property setter `sub_100a4fa0`: `CANUNDO` -> bool byte at filter+0xc (default 0, set in ctor at 0x100a4490), `CURRENTFRAME` -> bool byte at filter+0xd (default 1). Else falls to `sub_1006f200`.
- Rotate property setter `sub_100a6640` (inner vtable 0x1014ccf0 slot 0): `ANGLE` -> `CXString::toDouble` -> double at filter+0x10. Other names fall through to base `sub_100a4fa0`.
- Pixel routine `sub_1002e410` (rotate wrapper vtable 0x1014cd08 slot 9, arg0 = CGraphicsObject*, arg1 = free-old-buffers flag):
  - theta = ANGLE * (-0.017453233333) (constant at 0x10147f88 = -pi/180 with pi~3.14158). s=sin(theta), c=cos(theta).
  - (cx,cy) = getCenterPoint() = (w/2, h/2) integer-truncated (`0x1002cf70` returns this[+0x38]/2, this[+0x3c]/2: local, not screen).
  - New size W = max(|x'(corner A)-x'(corner C)|, |x'(B)-x'(D)|) (two diagonals of the rect rotated about the center, `_ftol` truncation, abs), H likewise.
  - New 16-bit (RGB565/555) pixel buffer W*H zeroed; alpha buffer W*H zeroed only if the source has alpha (+0xb0).
  - For each dst (i in [0,W), j in [0,H)): dx=i-W/2, dy=j-H/2 (int, trunc div); srcX = trunc(dx*c - dy*s + w/2), srcY = trunc(dx*s + dy*c + h/2). Nearest neighbour; copied only if in-bounds and (no alpha or alpha>0); alpha copied too.
  - Since theta = -ANGLE in radians and src = R(theta)*d with y down, positive ANGLE rotates the image CLOCKWISE on screen (derived). Matches s67 RIGHT key: ANGLE += 9 and direction (cos a, sin a).
  - Then setSize(W,H) (vtable+0xd0) and `Move(cx - W/2, cy - H/2)` (vtable+0x6c, `0x1002aba0` = relative move) so the CENTER of the image stays fixed. Pivot = center of the frame's bounding box.
- Frame observer `0x100a6060` (wrapper secondary vtable; called when the linked animo's frame changes): proceeds only if CURRENTFRAME (filter+0xd)==1. Keeps per-frame byte flags (applied?) at +0x18 indexed by frame, last frame at +0x1c. On frame change: if previous frame was filtered and CANUNDO (inner vtable+4 = `0x100013b0` returns +0xc), restores it via wrapper+0x34 (`sub_100a5480`: restores saved data ptr, alpha, size, position, +0xc4), clears its flag. For new frame, if not yet filtered: mark, if CANUNDO save a backup (wrapper+0x44), then call rotate (wrapper+0x24 -> `sub_1002e410`), then SetClippingRect.
  => CANUNDO=TRUE: rotation is non-destructive / absolute (re-applied from the pristine frame each time). Scripts always UNLINK -> set ANGLE -> LINK, so UNLINK restores the original and LINK re-applies with the new angle (inferred: LINK applies immediately to the current frame; TODO confirm in runner).

## DLL: STATICFILTER runner methods (observed)
- Runner method table built around 0x100a6d00 (method ids via CInteger), handlers:
  - `sub_100a6a80` SETPROPERTY(name, value): both args toString'd, forwarded to the filter's property setter (`sub_10070f80` -> inner setProperty chain above).
  - `sub_100a6b10` LINK(objName): looks up the CGraphicsObject by name; Invalidate; filter-wrapper vtable+0x8 (`sub_1006eb50`) attach(graphic, cmcObject); Invalidate.
  - `sub_100a6bd0` UNLINK(objName): wrapper vtable+0x10 (`sub_1006ebd0`) detach(graphic).
- Attach `sub_100a5bd0`: for ANIMO (type 0x7d0): takes the CURRENT frame's graphic, if CANUNDO saves a backup (wrapper+0x40), applies the filter immediately (wrapper+0x2c), registers a frame-change notifier (`CPlayable::addNotifier`, so later frames are filtered by observer 0x100a6060 when CURRENTFRAME), then `CAnimo::Set` to refresh. For IMAGE: if CANUNDO backup (+0x3c), apply once (+0x28).
- Detach `sub_100a5d20`: removes notifier; if CURRENTFRAME and the current frame is flagged filtered, restores it; if CANUNDO restores all backups (+0x38/+0x30); Invalidate.
- => Port semantics: LINK(anim) = attach a rotation transform {angle} to the animo (rendered every frame, any frame); UNLINK = remove it. Changing ANGLE while linked does NOT update the image in the original until relink (scripts always relink). Port may apply live; harmless.
- Rotation is about the CENTER of each frame's own bitmap (frame w/2,h/2), not the animo position/hotspot. Since frame image offset moves by (w/2-W/2, h/2-H/2), the visual center remains at framePos + (w/2, h/2).

## DLL: FILTER (dynamic) object (observed)
- `sub_1006dbb0` builds a FILTER by ACTION: FADEIN, FADEOUT, FADEINOUT, PATH, WATER, WAVING.
- Fade parameter block (0x28 bytes, base init `sub_1006f080(mode)`: SPEED double at +0x10 default 0.1 (0x3fb999999999999a), mode at +4):
  - FADEIN: mode 1, START(+0x18)=0.0, END(+0x20)=255.0.  FADEOUT: mode 2, START=255.0, END=0.0. FADEINOUT: mode 1 with FADEIN params (wrapper vtable 0x1014ac2c; TODO exact in/out switching).
  - Property setter `sub_1006f0b0`: SPEED / START / END (doubles), else base `sub_1006f200`.
- Per-linked-object state holds the current value (double at state+8), initialised from START (inferred).
- Step FADEIN `sub_10020270`: cur += SPEED; if cur >= END: cur = END, returns done=1. If trunc(cur) changed, graphic->SetOpacity(trunc(cur)) (vtable+0x3c) + Invalidate.
- Step FADEOUT `sub_10020300`: cur -= SPEED, clamped at END (0); SetOpacity(trunc(cur)) when integer part changes.
- Step is called per engine tick (ONTICK event string exists near; TODO: tick rate). Strings in that area: ONTICK, END, START, SPEED, ONEATTIME, LOOPED, ISRUNNING, LINK, UNLINK.
- Script usage: FFADEIN (ACTION=FADEOUT, s65_Zamek) is declared but never referenced, so the port only needs a stub with LINK/UNLINK/SETPROPERTY and a best-effort opacity animation.

## DLL: FONT file format (.FNT) (observed from CSimpleFont6::Load(CFile*) `0x100d2a80` and writer CSimpleFont6::create `0x100d2e00`)
- Header 20 bytes, 5 x int32 LE: h0 = 0x46 (written by create; ignored by Load), h1 = atlas width -> this+0x38, h2 = atlas height -> this+0x3c, h3 -> this+0x48 (create writes 0x10; inferred bpp=16), h4 = N letters -> this+0x14c.
- Then: `chars[N]` (u8 char codes, this+0x148; create takes each glyph's first char of its ANIMO event name), `kern[N*N]` (u8, this+0x13c; create stores `1 - getKerning(i,j)` at [i*N + j]), `leftOff[N]` (u8, +0x140: empty columns on the left, from getLeftOffset), `rightOff[N]` (u8, +0x144: empty columns on the right), then pixels `W*H*2` bytes (16-bit, this+0x44 data ptr; CAnimo::Convert(16) => RGB565 inferred), then alpha `W*H` bytes (this+0xb0 alpha ptr) — Load reads sizes via Width()/Height() vtable 0xc4/0xc8.
- Atlas layout (create): glyph k's frame (gw x gh, padded 1px clear border) is copied to columns [k*gw, (k+1)*gw) of a single W=N*gw, H=gh image. So glyph width = W / N.
- Font object: FONT TYPE with property `DEF_<FAMILY>_<STYLE>_<SIZE>=<file>` (e.g. DEF_ARIAL_STANDARD_14=ARIAL14.FNT). ARIAL14.FNT is NOT present in the game install, so the port must fall back to a canvas font.

## DLL: glyph metrics and drawing (observed)
- All per-letter tables are read as SIGNED int8 (movsx). `findLetter` `0x100d36c0`: linear search of chars[] for the byte, -1 if absent.
- `getLetterWidth(prev, ch)` `0x100d3930`: ch==' ' -> getLetterWidth(0,'l') (space is as wide as 'l'); ch=='~' -> 1; ch not found -> 0; else gw - right[i] - left[i] - (prevIdx>=0 ? kern[N*prevIdx + i] : 0), gw = W / N (int div).
- `getRealLetterWidth(ch)` `0x100d3ba0`: same without kerning.
- `getKerning(a,b)` `0x100d3b30`: kern[N*idx(a) + idx(b)].
- `drawLetter(prev, ch, x, y)` `0x100d3700`: for a found glyph i: srcX0 = i*gw + left[i]; w = gw - right[i] - left[i]; k = kern[N*prevIdx + i] (0 if no prev). Positions the whole atlas at (x - srcX0 - k, y) (vtable+0x64) and clips to atlas columns [srcX0, srcX0 + w) x [0, H), Redraw. So the glyph's visible columns land at screen x - k.
  Returns advance = w - k + 2 (space: width('l') + 2; '~': 3; unknown char: 2). I.e. a fixed 2px letter spacing on top of the trimmed glyph width.
