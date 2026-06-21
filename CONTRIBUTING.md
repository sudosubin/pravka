# Contributing to Pravka

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Bun](https://bun.sh) | Runs all TypeScript tooling |
| Node.js + npm | Compiles Iosevka (invoked by `src/shared/build/build.ts`) |

Both are required: Bun runs the tooling, npm compiles Iosevka.

**Nix:** This repo does not contain a `flake.nix`. The maintainer uses an external flake to provision the dev environment. Without it, install bun and Node.js directly.

**PragmataPro:** Not required. The reference is the public fsd.it `All_chars.png` specimen, cropped per glyph, used by both the comparison images and the variant search. It is downloaded and cached automatically; no PragmataPro font file is needed.

## Setup

```sh
# Download Iosevka 34.4.0 source to vendor/ and install its npm dependencies.
# Idempotent, safe to re-run. (Requires system `tar`.)
bun src/cli.ts build setup
```

`vendor/` is gitignored; this step must be run after every fresh clone.

All tooling lives in one CLI: `bun src/cli.ts <command>` (or `bun link` → `pravka`). `--help` works at every level — root (`pravka --help`), route (`pravka release --help`), and subcommand (`pravka release ttf --help`) — for the full command tree and per-command flags.

### Flag conventions

These flags recur across commands with consistent meaning:

| Flag | Meaning |
|------|---------|
| `--recipe <toml>` | Recipe TOML to build from (defaults to `current-best.toml`); triggers a build |
| `--font-dir <dir>` | Use a prebuilt font directory and skip the build |
| `--out <dir>` | Output directory (or path) for the command's artifacts |
| `--family plain\|nerd\|both` | Which font family/families to produce (default `both`) |
| `--formats ttf,otf,woff2` | Comma list of output formats (default `ttf,otf,woff2`) |

## Project layout

`dist/` and `vendor/` are gitignored scratch directories, recreated on demand; nothing under them is committed.

`dist/` — build outputs and caches:

| Path | Contents |
|------|----------|
| `dist/cache/work` | Transient working files during a build |
| `dist/cache/builds` | Intermediate build artifacts |
| `dist/fonts/<recipeHash>` | Content-addressed TTF cache, one dir per recipe hash. Each holds the built TTFs plus a `recipe.txt` mapping the opaque hash back to its source recipe |
| `dist/release` | Packaged release artifacts (TTF/OTF/WOFF2 + zips + SHA256SUMS) |
| `dist/reports/*` | Generated reports: `chars`, `compare`, `latest` (glyph diff), `codepoints.json`, `cjk-grid-regression.png` |

`vendor/` — downloaded third-party sources:

| Path | Contents |
|------|----------|
| `vendor/iosevka-<ver>` | Iosevka source checkout used to compile the font |
| `vendor/nerd-fonts` | Cached Nerd Fonts `FontPatcher` |
| `vendor/fsd` | fsd.it PragmataPro reference images |
| `vendor/noto-cjk` | Noto CJK fonts for CJK comparison |

## Building the font

```sh
bun src/cli.ts build font       # builds from src/shared/recipe/recipes/current-best.toml
bun src/cli.ts build baseline   # builds the untuned SS08 baseline (src/shared/recipe/recipes/base.toml)
```

Output TTFs are cached at `dist/fonts/<recipe-hash>/`. Subsequent calls with the same recipe are instant (cache hit).

## Running the full pipeline

```sh
bun src/cli.ts search           # greedy search over all 10 axes, 2 passes
bun src/cli.ts glyph report     # rebuild the HTML diff report from the last search scores
bun src/cli.ts showcase specimen  # regenerate docs/assets/*.png
```

## CLI tools

Everything runs through `bun src/cli.ts <command>` (or `pravka <command>` after `bun link`). Flags shown are the most common ones; run any command with `--help` for full usage.

| Command | Purpose |
|---------|---------|
| `pravka search --passes 2` | Greedy variant search |
| `pravka glyph render --font <ttf>` | Render glyphs to the snapshot cache |
| `pravka glyph diff --ref <ttf> --cand <ttf>` | Compute per-glyph scores |
| `pravka glyph report` | Build the HTML diff dashboard |
| `pravka glyph codepoints --ref <ttf>` | Coverage report |
| `pravka showcase specimen` | Generate `docs/assets/*.png` |
| `pravka compare report` | Local HTML report from cached snapshots (reference \| Pravka \| diff per sample + block) |
| `pravka compare chars --range <lo-hi>` | Per-glyph diff over a codepoint range vs `All_chars`, font-free |
| `pravka compare docs` | Rebuild the committed `docs/assets/compare` panels (pragmatapro·pravka·diff) |
| `pravka fetch all` | Download fsd.it reference images |
| `pravka release build` | One-shot: run all release stages → `dist/release/` + zips + SHA256SUMS |
| `pravka release ttf` | Stage: build each family's TTFs (plain = rename, nerd = FontForge patch) |
| `pravka release otf` | Stage: convert built TTFs to OTF (FontForge) |
| `pravka release woff2` | Stage: compress built TTFs to WOFF2 |
| `pravka release package` | Stage: zip each family directory and write SHA256SUMS |

The three `compare` subcommands serve different purposes: **`report`** renders a local HTML dashboard from the cached snapshots; **`chars`** scores a per-glyph diff over a codepoint range against `All_chars` with no font file required; **`docs`** rebuilds the comparison panels committed under `docs/assets/compare`.

`release build` runs every stage in order (ttf → otf/woff2 → package) after cleaning the output dir; the four stage subcommands let you rebuild incrementally.

**Release tooling:** TTF/WOFF2 need only Bun + the `wawoff2` dep. **OTF and the Nerd Font family additionally use [`fontforge`](https://fontforge.org)** (the Nerd patcher is a FontForge script), provided by the dev flake, so run inside `nix develop`. The Nerd Fonts `FontPatcher` is downloaded and cached under `vendor/nerd-fonts/`. Use `--family plain --formats ttf,woff2` to build without FontForge.

## Recipe and axis system

`src/shared/recipe/recipes/base.toml`: the Iosevka build plan inheriting SS08 with no variant overrides.

`src/shared/recipe/recipes/current-best.toml`: updated by the search; contains explicit `[variants.design]` overrides for each axis that improved the score.

`src/shared/recipe/recipes/variants/*.toml`: one file per axis, declaring:
- `prime`: the Iosevka design property name (e.g. `g`, `zero`, `capital-r`).
- `candidates`: variant values to evaluate. `"__remove__"` means delete the override and fall back to the SS08 default.

The search iterates axes in the order defined in `src/features/search/index.ts:AXIS_ORDER`. To add a new axis, add a `src/shared/recipe/recipes/variants/<name>.toml` and insert its name into `AXIS_ORDER`.

## Caveats

- **Each search candidate triggers a full Iosevka compile.** This can take 30-90 seconds per variant. The cache at `dist/fonts/<hash>/` makes repeated runs fast; do not delete it casually (gitignored under dist/).
- **`src/shared/recipe/recipes/current-best.toml` is overwritten in place** by the search. Its `.bak` is gitignored.
- The build target `ttf-unhinted::Iosevkapravka` (`src/shared/build/build.ts`) must match the plan key `Iosevkapravka` in the recipe TOML. Changing the `set` name in the recipe breaks the build.

## Tests

```sh
bun test
```

`tests/*.test.ts` covers the pure invariants (diff scorer, recipe round-trip, option-map) plus an end-to-end render → diff → report pipeline check. Tests needing the Iosevka source or fonts (`option-map`, the pipeline check) self-skip when those aren't present, so a bare checkout still passes.
