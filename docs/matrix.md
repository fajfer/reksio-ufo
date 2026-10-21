# MATRIX object (Piklib 8) — reverse-engineering notes

Status: IN PROGRESS. Sources: PIKLIB8.dll (REA/Hopper), scene scripts
`scripts/ReksioUfo/PRZYGODA/s44_511_Podkop/*.cnv` (only user of MATRIX).

Legend: **[obs]** observed in disassembly/pseudocode at cited address;
**[inf]** inferred (script usage / naming), not yet confirmed.

## Props (from scripts)
SIZE, BASEPOS, CELLHEIGHT, CELLWIDTH, ONNEXT, ONLATEST — TODO parse semantics.

## Methods (from scripts)
SETROW, GET, SET, GETCELLSNO, GETCELLPOSX, GETCELLPOSY, CANHEROGOTO, NEXT,
GETCELLOFFSET, MOVE, ISGATEEMPTY, SETGATE, TICK, ISINGATE, CALCENEMYMOVEDIR,
CALCENEMYMOVEDEST — TODO addresses/semantics.

## TODO
- Locate class in PIKLIB8.dll (CMC_Matrix?), method hash set, runner.
- Check reference to Matrix.dll.
