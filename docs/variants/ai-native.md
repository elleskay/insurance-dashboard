# Variant: AI-native

Use this for apps with first-class LLM integration. Covers chat UIs, agent tools, structured output, MCP servers, and prompt management.

## Stack

- Next.js + TypeScript (frontend + API routes)
- Vercel AI SDK or Anthropic SDK for LLM calls
- Model Context Protocol (MCP) server for tool exposure
- Prompt management as code (versioned in repo, not in a UI)
- Sandbox runtime for executing model-generated code (Vercel Sandbox, e2b, or Lambda-based)
- PostgreSQL for app data, Redis (Upstash) for cache + rate limiting
- Sentry for errors, PostHog for usage tracking

## Setup

```bash
npx create-next-app@latest apps/web --typescript --tailwind --app
cd apps/web
npm install ai @ai-sdk/anthropic zod
npm install @modelcontextprotocol/sdk
npm install @upstash/redis @upstash/ratelimit
```

## Patterns to demonstrate

### Streaming responses

Use Vercel AI SDK `streamText` for chat-style UX. Shows you understand SSE / streaming.

### Tool calling

Define tools with Zod schemas, register with the SDK. Each tool is a typed function the model can call.

### MCP server

Expose internal capabilities as MCP tools. Shows you understand the emerging standard for LLM tool integration.

### Prompt management

Store prompts as `.md` or `.txt` files in `apps/web/prompts/`, versioned in git. No external prompt UI.

```
apps/web/prompts/
├── system/
│   └── classifier.md
└── user/
    └── intake.md
```

### Cost + latency tracking

Wrap LLM calls with timing and token counting. Log to Sentry breadcrumbs or PostHog.

### Rate limiting

Use Upstash on every LLM endpoint. Free tier handles portfolio traffic.

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),
});
```

### Sandbox for model-generated code

Never execute LLM-generated code in your app process. Use Vercel Sandbox, e2b, or a Lambda with strict IAM.

## Security considerations specific to LLMs

- Prompt injection: treat all model output as untrusted, never pass directly into shell, SQL, or eval
- Data exfiltration: scrub PII before sending to provider, log what you send
- Provider failover: have a second provider configured
- Cost limits: hard cap per user per day

