type Bucket = { count: number; resetAt: number };
const globalForRateLimit = globalThis as typeof globalThis & { awgRateLimitBuckets?: Map<string, Bucket> };
const buckets = globalForRateLimit.awgRateLimitBuckets ?? new Map<string, Bucket>();
if (process.env.NODE_ENV !== "production") globalForRateLimit.awgRateLimitBuckets = buckets;

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    current.count += 1;
    if (current.count > limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  if (buckets.size > 10_000) for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  return { allowed: true, retryAfterSeconds: 0 };
}
