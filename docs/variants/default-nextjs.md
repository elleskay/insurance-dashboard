# Variant: Default Next.js

Use this for most apps. The default full-stack web app pattern: Next.js on AWS with managed Postgres.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui
- PostgreSQL via Drizzle ORM (Neon serverless Postgres is the default)
- Auth.js (NextAuth) for auth
- Sentry for errors
- Zod for validation
- Hosted on AWS via CDK (Lambda + CloudFront via OpenNext is the default, ECS Fargate as alternative)

## Setup

```bash
npx create-next-app@latest apps/web --typescript --tailwind --app --eslint
cd apps/web
npx shadcn@latest init
npm install drizzle-orm pg zod next-auth@beta @auth/drizzle-adapter bcryptjs
npm install -D drizzle-kit @types/pg @types/bcryptjs
npm install @opennextjs/aws
```

Extend `tsconfig.base.json`:

```jsonc
// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
}
```

## Security baseline

Add to `apps/web/next.config.ts`:

```ts
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export default {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

## Infra

Two deploy patterns supported. Pick by traffic and budget.

### Default: Serverless (Lambda + CloudFront via OpenNext)

Best for portfolio apps and most production apps under ~1M requests/month.

- Idle cost: ~$0-2/month (Lambda scales to zero, CloudFront has no fixed cost)
- Cold start: 200-800ms on first request after ~10 min idle
- Built via `open-next build`, deployed via CDK

Stack: `Lambda` (server) + `Lambda` (image opt) + `S3` (static assets) + `CloudFront` (edge).

VPC not required. Connects to managed Postgres (Neon, RDS Proxy) over the public internet via TLS.

### Alternative: ECS Fargate

Use when you have steady traffic, need long-running connections, websockets, or run heavyweight Node deps that exceed Lambda's 250MB unzipped limit.

- Idle cost: ~$95/month (NAT + Fargate + ALB + RDS)
- No cold starts
- Deployed via `docker build` + `cdk deploy`

Stack: `ECS Fargate` + `ALB` + `RDS Postgres` + the platform `VPC` and `ECR`.

### How to choose

| Question | Pick |
|---|---|
| Hobbyist or portfolio? | Serverless |
| Less than 1M requests/month? | Serverless |
| Steady high traffic, websockets, long-running jobs? | ECS Fargate |
| Hard sub-100ms latency on every request? | ECS Fargate |
| Want $0 idle bill? | Serverless |

For both patterns:
- Add an app-specific CDK stack at `infra/cdk/<app>/`
- Provision its own database (Neon for serverless, RDS for Fargate)
- Reuse platform base resources (ECR for Fargate path; serverless doesn't need them)

