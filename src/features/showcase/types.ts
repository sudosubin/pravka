import type { SyntaxColors } from "@/features/showcase/tokenize.ts";

export type { SyntaxColors };

export interface SpecimenTheme {
  bg: string;
  fg: string;
  comment: string;
  syntax: SyntaxColors;
  upscale: number;
  outputScale: number;
}

export interface CodeLine {
  text: string;
  role?: "code" | "comment";
}

export interface CodeSpecimen {
  kind: "code";
  id: string;
  title: string;
  lines: CodeLine[];
  width: number;
  paddingX: number;
  paddingY: number;
  fontSize: number;
  leading: number;
}

export interface WeightRow {
  label: string;
  weight: number;
  style: "normal" | "italic";
}

export interface WeightSpecimen {
  kind: "weights";
  id: string;
  title: string;
  sampleText: string;
  weights: WeightRow[];
  width: number;
  paddingX: number;
  paddingY: number;
  labelFontSize: number;
  labelLeading: number;
  sampleFontSize: number;
  sampleLeading: number;
}

export interface ProseSpecimen {
  kind: "prose";
  id: string;
  title: string;
  lines: string[];
  width: number;
  paddingX: number;
  paddingY: number;
  fontSize: number;
  leading: number;
}

export type Specimen = CodeSpecimen | WeightSpecimen | ProseSpecimen;
