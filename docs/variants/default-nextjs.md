# Next.js + AWS serverless (the only variant)

This is the platform's happy path. Everything in the platform is designed for this.

## Stack

| Layer         | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js (App Router) + TypeScript strict                     |
| Styling       | Tailwind                                                     |
| Database      | Postgres (Neon for serverless connection pooling)            |
| Auth          | Auth.js v5 (Credentials or OAuth, JWT sessions)              |
| Validation    | Zod on every server action boundary                          |
| Build adapter | OpenNext (`@opennextjs/aws`)                                 |
| Hosting       | AWS Lambda (server) + S3 (static assets) + CloudFront (edge) |
| IaC           | AWS CDK                                                      |
| CI/CD         | GitHub Actions (provided in `.github/workflows/`)            |

## Scaffold

```bash
# Create the Next.js app shell
npx create-next-app@latest apps/web --typescript --tailwind --app --eslint --use-npm

# Install Auth.js, OpenNext, and the rest
cd apps/web
npm install next-auth@beta zod
npm install @opennextjs/aws

# Pick your data layer
npm install drizzle-orm pg            # or prisma, or whatever
npm install -D drizzle-kit @types/pg
```

## Overlay the platform's reference patterns

Copy from `apps/_template/` in the platform:

- `next.config.ts` (security headers + Server Actions allowed-origins)
- `auth.config.ts` (edge-safe NextAuth config)
- `middleware.ts` (route protection)
- `components/SignOutButton.tsx` (client-side signout)

See `apps/_template/README.md` for why each one exists.

## CDK setup

```bash
mkdir -p infra/cdk/app/{bin,lib}
cp -r <platform>/infra/cdk/constructs infra/cdk/
```

Write `infra/cdk/app/bin/app.ts` and `infra/cdk/app/lib/web-stack.ts` that instantiate `NextjsServerless`. See `infra/cdk/constructs/README.md` for the exact 5-line usage.

## Seed strategy

If your app uses Postgres, the deploy workflow looks for two scripts in `apps/web/db/` and runs them in order on every deploy:

| Script            | When it runs                             | What it does                                                                                                     |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `db/migrate.ts`   | Always, conditional on the file existing | Drizzle migrate. Applies pending schema changes before the new Lambda goes live.                                 |
| `db/seed-demo.ts` | Always, conditional on the file existing | Idempotent reference/demo data. **Must not delete user rows.** Looks up by natural key, inserts only if missing. |

Both are skipped silently if the file is absent, so non-DB apps incur no penalty.

### Why split seed.ts and seed-demo.ts

- `db/seed.ts` is the **dev/CI test fixture** seed. Wipes everything (`db.delete(...)`) and rebuilds a known clean state. Run by `npm run db:seed` locally and in `apps/_template/.github/workflows/test.yml` against the Postgres service container. **Never runs in prod.**
- `db/seed-demo.ts` is the **prod-safe** seed. Lives alongside `seed.ts`. Idempotent: every row is looked up by a natural key (`email` for users, `name + agency` for teams, `externalRef` for inventory, deterministic `submittedAt` for historical activity) before insert. Runs on every deploy via the workflow.

This anchors to `docs/DEPLOY.md` Rollback section line 86: **"For data migrations, never run destructive operations in deploy."** Seed-demo respects that by design.

### Pattern

```ts
// apps/web/db/seed-demo.ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  async function ensureTeam(name: string, agency: "FRS" | "ICA" | "hospital") {
    const existing = await db
      .select()
      .from(schema.teams)
      .where(and(eq(schema.teams.name, name), eq(schema.teams.agency, agency)))
      .limit(1);
    if (existing[0]) return existing[0];
    const [created] = await db.insert(schema.teams).values({ name, agency }).returning();
    return created;
  }

  const team1 = await ensureTeam("Central Fire Station", "FRS");
  // ...ensureUser, ensureTemplate, ensureInventoryItem follow the same pattern.

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

For synthetic historical activity (submissions, audit entries, etc.), anchor the deterministic timestamps to a fixed `DEMO_ANCHOR` constant rather than `Date.now()`:

```ts
const DEMO_ANCHOR = new Date("2026-05-29T07:00:00Z");
// Reruns are no-ops because every row's submittedAt is computed from DEMO_ANCHOR
// + (dayIdx * DAY_MS) + (templateIdx * SLOT_MS). The (templateId, submittedAt)
// tuple is a stable natural key.
```

Bump `DEMO_ANCHOR` when you want to refresh the demo window. Otherwise the data ages in place, which is fine.

### When NOT to seed in prod

If your app onboards real users (not a portfolio demo, not a sandbox), keep `db/seed-demo.ts` to **reference data only** (default admin user, lookup tables) and skip the synthetic activity block. See `docs/variants/portfolio-deploy.md` for the prod=demo case where richer seeding is the right call.

## Deploy

The platform's `.github/workflows/deploy.yml` works as-is once you set these GitHub secrets and vars on the repo:

| Setting               | Type     | Value                                              |
| --------------------- | -------- | -------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | secret   | OIDC role ARN                                      |
| `DATABASE_URL`        | secret   | Postgres connection string                         |
| `AUTH_SECRET`         | secret   | `openssl rand -base64 32` output                   |
| `AWS_REGION`          | variable | e.g. `ap-southeast-1`                              |
| `APP_URL`             | variable | Your CloudFront URL or custom domain               |
| `ALLOWED_ORIGINS`     | variable | CloudFront host + Lambda URL host, comma-separated |

The smoke test in `scripts/verify-deploy.sh` runs post-deploy and fails CI if any critical flow regresses.

## Cost

- Lambda Free Tier: 1M req/month, 400k GB-seconds → covers idle + light traffic
- S3 Free Tier: 5GB + 20k GET → covers static assets
- CloudFront Free Tier: 1TB transfer/month
- Realistic idle: $0-2/month

## Why not Fargate?

Fargate (ECS + ALB + RDS + NAT) costs ~$95/month idle. For a portfolio or low-traffic app it's strictly worse. If you have steady high traffic, websockets, or long-running jobs, fork this repo, swap `NextjsServerless` for an equivalent Fargate construct, and reintroduce the VPC + ECR base. That's a deliberate choice; the platform's default doesn't carry that infra by accident.

## Why not Vercel?

Vercel is the obvious choice for serverless Next.js — and if your story is "I ship products on Vercel", use Vercel. This platform exists to show competence with AWS-native deploys (CDK, Lambda, CloudFront, IAM, OIDC) on top of the same Next.js code. Different goal.
