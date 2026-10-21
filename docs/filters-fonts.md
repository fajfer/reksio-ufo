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
