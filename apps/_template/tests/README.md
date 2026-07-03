# Spec-driven testing

This app is tested against a YAML spec at `specs/<app>.yml`. Every requirement must have a passing `specTest()` call with at least one `expect()`. CI fails the deploy if coverage is below 100%.

## Files

- `specs/<app>.yml` — requirement list (zod-validated)
- `tests/unit/*.spec.ts` — Vitest tests for pure logic (category: `data`)
- `tests/e2e/*.spec.ts` — Playwright tests for UI, auth, flows (categories: `ui`, `security`, `functional`, `a11y`)
- `vitest.config.ts` — Vitest setup
- `playwright.config.ts` — Playwright setup; uses `PLAYWRIGHT_BASE_URL` if set, else spawns `npm run start`

## Scripts (merge into your `package.json`)

```jsonc
{
  "scripts": {
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "test:spec": "npm run test:unit && npm run test:e2e && npm run test:coverage",
    "test:coverage": "spec-coverage --spec specs/$npm_package_name.yml --coverage .spec-coverage/results.jsonl --out spec-coverage.md",
  },
}
```

Replace `$npm_package_name.yml` with your actual app spec filename if it differs.

## Dependencies to add

```
npm i -D vitest @playwright/test @platform/spec-test
npx playwright install --with-deps chromium
```

## ESLint config snippet

```js
// eslint.config.mjs
import { eslintPlugin as specTest } from "@platform/spec-test";

export default [
  {
    files: ["tests/**/*.ts"],
    plugins: { "spec-test": specTest },
    rules: { "spec-test/require-expect-in-spec-test": "error" },
  },
];
```

## Workflow

When you give the agent a brief for a new feature or app:

1. Agent writes/extends `specs/<app>.yml` with new requirements (each with a unique ID)
2. Agent writes a `specTest('<ID>', ...)` per requirement **in the same turn as the implementation**
3. Tests are run continuously; the agent does not claim "done" until `npm run test:spec` is green
4. CI re-runs `test:spec` on every push; a 0% → 100% coverage diff is required for merge

This means you never have to prompt "did you check it works." If a requirement isn't covered, CI blocks merge. If the agent forgets to add a spec entry for a new behavior, code review catches it.
