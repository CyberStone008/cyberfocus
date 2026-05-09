/**
 * Configures Node's native fetch to use the system HTTP/SOCKS proxy.
 * Call once at process start (before any fetch calls).
 *
 * Reads: HTTPS_PROXY | HTTP_PROXY | ALL_PROXY (in that order).
 * No-ops silently if no proxy is set.
 */
export async function setupProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY   ||
    process.env.ALL_PROXY    ||
    null;

  if (!proxyUrl) return;

  try {
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[proxy] Using ${proxyUrl}`);
  } catch (err) {
    console.warn(`[proxy] Failed to set proxy dispatcher: ${err.message}`);
  }
}
