# CDK app scaffold

Full CDK package for deploying a Next.js + OpenNext app to AWS serverless. Copy this whole directory into your app and rename.

## Use

```bash
# From your cloned app repo, rename _template to your app name
cp -r infra/cdk/_template infra/cdk/<your-app>
rm -rf infra/cdk/_template
cd infra/cdk/<your-app>
npm install
```

Then edit:

- `bin/app.ts` — rename the stack id (e.g. `AppServerless` → `ArmouryServerless`)
- `lib/web-stack.ts` — confirm `appPath` resolves to your Next.js app directory
- Optionally enable `customDomain` to skip the two-pass deploy (see `lib/constructs/NextjsServerless.ts` JSDoc)

## Deploy

```bash
# Build the app with OpenNext first (see app's README)
cd ../../../apps/web && npm run build:open-next

# Bootstrap CDK once per AWS account/region
cd ../../infra/cdk/<your-app>
npx cdk bootstrap aws://<account>/<region>

# Deploy
DATABASE_URL=... AUTH_SECRET=... AUTH_URL=https://your-cf-url npx cdk deploy --all
```

## What's inside

- `bin/app.ts` — CDK app entry point
- `lib/web-stack.ts` — the deploy unit (one CloudFormation stack)
- `lib/constructs/NextjsServerless.ts` — reusable construct, ~200 lines that encode all the production gotchas
- `package.json`, `tsconfig.json`, `cdk.json`, `.gitignore` — CDK package boilerplate

## Why copy and not import as a package

For a portfolio platform, npm publishing is overhead without payoff. The copy-on-scaffold pattern means each app pins its version of the construct, and breaking changes never propagate without explicit action.
