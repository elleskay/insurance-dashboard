# Variant: NestJS API

Use this when the app needs a separate backend service. Good for apps with heavy server-side logic, websockets, ML pipelines, or strict separation between web and API tiers.

## Stack

- Next.js web app (frontend)
- NestJS API (backend, separate deploy)
- PostgreSQL via TypeORM or Prisma (NestJS-idiomatic)
- Passport.js + JWT for auth on NestJS, web app calls API
- Zod or class-validator for input validation
- Hosted on AWS ECS Fargate (NestJS) + CloudFront (web)

## Setup

```bash
# Web app
npx create-next-app@latest apps/web --typescript --tailwind --app

# NestJS API
npm i -g @nestjs/cli
nest new apps/api --package-manager npm --strict
cd apps/api
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install @nestjs/typeorm typeorm pg
npm install class-validator class-transformer helmet
```

## Auth pattern

NestJS owns auth via Passport + JWT guards. Web app:

1. POSTs credentials to `/api/auth/login` on NestJS
2. Stores returned JWT in httpOnly cookie
3. Sends JWT on subsequent API calls
4. NestJS validates via JWT guard on protected routes

Do not use Auth.js sessions with a NestJS backend, the two auth models fight.

## NestJS security baseline

```ts
// apps/api/src/main.ts
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

## Infra

Two CDK stacks:

- `infra/cdk/web/` — CloudFront + S3 or Lambda for Next.js
- `infra/cdk/api/` — ECS Fargate service for NestJS, ALB, target group, RDS Postgres

## OpenSearch (ScamShield only)

If building ScamShield-style apps:

```bash
cd apps/api
npm install @nestjs/elasticsearch @opensearch-project/opensearch
```

Add `infra/cdk/opensearch/` stack with an OpenSearch domain.

