import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractZip, writeZipFromDir } from "@/shared/util/zip.ts";

describe("zip utilities", () => {
  test("writes a zip and extracts it with stripped root", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "pravka-zip-test-"));
    const source = join(tmp, "source");
    await mkdir(join(source, "nested"), { recursive: true });
    await writeFile(join(source, "nested", "file.txt"), "hello");

    const zip = join(tmp, "out.zip");
    await writeZipFromDir(source, zip, { rootName: "root" });
    await extractZip(zip, join(tmp, "extract"), { stripComponents: 1 });

    expect(
      await readFile(join(tmp, "extract", "nested", "file.txt"), "utf-8"),
    ).toBe("hello");
  });
});
