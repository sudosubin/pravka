declare module "wawoff2" {
  /** Compress an sfnt (TTF/OTF) buffer to WOFF2. */
  export function compress(input: Uint8Array): Promise<Uint8Array>;
  /** Decompress a WOFF2 buffer back to sfnt. */
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
}
