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

## Script definition (S44_511_PODKOP)

```
MAT:SIZE=20,11  MAT:BASEPOS=0,100  MAT:CELLHEIGHT=40  MAT:CELLWIDTH=40
MAT:ONNEXT=BMONNEXT  MAT:ONLATEST=BMONLATEST
```

## TODO
- Method name table / dispatch in Matrix.dll; per-method semantics.
