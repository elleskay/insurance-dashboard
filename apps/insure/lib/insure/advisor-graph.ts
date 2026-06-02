import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { type Policy } from "./types";
import {
  ADVISOR_SYSTEM,
  adviceDraftSchema,
  buildAdvicePrompt,
  buildFacts,
  routeAfterVerify,
  summarize,
  verifyGrounding,
  type AdviceFacts,
  type AdviceResult,
  type GroundingIssue,
  type Recommendation,
} from "./advisor";

/**
 * The adequacy advisor as a LangGraph state graph.
 *
 *   assess -> draft -> verify -> (draft | finalize) -> END
 *
 * The verify -> draft edge is a self-correction loop: the model drafts
 * suggestions, we check every cited figure against the numbers we computed, and
 * if it cited a figure we cannot back, the graph revises (bounded by MAX_DRAFTS)
 * instead of shipping a wrong number. A single model call cannot do that; the
 * loop, the shared state, and the conditional routing are what LangGraph adds.
 *
 * Model calls inside nodes reuse the app's existing Vercel AI SDK so there is
 * one model stack; LangGraph only orchestrates.
 */

const AdvisorState = Annotation.Root({
  policies: Annotation<Policy[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  income: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  facts: Annotation<AdviceFacts | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  draft: Annotation<Recommendation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  issues: Annotation<GroundingIssue[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  attempts: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  recommendations: Annotation<Recommendation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  needsReview: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  confidence: Annotation<number>({ reducer: (_, next) => next, default: () => 1 }),
});

type AdvisorStateType = typeof AdvisorState.State;

/** Deterministic: compute the ground-truth gaps the advice must respect. */
function assessNode(state: AdvisorStateType): Partial<AdvisorStateType> {
  return { facts: buildFacts(state.policies, state.income) };
}

/** Model node: draft suggestions, reusing the app's AI SDK + Anthropic. */
async function draftNode(
  state: AdvisorStateType,
): Promise<Partial<AdvisorStateType>> {
  const facts = state.facts;
  if (!facts) return { draft: [], attempts: state.attempts + 1 };

  const { object } = await generateObject({
    model: anthropic(process.env.ADVISOR_MODEL || "claude-sonnet-4-6"),
    schema: adviceDraftSchema,
    system: ADVISOR_SYSTEM,
    prompt: buildAdvicePrompt(facts, state.issues),
  });

  const draft: Recommendation[] = object.recommendations.map((r, i) => ({
    id: `${r.category}-${i}`,
    category: r.category,
    title: r.title,
    detail: r.detail,
    severity: r.severity,
    citedGap: r.citedGap > 0 ? Math.round(r.citedGap) : undefined,
  }));

  return { draft, attempts: state.attempts + 1 };
}

/** Deterministic: verify every cited figure against the computed facts. */
function verifyNode(state: AdvisorStateType): Partial<AdvisorStateType> {
  if (!state.facts) return { issues: [] };
  return { issues: verifyGrounding(state.draft, state.facts) };
}

/** Deterministic: drop unverifiable suggestions and report confidence. */
function finalizeNode(state: AdvisorStateType): Partial<AdvisorStateType> {
  const result = summarize(state.draft, state.issues);
  return {
    recommendations: result.recommendations,
    needsReview: result.needsReview,
    confidence: result.confidence,
  };
}

// Node names must not collide with state channel names, so the drafting node is
// "drafter" while the router still returns the semantic "draft" / "finalize".
const compiled = new StateGraph(AdvisorState)
  .addNode("assess", assessNode)
  .addNode("drafter", draftNode)
  .addNode("verify", verifyNode)
  .addNode("finalize", finalizeNode)
  .addEdge(START, "assess")
  .addEdge("assess", "drafter")
  .addEdge("drafter", "verify")
  .addConditionalEdges(
    "verify",
    (state: AdvisorStateType) => routeAfterVerify(state.issues, state.attempts),
    { draft: "drafter", finalize: "finalize" },
  )
  .addEdge("finalize", END)
  .compile();

/** Run the advisor for one person's policies and income. */
export async function runAdvisor(
  policies: Policy[],
  income: number,
): Promise<AdviceResult> {
  const final = await compiled.invoke({ policies, income });
  return {
    recommendations: final.recommendations,
    needsReview: final.needsReview,
    confidence: final.confidence,
  };
}
