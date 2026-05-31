import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import {
  EXTRACT_SYSTEM,
  llmExtractionSchema,
  normalizePolicies,
} from "@/lib/insure/extract-ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const RequestSchema = z.object({
  // Document text extracted in the browser. Capped to keep cost and latency
  // bounded; long policy wordings are truncated.
  text: z.string().min(1).max(60_000),
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "AI extraction is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const { object } = await generateObject({
      model: anthropic(process.env.EXTRACT_MODEL || "claude-3-5-haiku-latest"),
      schema: llmExtractionSchema,
      system: EXTRACT_SYSTEM,
      prompt: parsed.data.text,
    });
    return Response.json({ policies: normalizePolicies(object.policies) });
  } catch {
    return Response.json(
      { error: "Could not extract from this document. Add it by hand instead." },
      { status: 502 },
    );
  }
}
