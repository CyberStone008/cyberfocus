// Deterministic short id for shareable article URLs (/a/<shortId>).
// FNV-1a 32-bit hash → base36, padded to 6+ chars. Stable across builds,
// identical on server (route generateStaticParams) and client (ShareButton),
// so both compute the same id from a slug — the single source of truth.
export function shortId(input: string): string {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  const n = h >>> 0; // 0 .. 4294967295  → up to 7 base36 chars
  return n.toString(36).padStart(6, '0');
}
