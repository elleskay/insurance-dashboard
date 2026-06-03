import { z } from "zod";
import { runChecker } from "@/lib/insure/checker-graph";
import {
  clientId,
  configuredOrigins,
  isOriginAllowed,
  rateOk,
} from "@/lib/insure/security";

export const runtime = "nodejs";
// The grounding loop can run several model passes, so allow more headroom.
export const maxDuration = 60;

const RequestSchema = z.object({
  // Document text extracted in the browser. Capped to keep cost and latency
  // bounded; long policy wordings are truncated.
  text: z.string().min(1).max(60_000),
});

export async function POST(req: Request) {
  // Abuse guards: this route fires paid model calls, so refuse cross-origin
  // callers (in production) and clients that exceed the per-window budget.
  if (!isOriginAllowed(req.headers.get("origin"), configuredOrigins())) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!rateOk(clientId(req), Date.now())) {
    return Response.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 },
    );
  }

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
      { error: "The policy checker is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const result = await runChecker(parsed.data.text);
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Could not read this document. Try a different PDF." },
      { status: 502 },
    );
  }
}
