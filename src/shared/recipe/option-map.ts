import { existsSync, readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";

import { writeJson } from "@/shared/util/io.ts";

interface VariantsToml {
  prime?: Record<string, { sampler?: string }>;
  composite?: { ss08?: Record<string, unknown> };
}

interface LigationToml {
  simple?: Record<string, { samples?: string[] }>;
  composite?: Record<string, { samples?: string[] }>;
}

function strToCps(s: string, skipWhitespace = false): Set<number> {
  const out = new Set<number>();
  for (const ch of s) {
    if (skipWhitespace && /\s/.test(ch)) continue;
    out.add(ch.codePointAt(0)!);
  }
  return out;
}

// composite.ss08 nests like { tag, description, design: {prime: "selector", ...}, metricOverride: {...} }.
// Only string-valued leaves under .design correspond to prime names; numeric overrides are ignored.
function ss08PrimeNames(ss08: Record<string, unknown> | undefined): string[] {
  const names: string[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    for (const [k, sub] of Object.entries(v)) {
      if (typeof sub === "string") names.push(k);
      else visit(sub);
    }
  };
  visit(ss08);
  return names;
}

export function buildOptionMap(
  variantsTomlPath: string,
  ligationTomlPath: string,
  cachePath?: string,
): Map<string, Set<number>> {
  if (cachePath && existsSync(cachePath)) {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as Record<
      string,
      number[]
    >;
    return new Map(Object.entries(raw).map(([k, v]) => [k, new Set(v)]));
  }

  const variants = parseToml(
    readFileSync(variantsTomlPath, "utf-8"),
  ) as VariantsToml;
  const ligation = parseToml(
    readFileSync(ligationTomlPath, "utf-8"),
  ) as LigationToml;

  const mapping = new Map<string, Set<number>>();
  for (const [name, spec] of Object.entries(variants.prime ?? {})) {
    if (spec.sampler) mapping.set(name, strToCps(spec.sampler, true));
  }

  const ss08Cps = new Set<number>();
  for (const name of ss08PrimeNames(variants.composite?.ss08)) {
    const cps = mapping.get(name);
    if (cps) for (const cp of cps) ss08Cps.add(cp);
  }
  mapping.set("__ss08_inherit__", ss08Cps);

  for (const groups of [ligation.simple ?? {}, ligation.composite ?? {}]) {
    for (const [name, spec] of Object.entries(groups)) {
      const cps = new Set<number>();
      for (const s of spec.samples ?? [])
        for (const ch of s) cps.add(ch.codePointAt(0)!);
      mapping.set(`__lig__${name}`, cps);
    }
  }

  if (cachePath) {
    const obj: Record<string, number[]> = {};
    for (const [k, v] of mapping) obj[k] = [...v].sort((a, b) => a - b);
    writeJson(cachePath, obj);
  }

  return mapping;
}
