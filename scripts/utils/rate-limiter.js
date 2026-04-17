export class RateLimiter {
  constructor(requestsPerSecond = 1) {
    this.interval = 1000 / requestsPerSecond;
    this.lastCall = 0;
  }

  async wait() {
    const now = Date.now();
    const waitMs = this.interval - (now - this.lastCall);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    this.lastCall = Date.now();
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
