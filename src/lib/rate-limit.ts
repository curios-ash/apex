// Fixed-window, in-memory rate limiter for the public (anonymous) endpoints.
// Per-process state — on serverless each instance limits independently, which
// is acceptable for the free tools at launch volume; swap for a shared store
// (e.g. Upstash) when it matters.

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as { __apexRateLimit?: Map<string, Bucket> };
const buckets = (globalForRateLimit.__apexRateLimit ??= new Map<string, Bucket>());

// Sweep expired buckets lazily on writes so the map can't grow unbounded.
function sweep(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  existing.count += 1;
  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

// Test hook.
export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
