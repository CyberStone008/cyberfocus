/**
 * Generate a URL-safe kebab-case slug from an English title.
 * Follows the spec: lowercase, replace whitespace with hyphens,
 * strip punctuation, collapse multiple hyphens.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/['"’"]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');
}
