import type {
  CodeSpecimen,
  ProseSpecimen,
  Specimen,
  SpecimenTheme,
  WeightSpecimen,
} from "@/features/showcase/types.ts";

export const THEME: SpecimenTheme = {
  bg: "#1e1e2e",
  fg: "#cdd6f4",
  comment: "#6c7086",
  syntax: {
    plain: "#cdd6f4",
    comment: "#6c7086",
    keyword: "#cba6f7",
    string: "#a6e3a1",
    number: "#fab387",
    type: "#89b4fa",
    operator: "#89dceb",
  },
  upscale: 2,
  outputScale: 2,
};

const CODE: CodeSpecimen = {
  kind: "code",
  id: "code-sample",
  title: "Code Sample",
  width: 720,
  paddingX: 28,
  paddingY: 24,
  fontSize: 15,
  leading: 24,
  lines: [
    {
      text: "// Pravka: Iosevka 34.4 tuned to PragmataPro",
      role: "comment",
    },
    {
      text: "// Axes: g a 0 1 l i q R @ &  ·  Regular Semibold Bold Black × Upright Italic",
      role: "comment",
    },
    { text: "" },
    { text: "const range = (lo: number, hi: number, step = 1): number[] =>" },
    {
      text: "  Array.from({ length: Math.ceil((hi - lo) / step) }, (_, k) => lo + k * step);",
    },
    { text: "" },
    {
      text: "const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);",
    },
    {
      text: "const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);",
    },
    { text: "" },
    {
      text: "console.log(range(0, 20, 3));          // [0, 3, 6, 9, 12, 15, 18]",
      role: "comment",
    },
    {
      text: "console.log(gcd(48, 18), lcm(4, 6));   // 6  12",
      role: "comment",
    },
  ],
};

const WEIGHTS: WeightSpecimen = {
  kind: "weights",
  id: "weights",
  title: "Weights & Styles",
  width: 680,
  paddingX: 28,
  paddingY: 24,
  labelFontSize: 10,
  labelLeading: 14,
  sampleFontSize: 17,
  sampleLeading: 38,
  sampleText: "The quick brown fox jumps over the lazy dog, 0 1 @ &",
  weights: [
    { label: "Regular", weight: 400, style: "normal" },
    { label: "Semibold", weight: 600, style: "normal" },
    { label: "Bold", weight: 700, style: "normal" },
    { label: "Black", weight: 900, style: "normal" },
    { label: "Regular Italic", weight: 400, style: "italic" },
    { label: "Semibold Italic", weight: 600, style: "italic" },
    { label: "Bold Italic", weight: 700, style: "italic" },
    { label: "Black Italic", weight: 900, style: "italic" },
  ],
};

const PANGRAM: ProseSpecimen = {
  kind: "prose",
  id: "pangram",
  title: "Pangrams & Symbols",
  width: 680,
  paddingX: 28,
  paddingY: 28,
  fontSize: 18,
  leading: 32,
  lines: [
    "The quick brown fox jumps over the lazy dog.",
    "Sphinx of black quartz, judge my vow.",
    "Pack my box with five dozen liquor jugs.",
    "0 1 2 3 4 5 6 7 8 9  |  ! @ # $ % ^ & * ( ) _ +",
    "- = [ ] { } ; ' : \" , . / < > ?  =>  ===  !==  <=  >=",
  ],
};

const CJK: CodeSpecimen = {
  kind: "code",
  id: "cjk",
  title: "CJK Integration: Korean · Japanese · Chinese",
  // Wide (EAW) chars take 2 cells; Source Han Mono glyphs are 1em, matching that slot.
  width: 720,
  paddingX: 28,
  paddingY: 24,
  fontSize: 15,
  leading: 24,
  lines: [
    {
      text: "// 파일에서 설정을 로드합니다 (한국어 · Korean)",
      role: "comment",
    },
    { text: "// 設定ファイルを読み込む (日本語 · Japanese)", role: "comment" },
    { text: "// 从文件系统加载配置 (中文 · Chinese)", role: "comment" },
    { text: "" },
    { text: "interface Config {" },
    { text: '  host: string;   // "localhost" by default', role: "comment" },
    { text: "  port: number;   // 0-65535" },
    { text: "  tags: string[];" },
    { text: "}" },
    { text: "" },
    { text: "async function loadConfig(path: string): Promise<Config> {" },
    { text: '  const data = await fs.readFile(path, "utf-8");' },
    { text: "  return JSON.parse(data) as Config;" },
    { text: "}" },
  ],
};

export const SPECIMENS: Specimen[] = [CODE, WEIGHTS, PANGRAM, CJK];
