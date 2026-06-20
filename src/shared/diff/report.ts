import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { meanBy, sumBy } from "es-toolkit";

export interface ScoreData {
  composite?: number;
  pct_mismatch?: number;
  l2?: number;
  ssim?: number;
  ref_png?: string;
  cand_png?: string;
  overlay?: string;
  options?: Record<string, string | number | boolean>;
}

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pravka vs PragmataPro: glyph diff report</title>
<style>
  body { font-family: monospace; background: #1a1a1a; color: #e0e0e0; margin: 0; padding: 0; }
  .header { background: #222; padding: 12px 20px; position: sticky; top: 0; z-index: 10;
            border-bottom: 1px solid #444; }
  .header h1 { margin: 0 0 6px; font-size: 14px; color: #aaa; font-weight: normal; }
  .meta { font-size: 11px; color: #888; }
  .meta span { margin-right: 16px; }
  .controls { padding: 8px 20px; background: #1e1e1e; border-bottom: 1px solid #333;
              display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .controls label { font-size: 12px; color: #aaa; }
  .controls input, .controls select { background: #2a2a2a; border: 1px solid #444;
              color: #ddd; padding: 3px 6px; font-size: 12px; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #2a2a2a; padding: 6px 8px; text-align: left; position: sticky; top: 48px;
       border-bottom: 1px solid #444; color: #aaa; font-weight: normal; }
  td { padding: 4px 8px; border-bottom: 1px solid #2a2a2a; vertical-align: middle; }
  tr:hover td { background: #222; }
  .cp { color: #7ec8e3; font-weight: bold; min-width: 70px; }
  .name { color: #aaa; font-size: 11px; max-width: 180px; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap; }
  .char { font-size: 18px; color: #eee; text-align: center; min-width: 24px; }
  .png-cell { text-align: center; }
  .png-cell img { image-rendering: pixelated; width: 64px; height: 64px;
                  border: 1px solid #333; background: #fff; }
  .scores { font-size: 11px; color: #aaa; white-space: nowrap; }
  .score-bar { display: inline-block; height: 8px; background: #e07; border-radius: 2px;
               vertical-align: middle; min-width: 2px; }
  .composite { color: #f88; font-weight: bold; }
  .good { color: #8f8; }
  .options { font-size: 10px; color: #666; }
  .chip { display: inline-block; background: #2a2a2a; border: 1px solid #444;
          border-radius: 3px; padding: 1px 5px; margin: 1px; color: #9ab; }
  .section-header { background: #1e1e1e; padding: 10px 20px; border-top: 2px solid #444;
                    color: #888; font-size: 13px; }
  .gap-block { padding: 6px 20px; font-size: 11px; color: #666; border-bottom: 1px solid #222; }
  .gap-block strong { color: #888; }
  #show-all-btn { margin: 12px 20px; padding: 6px 14px; background: #2a2a2a;
                  border: 1px solid #555; color: #aaa; cursor: pointer; border-radius: 4px; }
  .hidden-row { display: none; }
</style>
</head>
<body>
<div class="header">
  <h1>Pravka vs PragmataPro: glyph diff report</h1>
  <div class="meta">
    <span>Build: <code>{{recipe_hash}}</code></span>
    <span>Font: <code>{{font_hash}}</code></span>
    <span>Glyphs: {{total_glyphs}}</span>
    <span>Mean composite: {{mean_composite}}</span>
    <span>Generated: {{timestamp}}</span>
  </div>
</div>
<div class="controls">
  <label>Block: <select id="block-filter"><option value="">All blocks</option>{{block_options}}</select></label>
  <label>Max composite: <input type="range" id="score-filter" min="0" max="100" value="100" style="width:120px">
    <span id="score-val">1.00</span></label>
  <label>Search: <input type="text" id="cp-search" placeholder="U+0067 or 'g'" style="width:120px"></label>
</div>
<table id="main-table">
<thead>
  <tr>
    <th>Codepoint</th>
    <th>Char</th>
    <th>PragmataPro</th>
    <th>Pravka</th>
    <th>Diff</th>
    <th>Scores</th>
    <th>Affected options</th>
  </tr>
</thead>
<tbody id="tbody">
{{rows}}
</tbody>
</table>
{{show_all_btn}}

<div class="section-header">Known Coverage Gap ({{gap_count}} codepoints in PragmataPro, missing in Pravka)</div>
{{gap_sections}}

<script>
(function() {
  var blockFilter = document.getElementById('block-filter');
  var scoreFilter = document.getElementById('score-filter');
  var scoreVal    = document.getElementById('score-val');
  var cpSearch    = document.getElementById('cp-search');
  var showAllBtn  = document.getElementById('show-all-btn');
  var rows = Array.from(document.querySelectorAll('#tbody tr'));

  function applyFilters() {
    var block = blockFilter.value;
    var maxScore = parseFloat(scoreFilter.value) / 100.0;
    var search = cpSearch.value.trim().toLowerCase();
    scoreVal.textContent = maxScore.toFixed(2);
    rows.forEach(function(r) {
      var rBlock = r.dataset.block || '';
      var rScore = parseFloat(r.dataset.composite || '0');
      var rCp    = (r.dataset.cp || '').toLowerCase();
      var rChar  = (r.dataset.char || '').toLowerCase();
      var blockOk  = !block || rBlock === block;
      var scoreOk  = rScore <= maxScore;
      var searchOk = !search || rCp.includes(search) || rChar.includes(search);
      r.style.display = (blockOk && scoreOk && searchOk) ? '' : 'none';
    });
  }
  blockFilter.addEventListener('change', applyFilters);
  scoreFilter.addEventListener('input',  applyFilters);
  cpSearch.addEventListener('input',     applyFilters);

  if (showAllBtn) {
    showAllBtn.addEventListener('click', function() {
      var hidden = document.querySelectorAll('.hidden-row');
      hidden.forEach(function(r) { r.classList.remove('hidden-row'); r.style.display = ''; });
      rows = Array.from(document.querySelectorAll('#tbody tr'));
      showAllBtn.style.display = 'none';
      applyFilters();
    });
  }
})();
</script>
</body>
</html>
`;

function b64File(path: string): string {
  return readFileSync(path).toString("base64");
}

function imgTag(path: string | undefined): string {
  if (!path || !existsSync(path)) {
    return '<img src="" style="opacity:0.2" title="missing">';
  }
  return `<img src="data:image/png;base64,${b64File(path)}">`;
}

function blockName(cp: number): string {
  const ranges: [number, number, string][] = [
    [0x0000, 0x007f, "Basic Latin"],
    [0x0080, 0x00ff, "Latin-1 Supplement"],
    [0x0100, 0x024f, "Latin Extended"],
    [0x0250, 0x02af, "IPA Extensions"],
    [0x0300, 0x036f, "Combining Diacriticals"],
    [0x0370, 0x03ff, "Greek and Coptic"],
    [0x0400, 0x04ff, "Cyrillic"],
    [0x0590, 0x05ff, "Hebrew"],
    [0x0600, 0x06ff, "Arabic"],
    [0x16a0, 0x16ff, "Runic"],
    [0x2000, 0x206f, "General Punctuation"],
    [0x2100, 0x214f, "Letterlike Symbols"],
    [0x2200, 0x22ff, "Mathematical Operators"],
    [0x2300, 0x23ff, "Misc Technical"],
    [0x2500, 0x257f, "Box Drawing"],
    [0x2580, 0x259f, "Block Elements"],
    [0x25a0, 0x25ff, "Geometric Shapes"],
    [0x2600, 0x27bf, "Symbols & Dingbats"],
    [0x2800, 0x28ff, "Braille"],
    [0xe000, 0xf8ff, "PUA"],
    [0x1d400, 0x1d7ff, "Math Alphanumeric"],
  ];
  for (const [start, end, name] of ranges) {
    if (cp >= start && cp <= end) return name;
  }
  return "Other";
}

function isControl(cp: number): boolean {
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true;
  if (cp >= 0xd800 && cp <= 0xdfff) return true;
  if (cp >= 0xe000 && cp <= 0xf8ff) return true;
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ] ?? c
    );
  });
}

export interface BuildReportOpts {
  scoresPath?: string;
  codepointsPath?: string;
  cacheDir: string;
  outDir: string;
  topN?: number;
  recipeHashStr?: string;
  fontHashStr?: string;
}

export function buildReport(opts: BuildReportOpts): string {
  const topN = opts.topN ?? 500;
  let scores: Record<string, ScoreData> = {};
  if (opts.scoresPath && existsSync(opts.scoresPath)) {
    scores = JSON.parse(readFileSync(opts.scoresPath, "utf-8"));
  }

  let gapByBlock: Record<string, { count: number; cps: number[] }> = {};
  if (opts.codepointsPath && existsSync(opts.codepointsPath)) {
    const cpData = JSON.parse(readFileSync(opts.codepointsPath, "utf-8")) as {
      gap_by_block?: Record<string, { count: number; cps: number[] }>;
    };
    gapByBlock = cpData.gap_by_block ?? {};
  }

  const scoredCps: [number, ScoreData][] = Object.entries(scores)
    .map(([cpHex, data]) => [parseInt(cpHex, 16), data] as [number, ScoreData])
    .sort((a, b) => (b[1].composite ?? 0) - (a[1].composite ?? 0));

  const blocksSeen = new Set<string>();
  for (const [cp] of scoredCps) blocksSeen.add(blockName(cp));
  const blockOptions = [...blocksSeen]
    .sort()
    .map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`)
    .join("\n");

  const meanComposite =
    scoredCps.length > 0 ? meanBy(scoredCps, ([, d]) => d.composite ?? 0) : 0;

  const now = new Date();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const rowsHtml: string[] = [];
  for (let i = 0; i < scoredCps.length; i++) {
    const [cp, data] = scoredCps[i]!;
    const hidden = i >= topN ? "hidden-row" : "";
    const block = blockName(cp);
    const composite = data.composite ?? 0;
    const pct = data.pct_mismatch ?? 0;
    const l2 = data.l2 ?? 0;
    const ssim = data.ssim ?? 1;
    const barW = Math.max(2, Math.round(composite * 120));
    const charDisplay = isControl(cp) ? "" : String.fromCodePoint(cp);
    const compositeColor = composite > 0.1 ? "composite" : "good";

    const chips = Object.entries(data.options ?? {})
      .map(
        ([k, v]) =>
          `<span class="chip">${escapeHtml(k)}=${escapeHtml(String(v))}</span>`,
      )
      .join(" ");

    rowsHtml.push(
      `<tr class="${hidden}" data-block="${escapeHtml(block)}" data-composite="${composite.toFixed(4)}" data-cp="u+${cp.toString(16).padStart(4, "0")}" data-char="${escapeHtml(charDisplay.toLowerCase())}">
  <td class="cp">U+${cp.toString(16).toUpperCase().padStart(4, "0")}</td>
  <td class="char">${escapeHtml(charDisplay)}</td>
  <td class="png-cell">${imgTag(data.ref_png)}</td>
  <td class="png-cell">${imgTag(data.cand_png)}</td>
  <td class="png-cell">${imgTag(data.overlay)}</td>
  <td class="scores">
    <span class="${compositeColor}">${composite.toFixed(4)}</span>
    <span class="score-bar" style="width:${barW}px"></span><br>
    <span style="color:#666">pct=${pct.toFixed(3)} l2=${l2.toFixed(3)} ssim=${ssim.toFixed(3)}</span>
  </td>
  <td class="options">${chips}</td>
</tr>`,
    );
  }

  const showAllBtn =
    scoredCps.length > topN
      ? `<button id="show-all-btn">Show all ${scoredCps.length.toLocaleString()} glyphs</button>`
      : "";

  const gapEntries = Object.entries(gapByBlock).sort(
    (a, b) => b[1].count - a[1].count,
  );
  const gapSectionsHtml = gapEntries
    .map(([name, info]) => {
      const sample = info.cps
        .slice(0, 20)
        .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`)
        .join(" ");
      const more = info.count > 20 ? "…" : "";
      return `<div class="gap-block"><strong>${escapeHtml(name)}</strong>: ${info.count} codepoints: <span style="color:#555">${sample}${more}</span></div>`;
    })
    .join("\n");

  const gapCount = sumBy(Object.values(gapByBlock), (v) => v.count);

  let html = TEMPLATE;
  const replacements: Record<string, string> = {
    "{{recipe_hash}}": opts.recipeHashStr || "n/a",
    "{{font_hash}}": opts.fontHashStr || "n/a",
    "{{total_glyphs}}": String(scoredCps.length),
    "{{mean_composite}}": meanComposite.toFixed(4),
    "{{timestamp}}": timestamp,
    "{{block_options}}": blockOptions,
    "{{rows}}": rowsHtml.join("\n"),
    "{{show_all_btn}}": showAllBtn,
    "{{gap_count}}": String(gapCount),
    "{{gap_sections}}": gapSectionsHtml,
  };
  for (const [k, v] of Object.entries(replacements)) {
    html = html.split(k).join(v);
  }

  mkdirSync(opts.outDir, { recursive: true });
  const outPath = join(opts.outDir, "index.html");
  writeFileSync(outPath, html);
  console.log(
    `Report written: ${outPath} (${html.length.toLocaleString()} bytes)`,
  );
  return outPath;
}
