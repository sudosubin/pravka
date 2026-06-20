import { relative } from "node:path";

export interface Panel {
  title: string;
  refPath: string;
  pravkaPath: string;
  diffPath: string;
}

const STYLE = `body { font-family: -apple-system, monospace; background: #111; color: #ddd; margin: 0; padding: 20px; }
h1 { font-size: 16px; color: #aaa; font-weight: normal; margin: 0 0 8px; }
h3 { font-size: 13px; color: #ddd; margin: 24px 0 4px; font-weight: normal; }
section { margin-bottom: 32px; }
.img-wrap { overflow: visible; padding: 4px 0; background: #0a0a0a; border: 1px solid #2a2a2a; }
img { display: block; image-rendering: pixelated; background: #1a1a1a; width: 100%; height: auto; }
.lead { font-size: 12px; color: #888; max-width: 900px; line-height: 1.55; }
.triple { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.triple figure { margin: 0; }
.triple figcaption { font-size: 10px; color: #666; margin-bottom: 2px; }`;

const LEAD = `Each row is a Unicode codepoint grid: left = PragmataPro reference (cropped from the
  public fsd.it specimen image, upscaled to match); middle = Pravka render; right = per-pixel diff
  (red = reference-only ink, blue = Pravka-only ink, black = both).`;

function section(p: Panel, outDir: string): string {
  const fig = (path: string, caption: string) =>
    `      <figure><figcaption>${caption}</figcaption><div class="img-wrap"><img src="${relative(outDir, path)}" alt="${p.title} ${caption}" loading="lazy"></div></figure>`;
  return `  <section>
    <h3>${p.title}</h3>
    <div class="triple">
${fig(p.refPath, "PragmataPro")}
${fig(p.pravkaPath, "Pravka")}
${fig(p.diffPath, "diff (red = ref-only, blue = pravka-only)")}
    </div>
  </section>`;
}

export function renderIndexHtml(panels: Panel[], outDir: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Pravka vs PragmataPro: codepoint grid comparison</title>
<style>${STYLE}</style>
<h1>Pravka vs PragmataPro: codepoint grid comparison</h1>
<p class="lead">${LEAD}</p>
${panels.map((p) => section(p, outDir)).join("\n")}`;
}
