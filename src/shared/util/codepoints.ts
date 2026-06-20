import { partition } from "es-toolkit";

import { loadFont } from "@/shared/util/font.ts";

export function getCmap(fontPath: string): Set<number> {
  const font = loadFont(fontPath);
  const map =
    (font.tables.cmap as { glyphIndexMap?: Record<string, number> })
      ?.glyphIndexMap ?? {};
  return new Set(Object.keys(map).map(Number));
}

export interface CoverageReport {
  ref: string;
  ref_count: number;
  cand?: string;
  cand_count?: number;
  intersection?: number[];
  intersection_count?: number;
  ref_only?: number[];
  ref_only_count?: number;
  cand_only?: number[];
  cand_only_count?: number;
  all_cps?: number[];
}

export function coverageReport(
  refPath: string,
  candPath?: string,
): CoverageReport {
  const refCps = getCmap(refPath);
  if (!candPath) {
    return {
      ref: refPath,
      ref_count: refCps.size,
      all_cps: [...refCps].sort((a, b) => a - b),
    };
  }
  const candCps = getCmap(candPath);
  const sortNum = (a: number, b: number) => a - b;
  const [intersection, refOnly] = partition([...refCps], (cp) =>
    candCps.has(cp),
  );
  const candOnly = [...candCps].filter((cp) => !refCps.has(cp));
  for (const arr of [intersection, refOnly, candOnly]) arr.sort(sortNum);
  return {
    ref: refPath,
    ref_count: refCps.size,
    cand: candPath,
    cand_count: candCps.size,
    intersection,
    intersection_count: intersection.length,
    ref_only: refOnly,
    ref_only_count: refOnly.length,
    cand_only: candOnly,
    cand_only_count: candOnly.length,
  };
}
