import { z } from "zod";
import { CATEGORIES } from "@/lib/insure/types";
import { runAdvisor } from "@/lib/insure/advisor-graph";

export const runtime = "nodejs";
// Up to three model drafts (initial plus two revisions), so allow headroom.
export const maxDuration = 60;

const RequestSchema = z.object({
  income: z.number().min(0).max(100_000_000),
  policies: z
    .array(
      z.object({
        id: z.string(),
        insurer: z.string(),
        name: z.string(),
        category: z.enum(CATEGORIES),
        sumAssured: z.number().min(0),
        annualPremium: z.number().min(0),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (parsed.data.income <= 0) {
    return Response.json(
      { error: "Add your annual income to get adequacy advice." },
      { status: 422 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "The advisor is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const result = await runAdvisor(parsed.data.policies, parsed.data.income);
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Could not generate advice right now. Try again shortly." },
      { status: 502 },
    );
  }
}
