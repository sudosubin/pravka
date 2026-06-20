import type { Sample } from "@/features/compare/types.ts";

const OUTPUT_SCALE = 4;

// m_all_chars is the only font-free image sample (cropped from the public fsd.it specimen).
// Unicode symbol blocks are compared per-glyph from All_chars.png (see @/features/compare/blocks.ts).
export const SAMPLES: Sample[] = [
  {
    kind: "codepointGrid",
    id: "m_all_chars",
    originalUrl: "https://fsd.it/wp-content/uploads/m_all_chars.png",
    width: 769,
    height: 750,
    cpStart: 0x0020,
    cpEnd: 0x021f,
    cols: 16,
    cellW: 16,
    cellH: 18.67,
    gridX: 114,
    gridY: 96.6,
    fontSize: 16,
    glyphBaselineFromTop: 15,
    bg: "#ffffff",
    fg: "#000000",
    showRowLabel: true,
    rowLabelX: 55,
    rowLabelFontSize: 16,
    rowLabelStride: 1,
    skipCps: [{ start: 0x0080, end: 0x009f }],
    sectionGaps: [
      { beforeCp: 0x0100, pixels: 19.33 },
      { beforeCp: 0x0180, pixels: 19.33 },
    ],
    upscale: 2,
    outputScale: OUTPUT_SCALE,
    displayTitle:
      "Basic Latin + Latin-1 + Latin Extended, Mono variant (m_all_chars)",
  },
];
