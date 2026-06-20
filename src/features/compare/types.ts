export interface SectionGap {
  beforeCp: number;
  pixels: number;
}

export interface GridSpec {
  kind: "codepointGrid";
  id: string;
  originalUrl?: string;
  width: number;
  height: number;
  bg: string;
  fg: string;
  cpStart: number;
  cpEnd: number;
  cols: number;
  cellW: number;
  cellH: number;
  gridX: number;
  gridY: number;
  fontSize: number;
  glyphBaselineFromTop: number;
  showRowLabel?: boolean;
  rowLabelX?: number;
  rowLabelFontSize?: number;
  rowLabelStride?: number;
  sectionGaps?: SectionGap[];
  /** Codepoints to skip entirely (e.g. C1 controls U+0080..U+009F not shown in chart). */
  skipCps?: { start: number; end: number }[];
  /** Internal supersample factor for sharper anti-aliasing. */
  upscale?: number;
  /** Final output dimensions multiplier applied to all spec coordinates. */
  outputScale?: number;
  displayTitle?: string;
}

export type Sample = GridSpec;
