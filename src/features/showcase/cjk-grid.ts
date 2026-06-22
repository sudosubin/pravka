import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import {
  isEastAsianWide,
  setupFonts,
} from "@/features/showcase/canvas-text.ts";
import { buildFontCacheDir } from "@/shared/build/build.ts";
import { BASE_RECIPE, PATHS } from "@/shared/paths.ts";
import { VISUAL_PNG } from "@/shared/util/image.ts";

export interface CjkGridOpts {
  out?: string;
  size?: number;
  fontDir?: string;
}

/**
 * CJK grid regression image: checks EAW 2:1 cell allocation (UAX #11) by drawing each test char on a
 * 0.5em grid and flagging cells off the expected 1×/2× half-em by >2%.
 */
export async function renderCjkGrid(opts: CjkGridOpts = {}): Promise<string> {
  // Local-only regression artifact (dist/ is gitignored), not a committed doc asset.
  const outPath = opts.out ?? PATHS.cjkGridPng;
  const SIZE = opts.size ?? 28;
  const fontDir = opts.fontDir ?? buildFontCacheDir(BASE_RECIPE);
  const HALF = SIZE / 2;

  await setupFonts(fontDir);

  const GROUPS: {
    label: string;
    chars: string;
    expectedCells: number;
  }[] = [
    {
      label: "Latin (Pravka, 0.5em)",
      chars: "ABCDabcd0123!@#$",
      expectedCells: 1,
    },
    {
      label: "Hiragana (Source Han Mono, 1em)",
      chars: "あいうえおかきくけこ",
      expectedCells: 2,
    },
    {
      label: "Katakana (Source Han Mono, 1em)",
      chars: "アイウエオカキクケコ",
      expectedCells: 2,
    },
    {
      label: "CJK Ideographs (1em)",
      chars: "中日本語文字漢字設定読",
      expectedCells: 2,
    },
    {
      label: "Chinese (1em)",
      chars: "从文件加载配置程序代码",
      expectedCells: 2,
    },
    {
      label: "Korean Hangul (Source Han Mono, 1em)",
      chars: "가나다라마바사아자차",
      expectedCells: 2,
    },
    {
      label: "Fullwidth Latin (1em)",
      chars: "ＡＢＣＤ１２３４５６",
      expectedCells: 2,
    },
  ];

  const PAD = 12;
  const LABEL_H = 14;
  const ROW_H = SIZE + LABEL_H + 8;
  const MAX_CHARS = 16;
  const W = PAD * 2 + MAX_CHARS * HALF;
  const H = PAD * 2 + GROUPS.length * ROW_H + 28;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, 0, W, H);

  for (let col = 0; col <= MAX_CHARS * 2; col++) {
    const x = PAD + col * HALF;
    ctx.strokeStyle =
      col % 2 === 0 ? "rgba(100,100,180,0.35)" : "rgba(60,60,120,0.2)";
    ctx.lineWidth = col % 2 === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H - 28);
    ctx.stroke();
  }

  const FONT_MIXED = `${SIZE}px 'Pravka', 'Source Han Mono'`;
  const FONT_CJK = `600 ${SIZE}px 'Source Han Mono'`;
  const LANG_CJK = "ko";
  const FONT_LABEL = "10px monospace";
  const TOL = 0.02;

  GROUPS.forEach((g, gi) => {
    const rowY = PAD + gi * ROW_H;
    const baseline = rowY + LABEL_H + SIZE * 0.82;
    const expectedW = HALF * g.expectedCells;

    ctx.font = FONT_LABEL;
    ctx.fillStyle = "#6c7086";
    ctx.fillText(g.label, PAD, rowY + 10);

    ctx.font = FONT_MIXED;
    let x = PAD;
    let allOk = true;
    for (const ch of [...g.chars].slice(0, MAX_CHARS)) {
      const cp = ch.codePointAt(0) ?? 0;
      const useCjkFont = isEastAsianWide(cp);
      ctx.font = useCjkFont ? FONT_CJK : FONT_MIXED;
      ctx.lang = useCjkFont ? LANG_CJK : "inherit";
      const rawFontW = ctx.measureText(ch).width;
      const ok = Math.abs(rawFontW - expectedW) / expectedW <= TOL;
      if (!ok) allOk = false;

      ctx.fillStyle = ok ? "rgba(60,180,80,0.1)" : "rgba(220,60,60,0.18)";
      ctx.fillRect(x, rowY + LABEL_H, expectedW, SIZE + 2);

      ctx.strokeStyle = ok ? "#2a5a2a" : "#7a2020";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, rowY + LABEL_H + 0.5, expectedW - 1, SIZE + 1);

      if (isEastAsianWide(cp) && Math.abs(rawFontW - expectedW) > 0.5) {
        ctx.fillStyle = "rgba(255,180,40,0.5)";
        ctx.fillRect(x, rowY + LABEL_H + SIZE + 2, rawFontW, 2);
      }

      ctx.fillStyle = ok ? "#cdd6f4" : "#ffaaaa";
      ctx.font = useCjkFont ? FONT_CJK : FONT_MIXED;
      ctx.lang = useCjkFont ? LANG_CJK : "inherit";
      ctx.fillText(ch, x, baseline);

      x += expectedW;
    }

    const sample = g.chars[0] ?? "A";
    const sampleCp = sample.codePointAt(0) ?? 0;
    const sampleUsesCjkFont = isEastAsianWide(sampleCp);
    ctx.font = sampleUsesCjkFont ? FONT_CJK : FONT_MIXED;
    ctx.lang = sampleUsesCjkFont ? LANG_CJK : "inherit";
    const ratio = ctx.measureText(sample).width / HALF;
    const badge = allOk
      ? `✓ ${ratio.toFixed(3)}× (EAW)`
      : `✗ ${ratio.toFixed(3)}× (want ${g.expectedCells}.000×)`;
    ctx.font = "9px monospace";
    ctx.fillStyle = allOk ? "#4a8a4a" : "#cc4444";
    ctx.fillText(
      badge,
      PAD + MAX_CHARS * HALF + 6,
      rowY + LABEL_H + SIZE / 2 + 4,
    );
  });

  ctx.font = "9px monospace";
  const ly = H - 20;
  ctx.fillStyle = "rgba(60,180,80,0.8)";
  ctx.fillRect(PAD, ly, 14, 8);
  ctx.fillStyle = "#666";
  ctx.fillText("exact 2:1 grid (±2%)", PAD + 18, ly + 8);
  ctx.fillStyle = "rgba(220,60,60,0.8)";
  ctx.fillRect(PAD + 160, ly, 14, 8);
  ctx.fillStyle = "#666";
  ctx.fillText("misaligned", PAD + 178, ly + 8);
  ctx.fillStyle = "rgba(255,120,40,0.8)";
  ctx.fillRect(PAD + 270, ly, 14, 4);
  ctx.fillRect(PAD + 270, ly + 5, 14, 3);
  ctx.fillStyle = "rgba(60,140,255,0.8)";
  ctx.fillRect(PAD + 270, ly + 5, 14, 3);
  ctx.fillStyle = "#666";
  ctx.fillText("orange=actual  blue=expected", PAD + 288, ly + 8);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    await sharp(canvas.toBuffer("image/png")).png(VISUAL_PNG).toBuffer(),
  );
  console.log(`Grid regression → ${outPath}  (${W}×${H})`);
  return outPath;
}
