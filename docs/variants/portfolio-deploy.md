# Portfolio deploy (when prod equals demo)

A variant for apps where the deployed URL **is** the reviewer-facing demo, not a multi-tenant SaaS. Examples: the apps in this portfolio (armoury, scamshield, future). Reviewers click around prod to evaluate your work; there are no real users to protect from synthetic data.

## When this variant applies

You have **one** AWS environment per app and one CloudFront URL. No staging, no separate playground. The reviewer's first click lands on the same deployment your CI pushes to.

If you ever onboard real users, switch to the [`default-nextjs`](./default-nextjs.md) seed strategy (reference data only, no synthetic activity) before the first user signs up.

## What changes vs default-nextjs

| Concern                   | default-nextjs                                  | portfolio-deploy                                                                                     |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Goal                      | Empty workspace ready for real teams            | Populated demo telling a story                                                                       |
| `db/seed-demo.ts` scope   | Reference data only (admin user, lookup tables) | Reference data + 30 days of synthetic activity (submissions, issues, audit, skips, varied inventory) |
| Synthetic activity        | None                                            | Deterministic, anchored to a stable `DEMO_ANCHOR` date so reruns are no-ops                          |
| When to refresh demo data | Never (demo stays empty)                        | Bump `DEMO_ANCHOR` in `seed-demo.ts`, push                                                           |
| Auth invite codes         | Generated per real user onboarding              | Pre-generated for reviewer self-onboard from any device                                              |

## The pattern

Use the same idempotent `ensureX` helpers from `docs/variants/default-nextjs.md` "Seed strategy", then add a second block for synthetic historical activity:

```ts
// Anchored to a stable date so reruns produce identical rows
const DEMO_ANCHOR = new Date("2026-05-29T07:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedSyntheticActivity(db: ...) {
  // Pre-fetch existing rows in the synthetic window to skip duplicates
  const existing = await db
    .select({ templateId: submissions.templateId, submittedAt: submissions.submittedAt })
    .from(submissions)
    .where(gte(submissions.submittedAt, new Date(DEMO_ANCHOR.getTime() - 30 * DAY_MS)));
  const haveSub = new Set(existing.map((s) => `${s.templateId}|${s.submittedAt.toISOString()}`));

  for (let dayIdx = 1; dayIdx <= 30; dayIdx++) {
    const dayBase = new Date(DEMO_ANCHOR.getTime() - dayIdx * DAY_MS);
    dayBase.setUTCHours(7, 0, 0, 0);

    for (let tplIdx = 0; tplIdx < allTemplates.length; tplIdx++) {
      // ~70% inclusion rate, deterministic by (day, template) pair
      if (((dayIdx * 13 + tplIdx * 7) % 10) >= 7) continue;
      const submittedAt = new Date(dayBase.getTime() + tplIdx * 30 * 60 * 1000);
      const key = `${allTemplates[tplIdx].id}|${submittedAt.toISOString()}`;
      if (haveSub.has(key)) continue;
      // ...insert submission + responses + maybe an issue
    }
  }
}
```

Key points:

1. **`DEMO_ANCHOR` is a constant in source**, not `new Date()`. Without an anchor, every deploy produces new "today" rows and the seed stops being idempotent.
2. **Inclusion and failure rates are hashed from `(dayIdx, templateIdx)`**, not random. Reproducible across machines and reruns.
3. **Existence check before insert** uses the deterministic natural key (template + submittedAt). Same row, same lookup, every time.

## How rich is "rich enough"

Aim for the dashboard chart to have shape, not for a synthetic LinkedIn feed. Empirically for the armoury demo:

| Volume                                                      | Why                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| ~80 submissions over 30 days                                | Per-template avg scores render; chart has green/orange split visible       |
| 3-5 open issues across severities, 6-8 resolved             | Severity ladder visible, resolution flow has examples                      |
| 10 audit log entries                                        | Audit log page is non-empty; covers template/invite/inventory action types |
| 3 skipped checks                                            | Skip/unskip feature has historical evidence                                |
| 6-10 inventory items, 2 low-stock, 2 expiring within 7 days | Pulse stat cards non-zero, expiring-soon icon triggers                     |

Don't pad beyond this. Synthetic data that's too perfect is more suspicious to a reviewer than minimal data.

## Anti-patterns

- **Don't seed by date relative to "now".** `new Date(Date.now() - 5 * DAY_MS)` is not idempotent. Use `DEMO_ANCHOR + offset`.
- **Don't seed user-generated tables like real audit log entries via the real server actions.** Insert directly via `db.insert(...)`. Going through the action would write entries with `createdAt = now`, breaking idempotency.
- **Don't put demo data in `db/seed.ts`.** That file is destructive (`db.delete(...)`) and runs in CI test fixtures. Synthetic activity belongs in `db/seed-demo.ts` only.
- **Don't auto-reset the demo on a schedule.** If the reviewer's session is destroyed mid-evaluation, that's a worse outcome than slightly stale data.

## Verification

After deploy, **always** click around live prod with the lessons of the structural-vs-behavioural distinction (`docs/TESTING.md` "Failure modes the gate does NOT catch") in mind. Spec coverage is not journey coverage. A 5-minute Playwright walk against the deployed URL catches the class of bug the gate does not.
