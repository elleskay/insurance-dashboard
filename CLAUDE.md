# CoverLens repo, Claude Code conventions

This repo ships CoverLens (`apps/insure`), a Singapore insurance policy checker, on top of the platform template (github.com/elleskay/platform). The platform layer (template apps, CDK scaffolds, workflows, docs) is kept in place and updated by pulling from the `template` remote. Follow these rules when working here.

## Structure

```
apps/
├── insure/                          # CoverLens, the real app. Next.js App Router.
│   ├── app/api/check/route.ts       # The one server route: guarded, paid checker call
│   ├── lib/insure/                  # checker-graph (LangGraph), checker (grounding), security, types
│   ├── specs/insure.yml             # The spec the app is built and gated against
│   └── tests/                       # Vitest unit + Playwright e2e (model mocked)
├── _template/                       # Platform overlay files for scaffolding a new app
└── _demo/                           # Platform demo app. CI builds this and synths
                                     # the _template CDK construct against it.

infra/
├── cdk/insure/                      # Live CDK app: InsureServerless stack,
│                                    # coverlens.soonkeong.dev on CloudFront
├── cdk/_template/                   # CDK package scaffold (copy + rename per app)
├── cdk/_setup/                      # One-time stack: GitHub OIDC + IAM deploy role
└── iam/cdk-deploy-policy.json       # Least-privilege IAM policy

packages/spec-test/                  # Spec-driven test runner + coverage gate + ESLint rule

scripts/verify-deploy.sh             # Platform smoke test for auth apps (deploy.yml uses
                                     # its own insure-specific smoke checks instead)

.github/workflows/
├── ci.yml                           # actionlint, typecheck, lint, unit tests, demo build, cdk synth
├── test.yml                         # spec coverage gate for apps/insure (build + unit + e2e)
├── security.yml                     # CodeQL, gitleaks, npm audit
└── deploy.yml                       # OIDC, preflight, spec gate, build, cdk deploy, smoke test
```

## Layering

- App business logic lives only in `apps/insure`.
- The platform layer (`apps/_template`, `apps/_demo`, `infra/cdk/_template`, `infra/cdk/_setup`, base configs, docs) mirrors the template repo. Keep changes there generic so template pulls stay clean; `infra/cdk/insure` is this app's own copy and may diverge deliberately (it already adds a configurable server timeout).
- No per-product secrets or env files committed anywhere.

## Stack conventions

- Next.js (App Router) + TypeScript strict
- Node 22 (workflows, `engines`, and the Lambda runtime)
- AWS Lambda + S3 + CloudFront via OpenNext, provisioned with AWS CDK
- GitHub Actions for CI/CD, deploys via OIDC on push to `main`
- Zod for input validation at route boundaries
- Conventional Commits
- CoverLens specifics: no database, no auth, no server-side storage; the only
  server route is `/api/check` (origin allow-list + rate limit, Anthropic via
  the Vercel AI SDK inside a LangGraph grounding loop)

## Style

- No em dashes anywhere (chat, code, docs, UI strings). Use comma, period, parens, or colon.
- No emojis in code or docs unless explicitly requested.
- Keep README and docs short. Lead with the answer.

## Security defaults

- Never commit secrets. `.env.local` is gitignored; production secrets live in GitHub Actions secrets and are baked into Lambda env vars at deploy.
- Security headers configured in `next.config.ts` (all apps).
- Input validation via Zod on every route/server action.
- Dependabot enabled, weekly cadence.
- The IAM policy in `infra/iam/cdk-deploy-policy.json` is the least-privilege baseline for the deploy role. Use it instead of `AdministratorAccess`.

## Known production gotchas (do not relearn)

All documented in `docs/DEPLOY.md`. Don't undo the fixes:

1. **Server Actions need `allowedOrigins`** with both CloudFront domain and Lambda Function URL host. Read from `ALLOWED_ORIGINS` env at build time.
2. **`AUTH_URL` env var must be set** (auth apps only) or NextAuth redirects to the raw Lambda URL.
3. **Sign-out must use the client-side `signOut` from `next-auth/react`**, not a server-action form.
4. **`open-next build` must run before `cdk bootstrap`/`deploy`** because the construct references `.open-next/` paths.
5. **CDK env vars are baked at synth time**, not deploy time.
6. **OpenNext image-opt function fails to install its deps on Windows**. Build on Linux/macOS/WSL.
7. **First deploy needs two passes** unless the stack sets `customDomain` (the insure stack does).
8. **Refactoring resources into a construct changes logical IDs.** Use `logicalIdOverrides` for in-place upgrades.
9. **CloudFront deletes take 10-15 minutes.** Not a bug.

## When adding a new app to this repo

1. Create the app at `apps/<name>/` (scaffold with `create-next-app`, overlay files from `apps/_template/`). Leave `apps/_demo/` in place for CI's self-test.
2. Copy `infra/cdk/_template/` to `infra/cdk/<name>/`, edit the stack id in `bin/app.ts` and the app path in `lib/web-stack.ts`.
3. Configure GitHub secrets/vars per `docs/DEPLOY.md`, push, verify the smoke test passes.
4. Copy `apps/_template/specs/`, `tests/`, `vitest.config.ts`, `playwright.config.ts` into the app and wire the spec-test ESLint rule into its flat config. See `docs/TESTING.md`.

## Spec-driven build protocol (mandatory)

Every app on this platform is built from a spec and tested against that spec. The full system is documented in `docs/TESTING.md`. `apps/insure` is fully covered: every requirement in `specs/insure.yml` has a passing `specTest()`, and `test.yml` gates on 100% coverage.

**When the user gives you a brief for a new feature inside an existing app:**

1. Add the new requirements to the app's `specs/<app>.yml` first. Do not extend code without a spec entry to point at.
2. Write the `specTest('<ID>', ...)` and the implementation **in the same turn**. Tests use `@platform/spec-test/playwright` for ui/functional/security/a11y and `@platform/spec-test/vitest` for data.
3. **If the feature is user-facing**, write at least one journey-level e2e that traverses the full path, not only isolated component-level assertions. This catches the decomposed-journey trap where individual pieces are green but the chain is broken.
4. Run `npm run test:spec` in the app. The work is not "done" until the gate exits 0 (100% coverage, no failing tests, no category mismatches).

**When the user gives you a brief for a bug fix:**

1. If the bug points to a missing or wrong requirement in the spec, fix the spec first (or add the missing requirement).
2. Write a failing `specTest()` that captures the bug. Confirm it fails on current code.
3. Fix the code. Confirm the `specTest()` passes and the gate stays green.

**What this prevents:**

- Shipping an app and only finding out at verification time that flows are broken. The gate refuses to deploy if any requirement is uncovered or its test is red.
- "I'll write tests later." There is no later. Tests and code ship together or not at all.
- Test-as-checkbox without assertions. The ESLint rule fails lint on any `specTest()` body that contains zero `expect()` calls.

**What this does NOT prevent:**

- A wrong spec (requirement and test agree on the wrong behaviour). Spec correctness is on the human reviewer.
- New behavior that nobody added a spec entry for. Code review catches that.
- **Decomposed-journey gaps.** A feature whose spec is split across multiple IDs can hit 100% coverage while one link in the user chain is broken. Mitigation: every user-facing feature ships at least one journey-level e2e that traverses the full path. See `docs/TESTING.md` "Failure modes the gate does NOT catch" for the worked example.
