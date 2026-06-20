import { buildCommand } from "@stricli/core";

import { calibrateCoverage } from "@/features/compare/index.ts";

export const calibrateCmd = buildCommand({
  docs: {
    brief:
      "Regenerate src/shared/reference/coverage.json from the All_chars specimen image",
  },
  parameters: { flags: {} },
  func: async () => {
    await calibrateCoverage();
  },
});
