import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { executePipeline } from "@/lib/pipeline";
import { PipelineConfig, StreamEvent } from "@/lib/types";
import { getWalletState, initializeWallets } from "@/lib/wallet";
import { TOOL_PROVIDERS } from "@/lib/marketplace";
import { getGovernanceState, initGovernance } from "@/lib/governance";

export const maxDuration = 120;

const anthropic = new Anthropic();

const conversations = new Map<string, { role: string; content: string }[]>();

function getConvo(id: string) {
  if (!conversations.has(id)) conversations.set(id, []);
  return conversations.get(id)!;
}

function buildSystemPrompt() {
  const w = initializeWallets();
  const ws = getWalletState();
  initGovernance();
  const gs = getGovernanceState();

  return `You are AgentPM — an autonomous AI project manager with its own crypto wallet on Base Sepolia.

## YOUR WALLET
- Address: ${w.address}
- Balance: $${ws.wallet?.balance.toFixed(4) || "10.0000"} USDC
- Total spent this session: $${ws.totalSpent.toFixed(4)}
- Transactions: ${ws.transactions.length}

## GOVERNANCE POLICIES
${gs.policies.map(p => `- ${p.name} (${p.active ? "active" : "disabled"}): ${p.rules.map(r => `${r.type}=${JSON.stringify(r.value)}`).join(", ")}`).join("\n")}
- Daily spend: $${gs.dailySpend.toFixed(4)} / Daily tx count: ${gs.dailyTxCount}

## AVAILABLE TOOLS (${TOOL_PROVIDERS.length} providers)
${TOOL_PROVIDERS.map(p => `- ${p.name} [${p.category}] $${p.price}/call, quality ${p.qualityScore}/10, ${p.latencyMs}ms`).join("\n")}

## REAL AGENT CAPABILITIES
- Domain Search Agent: Checks REAL domain availability via RDAP protocol (no auth, live data). Searches across .com, .io, .dev, .app, .co, .xyz, .ai, .tech. Also checks crypto domains via Unstoppable Domains API and .eth via ENS/The Graph.
- Vercel Deploy Agent: Generates a real landing page (HTML/CSS) and deploys to Vercel's edge network via API. Returns a live URL. (Simulated if no VERCEL_TOKEN set, but the generated site is real.)
- When a user wants to "ship", "deploy", "host", or "launch" something, include deployment and/or domain stages in the plan.

## HOW YOU WORK
You help users plan and execute projects. You are conversational, opinionated, and proactive. You:
1. Ask smart clarifying questions before executing (audience? tone? constraints?)
2. Propose a concrete plan with stages, estimated costs, and tool choices
3. Explain your reasoning for each tool choice (price vs quality tradeoff)
4. Only execute when the user explicitly confirms (says "go", "run it", "execute", "yes", "do it", "let's go", "ship it")

When the user confirms execution, include this exact tag on its own line:
[EXECUTE: detailed brief of what to build based on the full conversation]

## HOSTING OPTIONS
When deploying, always present these hosting options:
1. **Free on larp.click** - Deploy to yourproject.larp.click (free subdomain, instant)
2. **Custom domain** - User provides their own domain, we connect it
3. **Vercel** - Deploy to Vercel (user can provide their own token, or we simulate)

Ask the user which option they prefer before deploying.

## APPROVAL FLOW (CRITICAL)
Before EVERY execution, you MUST present the full plan as a clear table:

**Proposed plan:**
| Stage | Tool | Cost | What it does |
|-------|------|------|-------------|
| 1. Research | Apify ($0.025) | Competitor analysis |
| 2. Copy | Claude Opus ($0.015) | Write landing page content |
| ... | ... | ... | ... |
| **Total** | | **$0.090** | |

Then ask: "This will cost $X.XX from your wallet ($Y.YY remaining). Want me to proceed? You can also ask me to swap tools, skip stages, or adjust the budget."

IMPORTANT RULES:
- NEVER execute without explicit user approval. Always show the plan table first.
- If the user says "no" or "change X", adjust the plan and re-propose.
- Be specific about costs. Show exact dollar amounts for each stage.
- Reference governance policies when relevant ("this stays under the $0.50/tx limit")
- After execution, offer concrete next steps with costs.
- Remember everything. Reference previous results and decisions.
- Be concise. No filler. Think like a senior PM at Stripe.
- When discussing tools, cite specific providers and their tradeoffs.
- If asked about your wallet, policies, or capabilities, give real details from above.
- If user mentions hosting on their domain, ask for the domain name and note it for deployment.
- If user says "host on larp.click", use the subdomain format: projectname.larp.click`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, sessionId = "default", budget = 5, priority = "balanced" } = body as {
    message: string; sessionId?: string; budget?: number; priority?: string;
  };

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: "Message required" }), { status: 400 });
  }

  const history = getConvo(sessionId);
  history.push({ role: "user", content: message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      try {
        const systemPrompt = buildSystemPrompt();
        const messages = history.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Stream the Claude response
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        });

        let fullText = "";
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            send("text_delta", { text: event.delta.text });
          }
        }

        history.push({ role: "assistant", content: fullText });

        // Check for execution trigger
        const execMatch = fullText.match(/\[EXECUTE:\s*([^\]]+)\]/);
        if (execMatch) {
          const brief = execMatch[1].trim();
          send("execution_start", { brief });

          const config: PipelineConfig = { budget, priority: priority as PipelineConfig["priority"], riskTolerance: "medium", maxSteps: 10 };

          const pipelineEvents: StreamEvent[] = [];
          await executePipeline(brief, config, (ev: StreamEvent) => {
            pipelineEvents.push(ev);
            send("stage_event", ev);
          });

          const done = pipelineEvents.find(e => e.type === "complete");
          if (done) {
            const cd = done.data as Record<string, unknown>;
            const resultSummaries = pipelineEvents
              .filter(e => e.type === "result")
              .map(e => { const d = e.data as Record<string, unknown>; return `[${d.stageName}] via ${d.provider} ($${(d.cost as number)?.toFixed(3)}): ${(d.output as string)?.slice(0, 200)}`; })
              .join("\n");

            history.push({
              role: "assistant",
              content: `[Execution complete: ${cd.totalSteps} stages, $${(cd.totalCost as number)?.toFixed(4)} spent, $${(cd.walletBalance as number)?.toFixed(4)} remaining]\n\n${resultSummaries}`,
            });
          }

          send("execution_complete", done?.data || {});
        }
      } catch (err) {
        send("error", { content: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
