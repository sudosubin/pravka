# Pravka vs PragmataPro: codepoint grid comparison

Per-block comparison against PragmataPro: **PragmataPro** reference · **Pravka** render ·
per-pixel **diff** (red = reference-only ink, blue = Pravka-only ink, black = both).

No PragmataPro font is used. The PragmataPro column is a plain horizontal slice of the **Mono** half
of the official fsd.it [`All_chars_Mono_comparison.png`](https://fsd.it/pragmatapro/All_chars_Mono_comparison.png)
specimen, a true uniform monospace grid, so columns line up exactly. Each block is the band of its
rows, cropped and only upscaled, never reconstructed glyph-by-glyph. The Pravka column is rendered to
that same uniform grid so the two overlay in the diff. The Basic Latin + Latin-1 + Latin Extended
overview is in the [README](README.md#pragmatapro-comparison); the remaining blocks follow.

> The README overview crops the fsd.it `m_all_chars` specimen; the blocks below use the Mono
> specimen. For a broader local-only per-glyph comparison (up to U+100620), run
> `pravka compare chars --range <lo-hi>` (font-free, from `All_chars.png`).

## General Punctuation (U+2000-U+206F)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/general-punctuation/pragmatapro.png) | ![](docs/assets/compare/blocks/general-punctuation/pravka.png) | ![](docs/assets/compare/blocks/general-punctuation/diff.png) |

## Superscripts and Subscripts (U+2070-U+209F)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/superscripts-subscripts/pragmatapro.png) | ![](docs/assets/compare/blocks/superscripts-subscripts/pravka.png) | ![](docs/assets/compare/blocks/superscripts-subscripts/diff.png) |

## Letterlike Symbols (U+2100-U+214F)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/letterlike-symbols/pragmatapro.png) | ![](docs/assets/compare/blocks/letterlike-symbols/pravka.png) | ![](docs/assets/compare/blocks/letterlike-symbols/diff.png) |

## Arrows (U+2190-U+21FF)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/arrows/pragmatapro.png) | ![](docs/assets/compare/blocks/arrows/pravka.png) | ![](docs/assets/compare/blocks/arrows/diff.png) |

## Mathematical Operators (U+2200-U+22FF)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/math-operators/pragmatapro.png) | ![](docs/assets/compare/blocks/math-operators/pravka.png) | ![](docs/assets/compare/blocks/math-operators/diff.png) |

## Box Drawing (U+2500-U+257F)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/box-drawing/pragmatapro.png) | ![](docs/assets/compare/blocks/box-drawing/pravka.png) | ![](docs/assets/compare/blocks/box-drawing/diff.png) |

## Block Elements (U+2580-U+259F)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/block-elements/pragmatapro.png) | ![](docs/assets/compare/blocks/block-elements/pravka.png) | ![](docs/assets/compare/blocks/block-elements/diff.png) |

## Geometric Shapes (U+25A0-U+25FF)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/geometric-shapes/pragmatapro.png) | ![](docs/assets/compare/blocks/geometric-shapes/pravka.png) | ![](docs/assets/compare/blocks/geometric-shapes/diff.png) |

## Miscellaneous Symbols (U+2600-U+26FF)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/misc-symbols/pragmatapro.png) | ![](docs/assets/compare/blocks/misc-symbols/pravka.png) | ![](docs/assets/compare/blocks/misc-symbols/diff.png) |

## Dingbats (U+2700-U+27BF)

| PragmataPro | Pravka | Diff |
|:---:|:---:|:---:|
| ![](docs/assets/compare/blocks/dingbats/pragmatapro.png) | ![](docs/assets/compare/blocks/dingbats/pravka.png) | ![](docs/assets/compare/blocks/dingbats/diff.png) |
