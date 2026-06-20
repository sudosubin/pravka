#!/usr/bin/env bun
import { buildApplication, buildRouteMap, run } from "@stricli/core";

import { buildRoutes } from "@/commands/build.ts";
import { calibrateCmd } from "@/commands/calibrate.ts";
import { compareRoutes } from "@/commands/compare.ts";
import { fetchRoutes } from "@/commands/fetch.ts";
import { glyphRoutes } from "@/commands/glyph.ts";
import { releaseRoutes } from "@/commands/release.ts";
import { searchCmd } from "@/commands/search.ts";
import { showcaseRoutes } from "@/commands/showcase.ts";

const root = buildRouteMap({
  docs: {
    brief: "Pravka: Iosevka build, glyph comparison, and specimen tooling",
  },
  routes: {
    fetch: fetchRoutes,
    compare: compareRoutes,
    showcase: showcaseRoutes,
    glyph: glyphRoutes,
    search: searchCmd,
    build: buildRoutes,
    release: releaseRoutes,
    calibrate: calibrateCmd,
  },
});

const app = buildApplication(root, { name: "pravka" });

await run(app, process.argv.slice(2), {
  process: { stdout: process.stdout, stderr: process.stderr },
});
