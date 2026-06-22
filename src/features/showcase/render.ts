import {
  blockLogicalHeight,
  type CanvasLine,
  type CanvasRenderOpts,
  measureFontMetrics,
  renderCanvasLines,
} from "@/features/showcase/canvas-text.ts";
import { plainTokens, tokenize } from "@/features/showcase/tokenize.ts";
import type {
  CodeSpecimen,
  ProseSpecimen,
  Specimen,
  SpecimenTheme,
  WeightSpecimen,
} from "@/features/showcase/types.ts";

export interface RenderResult {
  id: string;
  title: string;
  buffer: Buffer;
  width: number;
  height: number;
}

function fontSpec(
  fontSize: number,
  weight: number | string,
  style: string,
  hasCjk: boolean,
): string {
  const cjk = hasCjk ? ", 'Source Han Mono'" : "";
  return `${style === "italic" ? "italic " : ""}${weight} ${fontSize}px 'Pravka'${cjk}`;
}

function cjkFontSpec(fontSize: number): string {
  return `600 ${fontSize}px 'Source Han Mono'`;
}

function baseOpts(
  spec: {
    width: number;
    paddingX: number;
    paddingY: number;
    fontSize: number;
    leading: number;
  },
  theme: SpecimenTheme,
  hasCjk = false,
): CanvasRenderOpts {
  return {
    defaultFont: fontSpec(spec.fontSize, 400, "normal", hasCjk),
    cjkFont: hasCjk ? cjkFontSpec(spec.fontSize) : undefined,
    cjkLang: hasCjk ? "ko" : undefined,
    bg: theme.bg,
    width: spec.width,
    paddingX: spec.paddingX,
    paddingY: spec.paddingY,
    lineHeight: spec.leading,
    upscale: theme.upscale,
    outputScale: theme.outputScale,
  };
}

function hasCjk(text: string): boolean {
  return /[ᄀ-ᇿ　-鿿가-힯豈-﫿]/.test(text);
}

async function renderCode(
  spec: CodeSpecimen,
  theme: SpecimenTheme,
): Promise<RenderResult> {
  const cjk = spec.lines.some((l) => hasCjk(l.text));
  const lines: CanvasLine[] = spec.lines.map((l) => ({
    tokens:
      l.role === "comment"
        ? plainTokens(l.text, theme.comment)
        : l.text === ""
          ? [{ text: " ", color: theme.fg }]
          : tokenize(l.text, theme.syntax),
    advance: spec.leading,
  }));
  const opts = baseOpts(spec, theme, cjk);
  const logH = blockLogicalHeight(lines, spec.leading, spec.paddingY);
  const buffer = await renderCanvasLines(lines, opts);
  return {
    id: spec.id,
    title: spec.title,
    buffer,
    width: spec.width * theme.outputScale,
    height: logH * theme.outputScale,
  };
}

async function renderProse(
  spec: ProseSpecimen,
  theme: SpecimenTheme,
): Promise<RenderResult> {
  const lines: CanvasLine[] = spec.lines.map((text) => ({
    tokens: plainTokens(text, theme.fg),
    advance: spec.leading,
  }));
  const opts = baseOpts(spec, theme);
  const logH = blockLogicalHeight(lines, spec.leading, spec.paddingY);
  const buffer = await renderCanvasLines(lines, opts);
  return {
    id: spec.id,
    title: spec.title,
    buffer,
    width: spec.width * theme.outputScale,
    height: logH * theme.outputScale,
  };
}

async function renderWeights(
  spec: WeightSpecimen,
  theme: SpecimenTheme,
): Promise<RenderResult> {
  const lines: CanvasLine[] = [];
  for (const row of spec.weights) {
    const labelFont = fontSpec(
      spec.labelFontSize,
      row.weight,
      row.style,
      false,
    );
    const sampleFont = fontSpec(
      spec.sampleFontSize,
      row.weight,
      row.style,
      false,
    );
    lines.push({
      tokens: plainTokens(row.label, theme.comment),
      fontSpec: labelFont,
      advance: spec.labelLeading,
    });
    lines.push({
      tokens: plainTokens(spec.sampleText, theme.fg),
      fontSpec: sampleFont,
      advance: spec.sampleLeading,
    });
  }
  // Each weight group = labelLeading + sampleLeading. Place horizontal lines in the
  // gap below the sample text (between groups), measured from the group's top edge.
  const sampleFontStr = fontSpec(spec.sampleFontSize, 400, "normal", false);
  const { ascent: sampleAscent, descent: sampleDescent } =
    measureFontMetrics(sampleFontStr);
  const groupHeight = spec.labelLeading + spec.sampleLeading;
  const horizontalGridOffset =
    spec.labelLeading + (spec.sampleLeading + sampleAscent + sampleDescent) / 2;

  const opts: CanvasRenderOpts = {
    defaultFont: sampleFontStr,
    bg: theme.bg,
    width: spec.width,
    paddingX: spec.paddingX,
    paddingY: spec.paddingY,
    lineHeight: groupHeight,
    upscale: theme.upscale,
    outputScale: theme.outputScale,
    horizontalGridOffset,
  };
  const logH = blockLogicalHeight(lines, groupHeight, spec.paddingY);
  const buffer = await renderCanvasLines(lines, opts);
  return {
    id: spec.id,
    title: spec.title,
    buffer,
    width: spec.width * theme.outputScale,
    height: logH * theme.outputScale,
  };
}

export function renderSpecimen(
  spec: Specimen,
  _fontDir: string,
  theme: SpecimenTheme,
): Promise<RenderResult> {
  switch (spec.kind) {
    case "code":
      return renderCode(spec, theme);
    case "prose":
      return renderProse(spec, theme);
    case "weights":
      return renderWeights(spec, theme);
  }
}
