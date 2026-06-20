import { relative } from "node:path";

import type { RenderResult } from "@/features/showcase/render.ts";

const STYLE = `
  body { font-family: -apple-system, monospace; background: #111; color: #ddd; margin: 0; padding: 20px; }
  h1 { font-size: 16px; color: #aaa; font-weight: normal; margin: 0 0 16px; }
  h3 { font-size: 13px; color: #ddd; margin: 28px 0 4px; font-weight: normal; }
  .dims { color: #555; font-size: 11px; margin-left: 6px; }
  .img-wrap { overflow-x: auto; padding: 4px 0; background: #0a0a0a; border: 1px solid #2a2a2a; }
  img { display: block; image-rendering: pixelated; width: 100%; height: auto; }
  .img-wrap.actual img { width: auto; height: auto; }
  .fit-toggle { display: inline-block; font-size: 11px; color: #5a8; cursor: pointer; margin-left: 12px; user-select: none; }
`.trim();

const SCRIPT = `
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('fit-toggle')) {
    const wrap = t.closest('section').querySelector('.img-wrap');
    wrap.classList.toggle('actual');
    t.textContent = wrap.classList.contains('actual') ? '[fit to width]' : '[show 1:1]';
  }
});
`.trim();

export interface GalleryItem extends RenderResult {
  pngPath: string;
}

function section(r: GalleryItem, outDir: string): string {
  const src = relative(outDir, r.pngPath);
  return `<section>
  <h3>${r.title} <span class="dims">${r.width}×${r.height}</span><span class="fit-toggle">[show 1:1]</span></h3>
  <div class="img-wrap"><img src="${src}" alt="${r.id}" loading="lazy"></div>
</section>`;
}

export function renderGalleryHtml(
  items: GalleryItem[],
  outDir: string,
): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Pravka: font specimen gallery</title>
<style>${STYLE}</style>
<script>${SCRIPT}</script>
<h1>Pravka: font specimen gallery</h1>
${items.map((r) => section(r, outDir)).join("\n")}`;
}
