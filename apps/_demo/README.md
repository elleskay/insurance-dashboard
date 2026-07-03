# apps/\_demo — platform demo app

Minimal Next.js app that uses every pattern the platform recommends:

- Auth.js v5 with Credentials provider + JWT sessions
- Edge-safe middleware (`auth.config.ts` + `middleware.ts`)
- Security headers + Server Actions `allowedOrigins` in `next.config.ts`
- Client-side `SignOutButton` (the only signout pattern that works on AWS serverless)
- `/api/health` for ALB/CloudFront target groups and smoke tests
- OpenNext config for AWS Lambda + S3 + CloudFront

## Why it exists in the platform repo

So the platform can self-test. Platform CI builds this app and synthesises the CDK stack from `infra/cdk/_template/`, proving the construct works end-to-end. Without this, breaking the construct in a refactor would slip through CI undetected.

## When you clone the platform for your real app

Leave this app in place so CI's self-test keeps working. Create your real app at
`apps/web/`, either from `create-next-app` + the `apps/_template/` overlay, or by
copying this demo (`cp -r apps/_demo apps/web`) and growing it. See `docs/SETUP.md`.

- `npm install` at repo root
- Edit `auth.ts` to swap the hardcoded `DEMO_USER` for your real provider
- Build & deploy via `npm run build:open-next` then `cdk deploy` in `infra/cdk/_template/` (after renaming)

## Local development

```bash
npm install
AUTH_SECRET="$(openssl rand -base64 32)" npm run dev
```

Sign in at http://localhost:3000 with `demo@platform.test` / `demo123`.
