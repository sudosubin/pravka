/** Parse a comma-separated codepoint spec ("U+0067,61,...") into codepoints. */
export function parseCps(spec: string): number[] {
  return spec
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => parseInt(t.replace(/^u\+/i, ""), 16));
}
