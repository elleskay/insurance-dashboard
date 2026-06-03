import { test, expect } from "@platform/spec-test/vitest";
import { isOriginAllowed, rateOk } from "@/lib/insure/security";

test("[INSURE-SEC-003] The checker route guards against cross-origin and rapid-fire abuse", () => {
  const allowed = ["https://coverlens.example"];

  // Origin guard: same-origin passes, cross-origin and bare (no Origin) fail.
  expect(isOriginAllowed("https://coverlens.example", allowed)).toBe(true);
  expect(isOriginAllowed("https://evil.example", allowed)).toBe(false);
  expect(isOriginAllowed(null, allowed)).toBe(false);
  // Unconfigured (local dev / tests): allow everything.
  expect(isOriginAllowed(null, null)).toBe(true);

  // Rate guard: the first N in the window pass, the next is refused, and the
  // budget frees up once the window has elapsed.
  const id = "1.2.3.4";
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    expect(rateOk(id, t0 + i, 3, 60_000)).toBe(true);
  }
  expect(rateOk(id, t0 + 4, 3, 60_000)).toBe(false);
  expect(rateOk(id, t0 + 61_000, 3, 60_000)).toBe(true);
});
