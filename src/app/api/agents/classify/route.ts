import { NextRequest, NextResponse } from "next/server";
import { llmClient, callJudgmentModel, MODEL_ROUTINE } from "@/lib/llm/client";

/**
 * POST /api/agents/classify
 *
 * The first half of a goal-driven "Holly" — Section 5 of the
 * team-architecture doc. Takes whatever someone typed in plain language
 * and classifies it into one of the doc's four goal shapes (Cycle, Case,
 * Question, Change) before anything is dispatched.
 *
 * This is deliberately NOT a tool-calling agent loop. The free OpenRouter
 * models this app defaults to (see lib/llm/client.ts) aren't a safe bet
 * for reliable native tool-use, and the rest of this codebase already has
 * a pattern for exactly this shape of problem — one structured-JSON call,
 * parsed defensively, "never guess" on a bad parse — so classification
 * follows it instead of introducing a second one.
 *
 * What actually happens with the result is the caller's job. Today only
 * "cycle" is wired to anything — the goal box on the Team screen runs the
 * existing Input -> Structure -> Tax sequence for it, same as the old
 * "Run a cycle" button. Case/Question/Change are classified honestly and
 * then met with "I can't do that yet," not a bluff.
 */

const VALID_SHAPES = ["cycle", "case", "question", "change", "unsupported"] as const;
type GoalShape = (typeof VALID_SHAPES)[number];

interface ClassifyResult {
  shape: GoalShape;
  reason: string;
}

export async function POST(req: NextRequest) {
  let body: { goal?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const goal = body.goal?.trim();
  if (!goal) {
    return NextResponse.json({ error: "goal is required." }, { status: 400 });
  }

  const prompt = `You classify what someone typed to an HR/payroll AI team called "Holly" into
exactly one shape, per this taxonomy:

- "cycle": a recurring, known-sequence job — e.g. "run September payroll",
  "run this month's cycle". Has known gates and doesn't need a specific
  person or a yes/no answered.
- "case": one specific person or subject with several steps and a
  deadline — e.g. "close F&F for Ravi", "process Priya's exit".
- "question": read-only, answerable from history — e.g. "why is my salary
  less this month", "has this month's TDS been filed".
- "change": would affect many records if carried out — e.g. "move the
  Bangalore team to the new structure".
- "unsupported": doesn't clearly match any of the above, or isn't an HR/
  payroll request at all.

What someone typed: "${goal.replace(/"/g, '\\"')}"

Reply with ONLY a JSON object, no other text:
{"shape": "cycle" | "case" | "question" | "change" | "unsupported", "reason": string}
"reason" is one short sentence explaining the classification in plain
language, as if telling the person what you understood.`;

  try {
    const client = llmClient();
    const text = await callJudgmentModel(client, { model: MODEL_ROUTINE, maxTokens: 200, prompt });

    let parsed: ClassifyResult = { shape: "unsupported", reason: "Couldn't understand that — try rephrasing." };
    if (text) {
      try {
        const candidate = JSON.parse(text);
        if (VALID_SHAPES.includes(candidate.shape)) {
          parsed = { shape: candidate.shape, reason: String(candidate.reason ?? "") };
        }
      } catch {
        // Model didn't return clean JSON — fall through to "unsupported"
        // rather than guess what was meant.
      }
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[classify]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
