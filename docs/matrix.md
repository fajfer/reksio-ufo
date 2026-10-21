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

## Object structure (Matrix.dll) [obs]

- `CMatrix::resolve` (0x10001250) compares TYPE with "MATRIX", then
  `new(0x4c)` + script-object ctor 0x10005860 (vtable 0x1000dbb4, base
  `CMC_Object(container, element, 0x2712)`).
- Ctor 0x10005860 reads `SIZE` and `BASEPOS` with
  `CMElement::getPropertyPointValue`, `CELLWIDTH`/`CELLHEIGHT` with
  `getPropertyIntValue`, then `new(0x50)` + model ctor 0x100022e0 stored at
  object+0x48 (returned by object vtable slot 0x90 = 0x10005fd0).
- Model ctor 0x100022e0 `(window, owner, W, H, baseX, baseY, cellW, cellH)`:
  model+0x34=W, +0x38=H, +0x3c=baseX, +0x40=baseY, +0x48=cellW, +0x4c=cellH;
  +0xc = `byte[W*H]` (cell codes), +0x10 = second `byte[W*H]`,
  +0x44 = array of W*H 0x2c-byte cell records (ctor 0x10003df0), whose first
  two dwords are the cell pixel position: `x = baseX + col*cellW`,
  `y = baseY + row*cellH`; cell index = `row*W + col`.
  Finally 0x10001f00 zero-fills the code array (W*H bytes).
- Model vtable 0x1000d5b0.

## Runner dispatch (0x100084a0, jump table 0x100087f0) [obs]

`run(id, object, container, params)`; every handler fetches the model via
object vtable+0x90 and calls a model virtual:

| method | handler | model call |
|---|---|---|
| TICK | 0x10006b50 | vt+0x04 (0x10002810), no args, returns nothing |
| NEXT | 0x10006b70 | vt+0x08 (0x100029e0), returns int in a new CMC_Integer |
| MOVE (2 args) | 0x10006ba0 | vt+0x0c (0x10002c40)(a0, a1) |
| MOVE (4 args) | 0x10006ba0 | vt+0x10 (0x10002c10)(CXSize(a0,a1), CXSize(a2,a3)) |
| SET (2 args) | 0x10006c90 | vt+0x14 (0x10002cc0)(a0, a1) |
| SET (3 args) | 0x10006c90 | vt+0x18 (0x10002ca0)(CXSize(a0,a1), a2) |
| CLEAR | 0x10006d60 | vt+0x78 (0x10003a50) |
| LOAD | 0x10006ae0 | object vt+0x40(params,0) -> string, model vt+0x90 |

## Script definition (S44_511_PODKOP)

```
MAT:SIZE=20,11  MAT:BASEPOS=0,100  MAT:CELLHEIGHT=40  MAT:CELLWIDTH=40
MAT:ONNEXT=BMONNEXT  MAT:ONLATEST=BMONLATEST
```

## TODO
- Method name table / dispatch in Matrix.dll; per-method semantics.
