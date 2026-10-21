# MATRIX object (Piklib 8) — reverse-engineering notes

Status: IN PROGRESS. Sources: `Matrix.dll` and PIKLIB8.dll from the install,
scene scripts `scripts/ReksioUfo/PRZYGODA/s44_511_Podkop/*.cnv` (the only
user of MATRIX).

Legend: **[obs]** observed in disassembly at cited address;
**[inf]** inferred (script usage / naming), not confirmed in code.

## Where the code lives

- PIKLIB8.dll contains **no** Matrix procedures (Hopper procedure search
  for "Matrix" returns nothing) **[obs]**. It exports `CMC_ExternObject`
  (ctor 0x1008e700, vtable 0x1014bcec) — the plug-in base class.
- `Matrix.dll` (103,168 bytes, image base 0x10000000) imports PIKLIB8.dll and
  MSVCRT.dll only, and exports `CMatrix` (ctor
  `CMatrix(CMC_ObjectsContainer*)`, vtable `??_7CMatrix@@6B@`),
  `CMElement`, `CMatrix::getImplementedTypes`, `isSupported(CXString)`,
  `resolve(CMC_ObjectsContainer*, CMElement*)`, `serialize(int, CXArchive*)`
  **[obs]** (export table). So MATRIX is an extern-object plug-in.
- Strings in Matrix.dll include the prop names MATRIX, TYPE, ONLATEST, ONNEXT,
  CELLHEIGHT, CELLWIDTH, BASEPOS, SIZE and the method names (see below) **[obs]**.
- Analysis of Matrix.dll is done with `objdump -d` (Hopper session is bound to
  PIKLIB8.dll and must not be switched).

## How PIKLIB8 loads it

- `CMC_Object::getTypeId(CXString)` (PIKLIB8 0x10088470) references the
  string "MATRIX" (0x1014b9ac, xref 0x10089051) **[obs]**: MATRIX is a known
  type id in the core.
- `CMC_DLLExModuleInterface::CMC_DLLExModuleInterface(CXString, CMC_ObjectsContainer*)`
  (PIKLIB8 0x100643c0) references "?getModuleInterface@@YAPAVCMC_ExternObject@@XZ"
  (xref 0x100644ae) **[obs]** — i.e. it GetProcAddress-es the plug-in entry
  point. Matrix.dll exports `getModuleInterface` (0x100014b0), `create`
  (0x10001410), `release` (0x10001480) **[obs]**. The DLL file name is not a
  literal string in PIKLIB8 (presumably built from the type name) **[inf]**.

## Method ids (Matrix.dll hash-set init at 0x10008b60) [obs]

Name -> id pairs put into a `CHashtable` via `CStringHashCode`/`CInteger(id)`:

| id | name | id | name |
|---|---|---|---|
| 1 | TICK | 0xe | SETROW |
| 2 | NEXT | 0xf | CANHEROGOTO |
| 3 | MOVE | 0x10 | GETWIDTH |
| 4 | SET | 0x11 | GETHEIGHT |
| 0xd | GET | 0x12 | CALCENEMYMOVEDIR |
| 5 | LOAD | 0x13 | CALCENEMYMOVEDEST |
| 7 | ISGATEEMPTY | 0x17 | CLEAR |
| 8 | SETGATE | 0xc | GETCELLSNO |
| 9 | ISINGATE | 0xa | GETCELLPOSX |
| 6 | GETCELLOFFSET | 0xb | GETCELLPOSY |
| 0x14 | GETCELLOFFSETATPOS | 0x15/0x16 | GETCELLGFX/SETCELLGFX |
| 0x18.. | GET/SET CELL LEFT/RIGHT/UP/DOWN LINK, GETCELLWITHGFX | | |

## Script definition (S44_511_PODKOP)

```
MAT:SIZE=20,11  MAT:BASEPOS=0,100  MAT:CELLHEIGHT=40  MAT:CELLWIDTH=40
MAT:ONNEXT=BMONNEXT  MAT:ONLATEST=BMONLATEST
```

## TODO
- Method name table / dispatch in Matrix.dll; per-method semantics.
