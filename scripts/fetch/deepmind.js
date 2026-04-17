// DeepMind blog does not provide a public RSS feed.
// This fetcher gracefully degrades and returns an empty array.
// Re-enable when DeepMind provides an accessible feed.

export async function fetchDeepMind() {
  console.log('[deepmind] No accessible RSS feed. Skipping.');
  return [];
}
