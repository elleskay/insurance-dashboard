# Spec-driven testing

Every app on the platform is tested against a YAML spec. Every requirement in the spec must have a passing `specTest()` call with at least one `expect()`. CI gates merge and deploy on 100% spec coverage.

You should rarely need to manually verify an app works. If a spec entry doesn't have a passing test, CI fails. The gate catches structural regressions; for the user-journey class of bug (see "Failure modes the gate does NOT catch" below), a post-deploy walk-through is still the only safety net.

## How it fits together

```
specs/<app>.yml                  → declares requirements with IDs
tests/unit/*.spec.ts             → Vitest tests for pure logic
tests/e2e/*.spec.ts              → Playwright tests for UI/flows
@platform/spec-test (runner)     → records per-test passes/fails to JSONL
spec-coverage CLI                → diffs spec IDs vs covered IDs, exits 1 if any uncovered
ESLint rule                      → fails lint if any specTest body has zero expect() calls
CI workflow                      → runs all of the above, gates deploy
```

## Spec file format

```yaml
app: <appname> # required, kebab-case
version: 1 # required, integer
requirements:
  - id: <APP>-<DOMAIN>-<NNN> # required, unique, e.g. ARM-SUBMIT-004
    title: One-line summary # required, 5..200 chars
    category: functional # required: functional | ui | security | data | a11y
    severity: high # required: critical | high | medium | low
    given: Precondition # required, 3+ chars
    when: Action # required, 3+ chars
    then: Expected outcome # required, 3+ chars
    tags: [auth, middleware] # optional
    depends_on: [] # optional, must reference other valid IDs
    notes: Free-form notes # optional
```

The schema is enforced by zod. Unknown fields throw. Duplicate IDs throw. Invalid `depends_on` references throw.

## Categories drive test placement

- `data` requirements should be covered by **Vitest** unit tests (pure functions)
- `ui` / `functional` / `security` / `a11y` requirements should be covered by **Playwright** tests

If a `category: ui` requirement is only covered by a Vitest test, the coverage gate flags it as a category mismatch and fails. This prevents "I covered the requirement" while actually only testing the wrong layer.

## Writing tests

```ts
// tests/unit/score.spec.ts
import { specTest, expect } from "@platform/spec-test/vitest";

specTest(
  "ARM-MATH-001",
  "Score is round(ok / total * 100)",
  () => {
    expect(computeScore({ ok: 5, total: 6 })).toBe(83);
    expect(computeScore({ ok: 6, total: 6 })).toBe(100);
  },
  { category: "data" },
);
```

```ts
// tests/e2e/submit.spec.ts
import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "ARM-SUBMIT-004",
  "Dropdown renders combobox with options from item.options",
  async ({ page }) => {
    await loginAsOfficer(page);
    await page.goto(`/officer/submit/${TEMPLATE_ID}`);
    const combo = page.getByRole("combobox").first();
    await expect(combo).toBeVisible();
    await combo.click();
    await expect(page.getByRole("option")).toHaveCount(3);
    await expect(page.getByRole("option").nth(0)).toHaveText("Clean");
  },
  { category: "ui" },
);
```

The wrapper records `{id, status, category, file, durationMs}` to `.spec-coverage/results.jsonl` after every test.

## The ESLint rule

`@platform/spec-test/eslintPlugin` exports a rule `require-expect-in-spec-test`. Wire it into your app's flat config:

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

Without this rule, a test author could write a `specTest()` body that never asserts anything, and the spec ID would be marked "covered" because the test passed. The rule statically prevents that.

## Running locally

```bash
# Unit tests only
npm run test:unit

# E2E (auto-spawns next start if PLAYWRIGHT_BASE_URL not set)
npm run test:e2e

# Coverage gate (fails if <100%)
npm run test:coverage

# Everything
npm run test:spec
```

## CI workflow

Copy `apps/_template/.github/workflows/test.yml` into your app's `.github/workflows/`. It includes:

- Postgres 17 service container
- Migration + seed before tests
- Typecheck, lint (with the spec-test rule), build
- Unit + E2E + coverage gate
- Coverage report uploaded as artifact + posted as PR comment

Deploy must depend on this job (`needs: [spec]` in `deploy.yml`) so a failing spec gate blocks the deploy.

## Authoring workflow (agent + human)

When you give the agent a spec for a new feature or app:

1. Agent writes/extends `specs/<app>.yml` with the new requirement(s)
2. Agent writes the `specTest('<ID>', ...)` and the implementation **in the same turn**
3. Tests run continuously while the agent iterates
4. Agent does not claim "done" until `npm run test:spec` is green

You should rarely have to ask "did you check that this works." The build literally cannot complete without spec coverage. The one class of break that survives this gate is the **decomposed-journey trap** (see below): a feature whose pieces all have green tests but whose end-to-end path has a missing link. For user-facing features, asking the agent to demonstrate the journey in a single Playwright walk is still useful.

## Backfilling an existing app

For an app built before this system existed:

1. Reverse-engineer requirements from the running app + your brief into `specs/<app>.yml`
2. For each requirement, write a `specTest()`. Where a test fails on the live app, fix the bug.
3. Land the spec + tests + any bug fixes in the same PR
4. Once coverage hits 100%, enable the gate in `test.yml`

## Failure modes the gate catches

- Missing test for a spec entry → uncovered, exit 1
- Test exists but fails → failing, exit 1
- Test exists, passes, but has zero `expect()` calls → lint fails before tests run
- Test exists in wrong layer (e.g. `ui` requirement only covered by Vitest) → category mismatch, exit 1

## Failure modes the gate does NOT catch

- Spec written wrong (e.g. spec says score formula is wrong, test asserts the wrong formula, both agree, app ships with wrong formula). Spec correctness is on you. Code review on spec changes is the mitigation.
- Behavior in the app that isn't represented in the spec at all. No automated check for "did you add a feature without a spec entry?" Review discipline catches it.
- Flaky tests that pass intermittently. Standard Playwright/Vitest retries help; long-term, hunt and fix flakes.
- **Decomposed-journey gaps.** A user-facing feature spread across multiple spec IDs can be 100% covered while one link in the chain is broken. Real example from armoury: ARM-PHOTO-001..003 all passed (officer submit page renders file input for `kind === "photo"`, response stores the data URL, PDF renders it), but no admin could actually create a photo item because the builder dropdown was missing `<SelectItem value="photo">`. Coverage was 126/126 while the feature was unreachable end to end. **Mitigation:** every user-facing feature must have at least one journey-level e2e that traverses the full path (admin-creates → officer-uses → admin-sees-result), not just isolated component-level assertions. The spec gate confirms structure; the journey test confirms the structure connects.
