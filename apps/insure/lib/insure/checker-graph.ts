import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  CHECKER_SYSTEM,
  buildCheckPrompt,
  checkDraftSchema,
  routeAfterVerify,
  summarize,
  verifyGrounding,
  type CheckResult,
  type DraftPolicy,
  type GroundingIssue,
} from "./checker";

/**
 * The policy checker as a LangGraph state graph.
 *
 *   drafter -> verify -> (draft | finalize) -> END
 *
 * The verify -> drafter edge is a self-correction loop: the model reads the
 * document and drafts a summary plus fine-print findings, each with a verbatim
 * quote, then we check that every quote actually appears in the source text. If
 * a quote cannot be grounded the graph re-drafts (bounded by MAX_DRAFTS) so the
 * model can quote the real wording or drop the claim, instead of surfacing an
 * invented exclusion. A single model call cannot guarantee that; the loop, the
 * shared state, and the conditional routing are what LangGraph adds.
 *
 * Model calls inside nodes reuse the app's existing Vercel AI SDK so there is
 * one model stack; LangGraph only orchestrates.
 */

const CheckerState = Annotation.Root({
  source: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),
  draft: Annotation<DraftPolicy[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  issues: Annotation<GroundingIssue[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  attempts: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  result: Annotation<CheckResult | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

type CheckerStateType = typeof CheckerState.State;

/** Model node: read the document and draft summary + findings, reusing the
 * app's AI SDK + Anthropic. On a revision it is told which quotes failed. */
async function draftNode(
  state: CheckerStateType,
): Promise<Partial<CheckerStateType>> {
  const { object } = await generateObject({
    model: anthropic(process.env.CHECKER_MODEL || "claude-sonnet-4-6"),
    schema: checkDraftSchema,
    system: CHECKER_SYSTEM,
    prompt: buildCheckPrompt(state.source, state.issues),
  });

  const draft: DraftPolicy[] = object.policies.map((p) => ({
    insurer: p.insurer,
    name: p.name,
    category: p.category,
    summary: p.summary,
    benefitAmount: p.benefitAmount,
    premium: p.premium,
    premiumNote: p.premiumNote,
    findings: p.findings.map((f) => ({
      key: f.key,
      detail: f.detail,
      quote: f.quote,
      severity: f.severity,
    })),
    payout: {
      deductible: p.payout.deductible,
      coPaymentPercent: p.payout.coPaymentPercent,
      coPaymentCap: p.payout.coPaymentCap,
    },
  }));

  return { draft, attempts: state.attempts + 1 };
}

/** Deterministic: verify every drafted quote against the document text. */
function verifyNode(state: CheckerStateType): Partial<CheckerStateType> {
  return { issues: verifyGrounding(state.draft, state.source) };
}

/** Deterministic: drop unquotable findings and build the full checklist. */
function finalizeNode(state: CheckerStateType): Partial<CheckerStateType> {
  return { result: summarize(state.draft, state.issues, state.source) };
}

// Node names must not collide with state-channel names, so the drafting node is
// "drafter" while the router still returns the semantic "draft" / "finalize".
const compiled = new StateGraph(CheckerState)
  .addNode("drafter", draftNode)
  .addNode("verify", verifyNode)
  .addNode("finalize", finalizeNode)
  .addEdge(START, "drafter")
  .addEdge("drafter", "verify")
  .addConditionalEdges(
    "verify",
    (state: CheckerStateType) => routeAfterVerify(state.issues, state.attempts),
    { draft: "drafter", finalize: "finalize" },
  )
  .addEdge("finalize", END)
  .compile();

/** Read and check one policy document's text. */
export async function runChecker(sourceText: string): Promise<CheckResult> {
  const final = await compiled.invoke({ source: sourceText });
  return final.result ?? { policies: [], needsReview: false };
}
