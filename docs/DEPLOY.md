# Deploy guide

Reference for deploying apps cloned from this platform. The `.github/workflows/deploy.yml` automates everything below; this doc explains what it does and the gotchas the workflow handles for you.

## One-time AWS setup

### CDK bootstrap

```bash
npx cdk bootstrap aws://<account-id>/<region>
```

You only need this once per account+region. Bootstrap provisions the CDK toolkit stack (S3 staging bucket, ECR repo for container assets, IAM roles).

### OIDC role for GitHub Actions

1. In AWS IAM, add `token.actions.githubusercontent.com` as an OIDC provider.
2. Create a role with this trust policy (replace the GitHub path):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:elleskay/my-app:*"
           }
         }
       }
     ]
   }
   ```

3. Attach the policy from `infra/iam/cdk-deploy-policy.json` to this role.
4. Add the role ARN to GitHub Actions secrets as `AWS_DEPLOY_ROLE_ARN`.

### GitHub Actions secrets and variables

Configured for this repo (CoverLens has no database or auth):

| Setting               | Type      | Value                                                        |
| --------------------- | --------- | ------------------------------------------------------------ |
| `AWS_DEPLOY_ROLE_ARN` | secret    | OIDC role ARN (from `infra/cdk/_setup`)                      |
| `ANTHROPIC_API_KEY`   | secret    | Model key for the `/api/check` checker                       |
| `AWS_REGION`          | variable  | e.g. `ap-southeast-1`                                        |
| `APP_URL`             | variable  | Your CloudFront URL or custom domain                         |
| `ALLOWED_ORIGINS`     | variable  | CloudFront host + custom domain, comma-separated             |
| `APP_DIR` / `CDK_DIR` | variables | Only if paths differ from `apps/insure` / `infra/cdk/insure` |
| `CHECKER_MODEL`       | variable  | Optional model override for the checker                      |

An app with auth and a database additionally needs `DATABASE_URL` (secret) and `AUTH_SECRET` (secret, `openssl rand -base64 32`).

### Optional (for the 5 wired helpers in apps/\_template)

All five helpers no-op cleanly without their env vars, so omit any you don't use yet.

| Setting                                               | Type              | Used by                                      |
| ----------------------------------------------------- | ----------------- | -------------------------------------------- |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`               | secret + variable | Sentry server + client                       |
| `SENTRY_AUTH_TOKEN`                                   | secret            | Sentry source map upload (release build)     |
| `NEXT_PUBLIC_POSTHOG_KEY`                             | variable          | PostHog analytics                            |
| `NEXT_PUBLIC_POSTHOG_HOST`                            | variable          | Optional; default `https://us.i.posthog.com` |
| `RESEND_API_KEY`                                      | secret            | `lib/email.ts`                               |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | secrets           | `lib/rate-limit.ts`                          |

## What the deploy does

`.github/workflows/deploy.yml` runs on push to `main` (skipping docs-only changes):

