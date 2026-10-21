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
