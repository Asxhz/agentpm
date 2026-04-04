import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { executePipeline } from "@/lib/pipeline";
import { PipelineConfig, StreamEvent } from "@/lib/types";
import { getWalletState, initializeWallets } from "@/lib/wallet";
import { TOOL_PROVIDERS } from "@/lib/marketplace";
import { getGovernanceState, initGovernance } from "@/lib/governance";

export const maxDuration = 120;

const anthropic = new Anthropic();

// Session history: tracks all executions, deployed sites, and spend across the conversation
interface SessionExecution {
  brief: string;
  stagesCompleted: number;
  totalCost: number;
  providers: string[];
  deployedUrls: string[];
  timestamp: string;
}

const conversations = new Map<string, { role: string; content: string }[]>();
const sessionExecutions = new Map<string, SessionExecution[]>();

function getConvo(id: string) {
  if (!conversations.has(id)) conversations.set(id, []);
  return conversations.get(id)!;
}

function getSessionExecs(id: string): SessionExecution[] {
  if (!sessionExecutions.has(id)) sessionExecutions.set(id, []);
  return sessionExecutions.get(id)!;
}

function buildSystemPrompt(sessionId: string = "default") {
  const w = initializeWallets();
  const ws = getWalletState();
  initGovernance();
  const gs = getGovernanceState();
  const execHistory = getSessionExecs(sessionId);

  // Build execution history section
  let executionHistoryBlock = "";
  if (execHistory.length > 0) {
    const totalSessionSpend = execHistory.reduce((s, e) => s + e.totalCost, 0);
    const allDeployedUrls = execHistory.flatMap(e => e.deployedUrls);
    const allProviders = [...new Set(execHistory.flatMap(e => e.providers))];

    executionHistoryBlock = `
## SESSION EXECUTION HISTORY (${execHistory.length} execution(s) this session)
- Total spent across all executions: $${totalSessionSpend.toFixed(4)}
- Total stages completed: ${execHistory.reduce((s, e) => s + e.stagesCompleted, 0)}
- Unique providers used: ${allProviders.join(", ") || "none"}
${allDeployedUrls.length > 0 ? `- Live deployed sites: ${allDeployedUrls.join(", ")}` : "- No sites deployed yet"}

### Past Executions:
${execHistory.map((e, i) => `${i + 1}. "${e.brief}" — ${e.stagesCompleted} stages, $${e.totalCost.toFixed(4)}, via ${e.providers.join(" -> ")}${e.deployedUrls.length > 0 ? `, deployed: ${e.deployedUrls.join(", ")}` : ""} (${e.timestamp})`).join("\n")}
`;
  } else {
    executionHistoryBlock = `
## SESSION EXECUTION HISTORY
No executions yet this session. The user has not run any pipelines.
`;
  }

  return `You are AgentPM — an autonomous AI project manager with its own crypto wallet on Base Sepolia.

## YOUR WALLET
- Address: ${w.address}
- Balance: $${ws.wallet?.balance.toFixed(4) || "50.0000"} USDC [SIM - simulated balance]
- Total spent this session: $${ws.totalSpent.toFixed(4)}
- Transactions: ${ws.transactions.length}
${executionHistoryBlock}
## GOVERNANCE POLICIES
${gs.policies.map(p => `- ${p.name} (${p.active ? "active" : "disabled"}): ${p.rules.map(r => `${r.type}=${JSON.stringify(r.value)}`).join(", ")}`).join("\n")}
- Daily spend: $${gs.dailySpend.toFixed(4)} / Daily tx count: ${gs.dailyTxCount}

## AVAILABLE TOOLS (${TOOL_PROVIDERS.length} providers)
${TOOL_PROVIDERS.map(p => `- ${p.name} [${p.category}] $${p.price}/call, quality ${p.qualityScore}/10, ${p.latencyMs}ms`).join("\n")}

## CAPABILITIES AND TRUTH LABELS
Every action you take has a truth label. You MUST include these labels when reporting results.

**[REAL] Domain Search**: Checks actual domain availability via RDAP protocol. Live API, real data.
**[REAL] EIP-712 Signing**: Real cryptographic signatures on Base Sepolia testnet via ethers.js.
**[REAL] Vercel Deployment**: Deploys generated HTML to Vercel via API. Returns a real live URL.
**[REAL] Governance Engine**: 5 verdicts (APPROVED/DENIED/ESCALATE/DOWNGRADE/REROUTE), real policy evaluation.

**[SIM] Provider Execution**: Tool outputs (copy, images, code analysis) are simulated. The pipeline selects providers and simulates their output.
**[SIM] Payment Settlement**: EIP-712 signing is real, but on-chain USDC transfer is simulated. No real money moves.
**[SIM] Wallet Balance**: The $${ws.wallet?.balance.toFixed(2) || "50"} is an in-memory counter, not on-chain USDC.

**[TESTNET] On-Chain Wallet**: The user's connected wallet reads real USDC balance from Base Sepolia testnet.

CRITICAL RULES:
- NEVER claim a feature is real if it is simulated
- NEVER invent URLs that don't exist
- NEVER claim the deployed site has features (real-time status, interactive menu, etc.) that the generated HTML template doesn't actually contain
- When reporting deployment results, say exactly what was deployed: "A static landing page with hero, features section, and CTA"
- Always include [REAL], [SIM], or [TESTNET] labels when reporting what happened
- The generated sites are TEMPLATES with placeholder content. They look good but don't have custom functionality like ordering systems or real-time status.

IMPORTANT: When deployment succeeds, the result includes a REAL live URL (like https://projectname-abc123.vercel.app). Always share this URL with the user prominently. This is a real site anyone can visit.

When a user wants to "ship", "deploy", "host", "launch", "buy a domain", or "register a domain", include deployment and/or domain stages in the plan.

## PIPELINE FEATURES
The execution pipeline includes these advanced capabilities:
- **Automatic Retry**: If a provider fails (execution error, payment failure, or governance block), the pipeline automatically tries the next-best provider. Up to 3 attempts per stage.
- **Quality Gate**: After each stage, output is scored on detail, quantitative data, and actionable insights. If quality falls below 6.5/10, the pipeline escalates to a higher-quality (usually pricier) provider automatically.
- **Cost Tracking**: Real-time running totals tracked per stage, including retry spend and quality-rerun spend. You'll see exact cost breakdowns in the execution results.
- **Timing Data**: Each stage records actual execution time and total stage time (including retries). Use this to give accurate performance summaries.

When relaying execution results, always mention: quality scores, retry attempts (if any), cost breakdown, and timing.

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

## POST-EXECUTION DEBRIEF (CRITICAL)
After EVERY pipeline execution completes, you MUST provide a detailed debrief with these sections:

### 1. Execution Summary
- Stages completed, total cost, total time
- Any retries that happened and why
- Quality scores per stage

### 2. What Worked Well
- Which providers delivered strong results (cite quality scores)
- Cost efficiency analysis: was the spend justified?
- Any stages that came in under budget or over quality expectations

### 3. What Could Be Improved
- Any stages with quality scores below 8/10 — what was missing
- If retries happened, note the provider that failed and why
- Cost optimization opportunities (e.g., "Stage 2 used Claude Opus at $0.015 but Llama 4 at $0.002 could have worked for this task")

### 4. Suggested Next Actions (with specific costs)
- Always offer 3-5 concrete next steps with dollar amounts
- Examples: "Run A/B test on copy ($0.030)", "Generate social media kit ($0.048)", "Deploy to custom domain ($0.105)"
- If a site was deployed, suggest: analytics setup, SEO optimization, content updates
- Reference the remaining wallet balance and what it can still cover

IMPORTANT RULES:
- NEVER execute without explicit user approval. Always show the plan table first.
- If the user says "no" or "change X", adjust the plan and re-propose.
- Be specific about costs. Show exact dollar amounts for each stage.
- Reference governance policies when relevant ("this stays under the $2.00/tx limit")
- After execution, always give the full debrief as described above.
- Remember everything. Reference previous results, decisions, and execution history.
- Be concise. No filler. Think like a senior PM at Stripe.
- When discussing tools, cite specific providers and their tradeoffs.
- If asked about your wallet, policies, or capabilities, give real details from above.
- If user mentions hosting on their domain, ask for the domain name and note it for deployment.
- If user says "host on larp.click", use the subdomain format: projectname.larp.click`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, sessionId = "default", budget = 5, priority = "balanced", approvalResponse } = body as {
    message: string; sessionId?: string; budget?: number; priority?: string;
    approvalResponse?: { approvalId: string; approved: boolean };
  };

  // Handle approval responses
  if (approvalResponse) {
    const { resolveApproval } = await import("@/lib/governance");
    resolveApproval(approvalResponse.approvalId, approvalResponse.approved);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const msg = approvalResponse.approved
          ? "Approval granted. Continuing pipeline execution..."
          : "Approval denied. Pipeline halted. No payment was made.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text_delta", data: { text: msg } })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const history = getConvo(sessionId);
    history.push({ role: "assistant", content: approvalResponse.approved ? "Approval granted." : "Approval denied. Pipeline halted." });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  }

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
        const systemPrompt = buildSystemPrompt(sessionId);
        const messages = history.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Stream the Claude response
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
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
          const pipelineResult = await executePipeline(brief, config, (ev: StreamEvent) => {
            pipelineEvents.push(ev);
            send("stage_event", ev);
          });

          // Check if pipeline halted for approval
          if (pipelineResult.pendingApprovalId) {
            send("pipeline_paused", {
              approvalId: pipelineResult.pendingApprovalId,
              completedStages: pipelineResult.steps.length,
              spent: pipelineResult.totalCost,
            });
            history.push({ role: "assistant", content: `[Pipeline paused: awaiting approval for stage ${(pipelineResult.pendingStageIndex ?? 0) + 1}. Spent $${pipelineResult.totalCost.toFixed(4)} so far.]` });
            // Don't emit execution_complete - pipeline is paused
          }

          const done = pipelineEvents.find(e => e.type === "complete");
          if (done) {
            const cd = done.data as Record<string, unknown>;

            // Build detailed result summaries with quality scores, timing, and retry info
            const resultDetails = pipelineEvents
              .filter(e => e.type === "result")
              .map(e => {
                const d = e.data as Record<string, unknown>;
                const attempts = (d.attempts as number) || 1;
                const qualityScore = d.qualityScore as number | undefined;
                const execTime = d.executionTimeMs as number | undefined;
                const stageTime = d.totalStageTimeMs as number | undefined;
                let line = `[${d.stageName}] via ${d.provider} ($${(d.cost as number)?.toFixed(3)})`;
                if (qualityScore !== undefined) line += ` | quality: ${qualityScore}/10`;
                if (execTime !== undefined) line += ` | exec: ${execTime}ms`;
                if (stageTime !== undefined) line += ` | total: ${stageTime}ms`;
                if (attempts > 1) line += ` | attempts: ${attempts}`;
                line += `\n  Output: ${(d.output as string)?.slice(0, 300)}`;
                return line;
              })
              .join("\n\n");

            // Extract retry events for the debrief context
            const retryEvents = pipelineEvents
              .filter(e => e.type === "retry")
              .map(e => {
                const d = e.data as Record<string, unknown>;
                return `Retry on stage "${d.stageId}": ${d.message}`;
              });

            // Extract quality gate results
            const qualityGates = pipelineEvents
              .filter(e => e.type === "quality_gate")
              .map(e => {
                const d = e.data as Record<string, unknown>;
                return `${d.provider}: ${d.score}/10 (${d.passed ? "PASSED" : "FAILED"}) — ${d.feedback}`;
              });

            // Extract cost breakdown
            const costBreakdown = cd.costBreakdown as Record<string, unknown> | undefined;
            let costSection = "";
            if (costBreakdown) {
              costSection = `\nCost breakdown: total=$${(costBreakdown.totalSpent as number)?.toFixed(4)}, retry spend=$${(costBreakdown.retrySpend as number)?.toFixed(4)}, quality rerun spend=$${(costBreakdown.qualityRerunSpend as number)?.toFixed(4)}`;
            }

            // Extract deployed URLs for session tracking
            const deployedUrls: string[] = [];
            pipelineEvents.filter(e => e.type === "result").forEach(e => {
              const d = e.data as Record<string, unknown>;
              const output = d.output as string || "";
              const urlMatches = output.match(/(?:Local URL|Vercel URL|URL): (https?:\/\/[^\s]+)/g);
              if (urlMatches) {
                urlMatches.forEach(m => {
                  const url = m.replace(/^(?:Local URL|Vercel URL|URL): /, "");
                  deployedUrls.push(url);
                });
              }
            });

            // Track this execution in session history
            const execProviders = pipelineEvents
              .filter(e => e.type === "result")
              .map(e => (e.data as Record<string, unknown>).provider as string);
            const execRecord: SessionExecution = {
              brief,
              stagesCompleted: cd.totalSteps as number,
              totalCost: cd.totalCost as number,
              providers: execProviders,
              deployedUrls,
              timestamp: new Date().toISOString(),
            };
            getSessionExecs(sessionId).push(execRecord);

            const executionSummary = [
              `[Execution complete: ${cd.totalSteps} stages, $${(cd.totalCost as number)?.toFixed(4)} spent, $${(cd.walletBalance as number)?.toFixed(4)} remaining, ${(cd.pipelineDurationMs as number) || 0}ms total]`,
              costSection,
              `\n--- Stage Results ---\n${resultDetails}`,
              retryEvents.length > 0 ? `\n--- Retries ---\n${retryEvents.join("\n")}` : "",
              qualityGates.length > 0 ? `\n--- Quality Gates ---\n${qualityGates.join("\n")}` : "",
              deployedUrls.length > 0 ? `\n--- Deployed Sites ---\n${deployedUrls.join("\n")}` : "",
            ].filter(Boolean).join("\n");

            history.push({ role: "assistant", content: executionSummary });
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
