# CoverLens SG

Upload your Singapore insurance policy PDFs and get an instant coverage summary: what you are covered for by category, what you pay, and where your protection may fall short of the common rules of thumb. No data entry, the figures are read from your documents for you.

**Live:** https://d33z7oya883ugt.cloudfront.net

> Estimates only, not financial advice. Benchmarks are rules of thumb from the LIA and MoneySense Basic Financial Planning Guide. Always confirm against your actual policy documents or a licensed adviser.

## What it does

- **Upload, do not type.** Drop one or more policy PDFs. The browser reads the text, an AI model extracts each policy (insurer, category, sum assured, premium), and the dashboard fills in automatically. One document can contain several policies.
- **Coverage by category.** Hospitalisation (Integrated Shield), life (death and TPD), critical illness, disability income, and personal accident, with a donut breakdown and per-category totals.
- **Adequacy check (optional).** Add your annual income to compare cover against the benchmarks: death and TPD vs about 9x income, critical illness vs about 4x, shown as gauges with the gap or met status.
- **Premium view.** Total annual premium and its share of income against the roughly 15 percent protection guideline.
- **Fix anything inline.** The policy list is editable, so anything the model misreads is corrected in place. A manual "add by hand" fallback covers documents that will not parse.

## How extraction works

1. The PDF is read to text in the browser with `pdfjs-dist`.
2. That text is POSTed to `/api/extract`, a server route that calls Claude through the Vercel AI SDK (`generateObject` with a strict schema).
3. The response is normalized (categories validated, monthly premiums annualized, amounts coerced, unknowns dropped) and added to the dashboard.

### Privacy

The document text is sent to an AI service to extract the figures. It is not stored. This is a deliberate tradeoff for extraction quality, and it is disclosed in the upload area. Do not upload anything you are not comfortable sharing with an AI service. State persists only in your browser's `localStorage`.

## Tech

- Next.js 16 (App Router) and React 19, TypeScript strict, Tailwind v4, Geist fonts.
- `pdfjs-dist` for in-browser PDF text extraction (worker bundled as a `/_next/static` asset).
- Vercel AI SDK v6 with `@ai-sdk/anthropic`; Zod for schema and request validation.
- AWS Lambda, S3, and CloudFront via OpenNext, provisioned with AWS CDK.
- Built on the [platform template](https://github.com/elleskay/platform).

## Local development

```bash
cd apps/insure
npm install
# AI extraction needs a key; without it the route returns 503 and the app
# falls back to manual entry.
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

Open http://localhost:3000. Override the model with `EXTRACT_MODEL` (default `claude-haiku-4-5`).

## Testing

Spec-driven: every requirement in `apps/insure/specs/insure.yml` (19 of them) has a test, and the gate fails below 100 percent coverage. Data requirements run on Vitest, the rest on Playwright; accessibility is checked with axe. The non-deterministic AI call is stubbed in e2e so the gate stays offline and deterministic.

```bash
cd apps/insure
npm run test:spec   # build + unit + e2e + coverage gate
npm run lint
npx tsc --noEmit
```

## Deploy

Manual local deploy to AWS (account-specific). OpenNext build first, then CDK. The API key is baked into the Lambda environment at synth time, so it must be present when you deploy.

```bash
cd apps/insure && npm run build:open-next
cd ../../infra/cdk/insure
ANTHROPIC_API_KEY=sk-ant-... \
PLATFORM_DEMO_APP_PATH=apps/insure \
CDK_DEFAULT_REGION=ap-southeast-1 \
npx cdk deploy --require-approval never
```

Stack: `InsureServerless`. See `docs/DEPLOY.md` for the platform deploy gotchas.

### Before sharing the live URL publicly

`/api/extract` is a public, unauthenticated endpoint with only an input length cap. Anyone calling it spends your API credits. Add rate limiting (the platform ships a no-op Upstash helper) or auth before wide exposure.

## Structure

```
apps/insure/
  app/            # layout, page, /api/extract route, globals.css
  components/     # Dashboard, PdfUpload, Aurora, TiltCard
  lib/insure/     # types, compute (adequacy/premium), extract-ai (schema + normalize), meta
  specs/          # insure.yml (the source of truth for tests)
  tests/          # unit (Vitest) + e2e (Playwright) + fixtures
infra/cdk/insure/ # CDK package (stack InsureServerless)
```

## License

MIT.
