# ADR-002: Decode the original formats at runtime

- **Status:** Accepted (retroactive)
- **Date:** 2026-10-21
- **Evidence:** `3b75095` (CNV, PIK, LZO1X, RLE), `53468a4` (ANN/NVP, legacy LZW), `1781edf` (FNT, filters); README status "All 102 encrypted scripts, 707 images and 805 animations decode"; `tools/annformat.md`.
- **Supersedes:** none

## Context

The install contains proprietary 2004 containers. No maintained libraries exist for the CNV cipher, PIK images, NVP animations or the legacy LZW variant. The exact bytes matter: the engine's own decompression bugs, header quirks and one-off encodings are part of the behaviour that the scripts depend on.

## Decision

Implement the decoders in TypeScript under `src/formats/` and decode the original bytes at load time. This covers the CNV/DEF/SEQ text containers, PIK/IMG images, ANN/NVP animations, LZO1X, RLE, the legacy 12-byte-header LZW container and FNT fonts; WAV audio is decoded by WebAudio. Do not add a build-time asset pipeline or a pre-converted asset bundle.

## Consequences

- MUST consume every shipped file of a supported type to EOF. Trailing bytes in an ANN, an image whose decoded length does not match its header, or a control character in a CNV is a decoder bug.
- MUST keep `src/formats/` pure: `Uint8Array` in, data out, with no DOM, engine, network or filesystem imports (ADR-006).
- MUST add a test that walks every file of that type when a real install is present, plus a synthetic fixture for edge cases (ADR-015).
- MUST NOT commit decoded game data or generated assets, including under `dist/`.
- MUST prefer a port of the original algorithm over a generic library when the library changes the output. A dependency that cannot reproduce the observed bytes is not a substitute.
- Caching stays in memory for the session. Decoded audio may be released on scene change; decoded images stay tied to their object lifetime.

## Related files

- [`src/formats/cnv.ts`](../../src/formats/cnv.ts)
- [`src/formats/img.ts`](../../src/formats/img.ts)
- [`src/formats/ann.ts`](../../src/formats/ann.ts)
- [`src/formats/lzo.ts`](../../src/formats/lzo.ts)
- [`src/formats/lzw.ts`](../../src/formats/lzw.ts)
- [`src/formats/rle.ts`](../../src/formats/rle.ts)
- [`src/engine/fonts.ts`](../../src/engine/fonts.ts)
- [`test/formats.test.ts`](../../test/formats.test.ts)
- [`tools/annformat.md`](../../tools/annformat.md)
