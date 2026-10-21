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
