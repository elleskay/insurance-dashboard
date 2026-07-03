# Security Policy

## Reporting a vulnerability

Report security issues via either channel (prefer the first if available):

1. **GitHub Private Vulnerability Reporting:** [github.com/elleskay/insurance-dashboard/security/advisories/new](https://github.com/elleskay/insurance-dashboard/security/advisories/new). Encrypted, tracked, and lets us coordinate a fix and CVE if needed.
2. **Email:** lskpes10@gmail.com

Do not open public GitHub issues for security problems.

Expected response time: 72 hours.

## Supported versions

Latest `main` only.

## Scope

This repo ships CoverLens (`apps/insure`) on the platform template's security defaults:

- Dependency scanning via Dependabot
- Code scanning via GitHub CodeQL, secret scanning via gitleaks + GitHub native
- Security headers via Next.js `headers()` in `apps/insure/next.config.ts`
- Origin allow-list and rate limiting on the paid `/api/check` route (`apps/insure/lib/insure/security.ts`)
- Input validation via Zod at the route boundary
- No server-side storage of uploaded documents; results persist only in the user's browser
- Production secrets live in GitHub Actions secrets and are baked into the Lambda environment at deploy time (never committed)

See `docs/SSDLC.md` for the secure development lifecycle this repo assumes.
