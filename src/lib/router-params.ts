/**
 * Helpers for passing string data through expo-router route params safely.
 *
 * expo-router (SDK 57) decodes a route param value TWICE on the way to
 * useLocalSearchParams: once when the URL query string is parsed and again
 * inside the hook. A value containing a literal `%XX` sequence (e.g. a song
 * title like "50%25 Off", or a JSON draft whose text contains "%41") is
 * therefore corrupted by the extra decode. Pre-encoding the value once with
 * encodeURIComponent exactly cancels that extra decode, so the receiver reads
 * back the original string via `readParam`.
 */

/** Encode a value for a route param so it round-trips without corruption. */
export function packParam(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Read a packed param back. The router's own decode already restores the
 * original string, so this only normalizes the string | string[] | undefined
 * shape that useLocalSearchParams returns.
 */
export function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
