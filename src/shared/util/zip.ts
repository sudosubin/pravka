import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  configure,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";

configure({ useWebWorkers: false });

function zipPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function stripComponents(path: string, count: number): string | null {
  const parts = zipPath(path).split("/").filter(Boolean);
  if (parts.length <= count) return null;
  return parts.slice(count).join("/");
}

function assertSafeZipPath(path: string): void {
  if (
    path === "" ||
    path.startsWith("/") ||
    path.split("/").some((part) => part === "..")
  ) {
    throw new Error(`Unsafe zip entry path: ${path}`);
  }
}

export async function extractZip(
  zipFile: string,
  outDir: string,
  opts: { stripComponents?: number } = {},
): Promise<void> {
  const reader = new ZipReader(new Uint8ArrayReader(await readFile(zipFile)));
  try {
    for (const entry of await reader.getEntries()) {
      const rawName = entry.filename;
      const name =
        opts.stripComponents && opts.stripComponents > 0
          ? stripComponents(rawName, opts.stripComponents)
          : zipPath(rawName);
      if (!name) continue;
      assertSafeZipPath(name);

      const dest = join(outDir, name);
      if (entry.directory) {
        await mkdir(dest, { recursive: true });
        continue;
      }

      await mkdir(dirname(dest), { recursive: true });
      await writeFile(
        dest,
        Buffer.from(await entry.getData(new Uint8ArrayWriter())),
      );
    }
  } finally {
    await reader.close();
  }
}

async function listFilesRec(dir: string): Promise<string[]> {
  const files = await Promise.all(
    (await readdir(dir, { withFileTypes: true })).map((e) => {
      const path = join(dir, e.name);
      return e.isDirectory() ? listFilesRec(path) : [path];
    }),
  );
  return files.flat().sort();
}

export async function writeZipFromDir(
  sourceDir: string,
  zipFile: string,
  opts: { rootName?: string } = {},
): Promise<void> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { bufferedWrite: true });
  const rootName = opts.rootName ?? sourceDir.split(/[\\/]/).at(-1);
  if (!rootName)
    throw new Error(`Cannot derive zip root name from ${sourceDir}`);

  try {
    for (const file of await listFilesRec(sourceDir)) {
      const name = zipPath(join(rootName, relative(sourceDir, file)));
      const fileStat = await stat(file);
      await writer.add(name, new Uint8ArrayReader(await readFile(file)), {
        lastModDate: fileStat.mtime,
      });
    }
    await writeFile(zipFile, Buffer.from(await writer.close()));
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}
