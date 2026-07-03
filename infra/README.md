# Infra

AWS CDK in TypeScript. What's here:

- `cdk/insure/` — the live CDK app for CoverLens (`apps/insure`), one `InsureServerless` stack. See its README.
- `cdk/_template/` — CDK package scaffold. Copy and rename per app; `cdk/insure/` was created this way.
- `cdk/_setup/` — one-time stack that provisions the GitHub Actions OIDC deploy role.
- `iam/` — pre-canned least-privilege IAM policy for the deploy role.

## Why no shared "base" stacks?

The serverless deploy (Lambda + S3 + CloudFront) needs no platform-wide AWS resources. Each app provisions its own. Sharing infra across apps adds coupling and surface area for no real gain at this scale.

If you ever need shared resources (a global WAF, a shared observability stack, a custom domain hosted zone), add them in this folder. Don't pre-create them.

## Per-app CDK structure

Each app gets its own copy of the scaffold, with the shared construct vendored in:

```
apps/insure/
├── ... the Next.js app ...
└── .open-next/                  # build output from `open-next build`

infra/cdk/insure/
├── bin/app.ts                   # stack id (CloudFormation stack name)
├── lib/web-stack.ts             # app path, Lambda env vars, custom domain
├── lib/constructs/NextjsServerless.ts   # vendored reusable construct
├── package.json, tsconfig.json, cdk.json
└── README.md
```

The stack itself reads as a few lines per app:

```ts
new NextjsServerless(this, "Web", {
  appPath: path.resolve(__dirname, "..", "..", "..", "..", "apps", "insure"),
  environment: {
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    CHECKER_MODEL: process.env.CHECKER_MODEL ?? "",
  },
  customDomain: { domainName: "coverlens.soonkeong.dev", certificateArn: "..." },
});
```

## Deploy

Push to `main` runs `.github/workflows/deploy.yml`: OIDC-assume the deploy role, OpenNext build, `cdk deploy`, smoke test. The role comes from `cdk/_setup/` with the policy in `iam/cdk-deploy-policy.json`.

See `docs/DEPLOY.md` for the full setup and the production gotchas the construct encodes.
