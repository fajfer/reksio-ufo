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

## Model functions (Matrix.dll) [obs]

Notation: `code[]` = model+0xc byte grid, `plan[]` = model+0x10 byte grid
(per-tick movement plan), `cell[i].state` = dword at +8 of the 0x2c-byte cell
record (setter 0x10004100, getter 0x10004110). Index `i = y*W + x`.

### Model vtable 0x1000d5b0
| slot | addr | meaning |
|---|---|---|
| +0x00 | 0x100024e0 | LOAD(path) |
| +0x04 | 0x10002810 | TICK |
| +0x08 | 0x100029e0 | NEXT |
| +0x0c | 0x10002c40 | moveOff(from, to, state) |
| +0x10 | 0x10002c10 | moveXY((fx,fy),(tx,ty),state) -> moveOff(fy*W+fx, ty*W+tx, state) |
| +0x14 | 0x10002cc0 | setOff(i, v): `code[i] = (byte)v` |
| +0x18 | 0x10002ca0 | setXY(x, y, v): `code[y*W+x] = (byte)v` |
| +0x1c | 0x10002d00 | getOff(i) -> code[i]  (GET with 1 arg) |
| +0x20 | 0x10002ce0 | getXY(x, y) -> code[y*W+x]  (GET with 2 args) |
| +0x78 | 0x10003a50 | CLEAR |

### moveOff (0x10002c40)
```
if code[to] != 8:            # 8 absorbs: the source just vanishes
    code[to] = code[from]
    if code[to] == 2: cell[to].state = state
code[from] = 0; cell[from].state = 0
```
Script MOVE(a,b) -> moveOff(a,b,0); MOVE(x0,y0,x1,y1) -> moveXY(...,0)
(runner 0x10006ba0).

### TICK (0x10002810) — plans boulder (code 2) movement
```
iterX = 0; iterY = H-2; plan.fill(0)
for x in 0..W-1:
  y = H-2
  while y >= 0:
    i = y*W+x
    if code[i] == 2:
      b = code[i+W]                    # cell below
      if b == 0 or b == 5:
        plan[i] = (b == 5) ? 4 : 1     # fall (4 = fall onto a 5)
        # skip the run of boulders stacked directly above (they stay plan 0)
        if code[i-W] == 2: y--, then while y>=0 and code[(y-1)*W+x]==2... (see asm 0x10002980)
      elif b == 2:                     # boulder on boulder: try to roll
        if y != 0 and code[i-W] == 2: cell[i].state = 0          # loaded from above: no roll
        elif (x==0 or plan[i-1]==0) and (x<=1 or plan[i-2]==0)
             and code[i-1]==0 and code[i+W-1]==0:
             cell[i].state = 2; plan[i] = 2                       # roll left
        elif (x==W-1 or plan[i+1]==0) and (x>=W-2 or plan[i+2]==0)
             and code[i+1]==0 and code[i+W+1]==0:
             cell[i].state = 3; plan[i] = 3                       # roll right
        else: cell[i].state = 0
      else: cell[i].state = 0
    y--
```
(no bounds clamp on x-1 at x==0: reads the previous row's last cell — flat indexing.)

### NEXT (0x100029e0) — executes one planned move per call
```
res = 0
for y = iterY downto 0:
  for x = (y==iterY ? iterX : 0) .. W-1:
    m = plan[y*W+x]; if m == 0: continue
    switch m (jump table 0x10002bf4):
      1: moveXY((x,y),(x,y+1),1); if code[(y+2)*W+x] == 0x63: res = 2
      2: moveXY((x,y),(x-1,y+1),2)
      3: moveXY((x,y),(x+1,y+1),3)
      4: if cell[y*W+x].state != 1: continue   # not executed
         cell[y*W+x].state = 0                 # (no move)
    (nx,ny) = nextPos(x,y)          # 0x100022b0: x+1, or (0,y-1) at row end
    if hasPlanFrom(nx,ny):          # 0x10001f30: any plan!=0 scanning on from (nx,ny)
        iterX,iterY = nx,ny
        fire ONNEXT(x, y, m); return res or 1
    else:
        iterX = W; iterY = -1
        fire ONLATEST(x, y, m); return res
return 0
```
Events are fired by 0x10001f90: it looks up the behaviour named by the
ONNEXT/ONLATEST property (owner vt+0x74 = getBehaviour) and runs it with three
string params `[x, y, m]` (CXArray built with `CXString = int`) **[obs]**.

### Simple accessors [obs]
- GET(i) / GET(x,y): handler 0x10007e20 -> code byte, zero-extended, returned as INTEGER.
- SET(i,v) / SET(x,y,v): handler 0x10006c90 -> `code[...] = v & 0xff`.
- SETROW(y, v0, v1, ...): handler 0x10007ec0: for k=1..argc-1: setXY(k-1, y, arg[k]).
- GETCELLSNO(): 0x10003240 -> W*H. GETCELLSNO(c): 0x10003250 -> count of cells with code == (byte)c.
- GETCELLOFFSET(x,y): 0x100034b0 -> y*W + x (no clamping).
- GETCELLOFFSETATPOS(px,py): 0x100034d0 -> cx=(px-baseX)/cellW, cy=(py-baseY)/cellH
  (C truncating division); -1 if outside 0..W-1 / 0..H-1, else cy*W+cx.
- GETCELLPOSX(i) 0x10003420 / GETCELLPOSX(x,y) 0x100032f0 -> cell pixel x = baseX + x*cellW.
- GETCELLPOSY(i) 0x10003440 / GETCELLPOSY(x,y) 0x10003400 -> baseY + y*cellH.
- GETWIDTH 0x10003a30, GETHEIGHT 0x10003a40.
- SETGATE(l,t,r,b): 0x10002eb0 stores a CXRect at model+0x20 (+0x24 l, +0x28 t, +0x2c r, +0x30 b), in cell units.
- ISGATEEMPTY(): 0x10002d10 -> false if any code==2 (boulder) in x=l..r, y=t..b inclusive, else true.
- ISINGATE(x,y): 0x10002ed0 -> CXRect::IsInRect(x,y) (PIKLIB8); ISINGATE(i): 0x10002ef0 -> IsInRect(CXPoint(i%W, i/W)).
- CANHEROGOTO(i) 0x100039f0 / CANHEROGOTO(x,y) 0x100039d0: true iff
  `code[i] in {0,1,3,5,8,9}` and NOT ISINGATE(i).
- CLEAR 0x10003a50: every code = 0 and each cell record reset via 0x100041b0.

### Enemy movement [obs]
Directions: 0 = left (i-1), 1 = up (i-W), 2 = right (i+1), 3 = down (i+W),
anything else = stay (step function 0x10003d30, jump table 0x10003d70).
`enemyCanGo(i)` 0x10003ad0: `(code[i] == 0 or code[i] == 0x63) and not ISINGATE(i)`.
`canGoDir(i,d)` 0x10003b20 = enemyCanGo(step(i,d)).

CALCENEMYMOVEDIR(i, d) 0x10003c50 (handler 0x100081e0) returns the first of
- `(d+3)%4` via 0x10003b50 (0->3, 1->0, 3->2, 2->1),
- `d`,
- `(d+1)%4` via 0x10003ba0 (0->1, 1->2, 3->0, 2->3),
- `(d+2)%4` via 0x10003c00 (0->2, 1->3, 3->1, 2->0),
for which canGoDir holds, else 4. (A wall follower.) Note the turn helpers map
any value other than 0,1,3 like 2.
