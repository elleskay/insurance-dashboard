/**
 * Lightweight, dependency-free abuse guards for the public /api/check route.
 *
 * The route fires paid model calls, so it needs some protection against being
 * looped by a scraper. These are deliberately simple:
 *
 *  - Origin guard: when ALLOWED_ORIGINS is configured (production), only
 *    requests carrying one of those origins are served. Unconfigured (local
 *    dev, tests) it allows everything, mirroring the platform's no-op pattern.
 *  - Rate guard: a best-effort in-memory sliding window per client. It only
 *    sees one Lambda instance, so it is not a hard limit, but it blunts a
 *    single client hammering a warm instance.
 *
 * For a hard, multi-instance limit, wire the platform Upstash helper
 * (apps/_template/lib/rate-limit.ts) and set the UPSTASH_* env vars.
 */

/** Parse the configured allow-list, or null when origin checks are off. */
export function configuredOrigins(): string[] | null {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * True when the request origin is permitted. With no configured allow-list
 * (local dev) everything is allowed; with one, a matching Origin is required,
 * so a cross-site call or a bare script with no Origin is rejected.
 */
export function isOriginAllowed(
  origin: string | null,
  allowed: string[] | null,
): boolean {
  if (allowed === null) return true;
  if (!origin) return false;
  return allowed.includes(origin);
}

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/**
 * Best-effort per-identifier sliding-window check. Returns true when the client
 * is under budget, false once it has spent RATE_LIMIT requests in the window.
 * `now` is injectable so the logic is unit-testable.
 */
export function rateOk(
  id: string,
  now: number,
  limit: number = RATE_LIMIT,
  windowMs: number = RATE_WINDOW_MS,
): boolean {
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(id, recent);
    return false;
  }
  recent.push(now);
  hits.set(id, recent);
  return true;
}

/** Identify the client from proxy headers, falling back to a shared bucket. */
export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}