1. Preflight: skip everything cleanly if `AWS_DEPLOY_ROLE_ARN` is not configured (fresh forks, the template repo itself).
2. Gate: run the full spec suite (`npm run test:spec` in `apps/insure`), so a direct push to `main` cannot deploy code the gate has never passed.
3. Checkout, install Node 22, restore npm cache, `npm ci`.
4. Assume the OIDC role.
5. Build `@platform/spec-test` (its gitignored dist is needed for the app's type-checked build), then build the app with OpenNext (`npm run build:open-next` in `apps/insure/`).
6. Install CDK deps (`npm ci` in `infra/cdk/insure/`).
7. `cdk deploy --all` with `ANTHROPIC_API_KEY`, `CHECKER_MODEL`, `ALLOWED_ORIGINS` in the environment. CDK reads them at synth time and bakes them into the Lambda env.
8. Read the deployed URL from `cdk-outputs.json`.
9. Smoke-test the live URL: the page renders the app, `/api/check` rejects a GET, and the security headers are present. Fails the workflow on any miss.

A database-backed app restores the platform's migrate/seed steps (conditional `db/migrate.ts` and `db/seed-demo.ts` runs before the build) from the template repo's `deploy.yml`.

For an auth app, `scripts/verify-deploy.sh` is the fuller smoke test (health endpoint, login redirect, NextAuth surface, no Lambda-URL leak); this repo's inline smoke test replaces it because CoverLens is a public single page.

## Rollback

CDK does not auto-rollback on app-level failure. If a deploy ships broken code:

1. `git revert <bad-commit>` and push. The next deploy uses the previous CloudFormation state.
2. For data migrations, never run destructive operations in deploy. Use a separate one-off job with explicit approval.

## Gotchas baked into the platform

These all bit us in production. The platform encodes the fixes; do not undo them.

### 1. Server Actions reject CloudFront → Lambda forwarded requests

**Symptom:** Form submits hit "Invalid Server Actions request" because Next.js compares `x-forwarded-host` (Lambda URL) with `origin` (CloudFront).

**Fix:** `next.config.ts` reads `ALLOWED_ORIGINS` at build time and passes both hosts to `experimental.serverActions.allowedOrigins`. The pattern is in `apps/_template/next.config.ts`.

### 2. NextAuth redirects to the Lambda URL after login

**Symptom:** After login, browser URL becomes `https://xxx.lambda-url.<region>.on.aws/...` and CSS/static assets stop loading because S3 assets are only served via CloudFront.

**Fix:** Set `AUTH_URL` to the canonical CloudFront URL (or custom domain). The CDK construct sets this from the `AUTH_URL` prop. Set the GitHub variable `APP_URL` to your deployed URL.

### 3. Sign-out via server action fails to clear cookies

**Symptom:** Click sign out, page stays logged in. Lambda logs show 303 with `x-action-redirect` but no `Set-Cookie`.

**Fix:** Use `apps/_template/components/SignOutButton.tsx` which calls `signOut` from `next-auth/react`. That goes through `/api/auth/signout` which clears cookies correctly.

### 4. CDK env vars are baked at synth, not deploy

**Symptom:** You set `AUTH_URL` in `.env` file expecting Lambda to read it. Lambda has no `AUTH_URL` at runtime.

**Fix:** `cdk deploy` reads `process.env.*` when it synthesizes the stack. The CDK construct copies those into the Lambda's `environment`. Set env vars in the shell (or GitHub Actions `env:` block) that invokes `cdk deploy`.

### 5. OpenNext image-opt function won't build on Windows

**Symptom:** `ERROR Error: ENOENT: no such file or directory, mkdtemp 'C:\...\.open-next\image-optimization-functionXXXXXX'`.

**Fix:** Build on Linux/macOS/WSL. If you must build on Windows and your app uses no `next/image`, the deploy still works — the image function bundle is incomplete but never invoked.

### 6. `cdk bootstrap` fails if your stacks reference missing build assets

**Symptom:** `Cannot find asset at <path>/.open-next/assets`.

**Fix:** Run `open-next build` in `apps/web/` before any CDK command (including bootstrap), because `bin/app.ts` instantiates the stack on synth and the construct reads `.open-next/` paths.

### 7. First deploy needs two passes (or a custom domain)

**Symptom:** You don't know the CloudFront URL until after the first deploy completes. But the Lambda needs `AUTH_URL` set to that URL, and the Next.js build needs `ALLOWED_ORIGINS` to include it. Chicken and egg.

**Fix (cheap):** Two-pass deploy.

1. First pass: build with `ALLOWED_ORIGINS="*.cloudfront.net,*.lambda-url.<region>.on.aws"` (wildcards work for `allowedOrigins`). Deploy with `AUTH_URL="https://placeholder.cloudfront.net"`. The deploy succeeds; auth callbacks would fail.
2. Read the CloudFront URL from `cdk-outputs.json`.
3. Second pass: redeploy with `AUTH_URL=<real CloudFront URL>`. No rebuild needed if the only change is Lambda env vars.

**Fix (better):** Use a custom domain. Pass `customDomain` to `NextjsServerless`:

```ts
new NextjsServerless(this, "Web", {
  appPath,
  environment: { AUTH_URL: "https://armoury.example.com", ... },
  customDomain: {
    domainName: "armoury.example.com",
    certificateArn: "arn:aws:acm:us-east-1:...",
    hostedZoneId: "Z123...",
    hostedZoneName: "example.com",
  },
});
```

Now `AUTH_URL` is known up front. One-pass deploy.

### 8. Refactoring an existing stack into the construct changes the CloudFront URL

**Symptom:** You wrote raw CDK first, then refactored to use `NextjsServerless`. CDK plans REPLACE for CloudFront, S3, Lambda. Your URL changes and CloudFront takes 10-15 minutes to delete the old distribution.

**Fix:** Pass `logicalIdOverrides` to preserve CloudFormation logical IDs:

```ts
new NextjsServerless(this, "Web", {
  appPath,
  environment: { ... },
  logicalIdOverrides: {
    serverFunction: "ServerFunction6F3D7051",   // from the old template
    imageFunction: "ImageFunctionE28774B0",
    assetsBucket: "AssetsBucket5CB76180",
    distribution: "Distribution830FAC52",
  },
});
```

Find the existing IDs in your stack's `cdk synth` output (or in the AWS Console under CloudFormation, Resources tab) before the refactor. CDK then treats these as the same resources and updates in place.

If you're shipping a brand-new app, ignore this. Logical ID overrides only matter for in-place upgrades.

### 9. CloudFront deletes are slow

**Symptom:** `cdk deploy` blocks for 10-15 minutes after "UPDATE_COMPLETE" because CloudFormation is in `UPDATE_COMPLETE_CLEANUP_IN_PROGRESS`, removing the old CloudFront distribution.

**Fix:** Not a bug, just AWS reality. CloudFront delete drains edge caches globally. New resources are already live before the cleanup finishes; you can verify with the new URL while CloudFormation drags. Use `logicalIdOverrides` (gotcha #8) to avoid the replace entirely.

### 10. Prod database missing rows even though the deploy succeeded

**Symptom:** You add a new template / inventory item / lookup row to `db/seed.ts`, push, CI green, deploy lands. Prod still doesn't have the row. Manual `psql` shows the row genuinely isn't there.

**Cause:** `db/seed.ts` is the dev/CI fixture seed. It runs only in `apps/_template/.github/workflows/test.yml` against the Postgres service container, never in prod, because it's destructive (`db.delete(...)` everything before reseeding). Running it on prod would wipe user data.

**Fix:** Split the seed into two files. Keep `db/seed.ts` for the destructive dev/CI fixture. Add `db/seed-demo.ts` for prod-safe reference data: every row looked up by natural key (`email` for users, `name+agency` for teams, `externalRef` for inventory) and inserted only if missing. Wire it into `.github/workflows/deploy.yml` as a conditional step right after the migrate step. Reruns on every deploy are no-ops because every row has a stable lookup.

See `docs/variants/default-nextjs.md` "Seed strategy" for the full pattern (including `ensureX` helpers and the `DEMO_ANCHOR` constant for deterministic synthetic activity). Anchored to Rollback rule above ("never run destructive operations in deploy"): seed-demo respects that by design.

### 11. Every request hits Lambda; "Rate Exceeded" on low-concurrency accounts

**Symptom:** Pages intermittently return `{"Reason":"ConcurrentInvocationLimitExceeded","message":"Rate Exceeded"}`, especially on a fresh AWS account (default Lambda concurrency can be as low as 10). A single page load can fan out several invocations because Next.js prefetches linked routes.

**Cause:** The construct's default CloudFront behavior uses `CACHING_DISABLED`, so the HTML/RSC responses are never cached at the edge. Every visit and every prefetch goes to the server Lambda. That is the safe default for auth/SSR apps (never cache a personalized response) but wasteful and fragile for static/SSG-heavy apps.

**Fix:** Two levers, use either or both.

1. App level: set `prefetch={false}` on `next/link` to stop the prefetch fan-out (cheapest mitigation).
2. Construct level: for a content/SSG app, pass `defaultCachePolicy` to `NextjsServerless` with a policy that honours origin `Cache-Control` (minTtl 0), so cacheable pages cache at CloudFront while dynamic routes (which Next marks `no-store`) stay uncached. See the `defaultCachePolicy` prop docs in `NextjsServerless.ts`.
3. Or request a Lambda concurrency limit increase for the account.

## Environments

Default: `production`. Add `staging` by:

1. Creating a separate GitHub environment with its own secrets/vars (different `APP_URL`, `DATABASE_URL`, etc).
2. Choosing it via `workflow_dispatch` from the Actions tab, or adding a separate workflow that triggers on a `staging` branch.

For real multi-environment, deploy each to a separate AWS account.

## Cost expectations

For a typical portfolio app with negligible traffic:

| Resource                                                            | Monthly |
| ------------------------------------------------------------------- | ------- |
| Lambda invocations + duration (Free Tier covers 1M req + 400k GB-s) | $0      |
| S3 storage (~50 MB) + GET requests                                  | <$0.10  |
| CloudFront transfer (Free Tier covers 1TB)                          | $0      |
| CloudWatch Logs                                                     | ~$0.50  |
| **Total realistic idle**                                            | **<$1** |

At 100k requests/day you're still well within Free Tier. The Lambda + CloudFront pattern is genuinely cheap at low scale.
