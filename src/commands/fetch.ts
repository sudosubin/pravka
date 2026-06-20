import { buildCommand, buildRouteMap } from "@stricli/core";

import { ensureSource, SOURCES, type Source } from "@/shared/source.ts";

async function fetchSource(source: Source, force: boolean): Promise<void> {
  const path = await ensureSource(source, { force });
  console.log(`${source.url}\n→ ${path}`);
}

const forceFlag = {
  force: { kind: "boolean", brief: "Re-download even if cached" },
} as const;

const mAllCharsCmd = buildCommand({
  docs: { brief: "Download fsd.it m_all_chars.png (Latin grid) → vendor/fsd" },
  parameters: { flags: forceFlag },
  func: (flags: { force: boolean }) =>
    fetchSource(SOURCES.mAllChars, flags.force),
});

const allCharsCmd = buildCommand({
  docs: { brief: "Download fsd.it All_chars.png (full chart) → vendor/fsd" },
  parameters: { flags: forceFlag },
  func: (flags: { force: boolean }) =>
    fetchSource(SOURCES.allChars, flags.force),
});

const allCmd = buildCommand({
  docs: { brief: "Download all fsd.it source images" },
  parameters: { flags: forceFlag },
  async func(flags: { force: boolean }) {
    for (const source of Object.values(SOURCES))
      await fetchSource(source, flags.force);
  },
});

export const fetchRoutes = buildRouteMap({
  docs: { brief: "Download fsd.it PragmataPro reference images" },
  routes: {
    "m-all-chars": mAllCharsCmd,
    "all-chars": allCharsCmd,
    all: allCmd,
  },
});
