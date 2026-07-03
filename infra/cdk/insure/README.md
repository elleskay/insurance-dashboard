# CoverLens CDK app

Deploys `apps/insure` to AWS as Lambda + S3 + CloudFront via the `NextjsServerless` construct, served at [coverlens.soonkeong.dev](https://coverlens.soonkeong.dev).

One stack: `InsureServerless` (see `bin/app.ts`). The custom domain and its ACM certificate (us-east-1) are set in `lib/web-stack.ts`; DNS is a CNAME on the external provider pointing at the CloudFront distribution.

## How it deploys

Push to `main` runs `.github/workflows/deploy.yml`: OIDC-assume the deploy role, build the app with OpenNext, `cdk deploy` from this directory, then smoke-test the deployed URL. No long-lived AWS keys.

Env vars are baked into the Lambda at synth time:

| Var                 | Required   | Purpose                                                         |
| ------------------- | ---------- | --------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | yes        | The checker's model calls. Without it `/api/check` returns 503. |
| `CHECKER_MODEL`     | no         | Model id for the drafting node (defaults in code).              |
| `ALLOWED_ORIGINS`   | production | Origin allow-list for the paid `/api/check` route.              |

## Manual deploy

```bash
# Build the app with OpenNext first (Linux/macOS/WSL; the image-opt bundle
# fails to assemble on Windows)
cd ../../../apps/insure && npm run build:open-next

# Deploy (CDK bootstrap is a one-time per account+region step)
cd ../../infra/cdk/insure
npm install
ANTHROPIC_API_KEY=... ALLOWED_ORIGINS=... npx cdk deploy --all
```

## What's inside

- `bin/app.ts` — CDK entry point, instantiates the `InsureServerless` stack
- `lib/web-stack.ts` — the deploy unit (app path, Lambda env, custom domain)
- `lib/constructs/NextjsServerless.ts` — the platform's reusable construct (this app's copy adds a configurable server timeout for the slow checker route)

The construct is copied from `infra/cdk/_template`, not imported, so this app pins its own version. See that directory's README for the scaffold docs.
