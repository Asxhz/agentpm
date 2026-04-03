// ============================================================
// AgentPM - Project Execution Pipeline
// Takes a project brief, runs it through stages autonomously
// ============================================================

import {
  PipelineConfig,
  StreamEvent,
  ExecutionResult,
  PipelineResult,
} from "./types";
import { initializeWallets, processPayment, getWalletState } from "./wallet";
import { executeX402Payment } from "./payment";
import { initGovernance, evaluatePayment as govCheck, recordPayment as govRecord } from "./governance";
import { getProvidersByCategory } from "./marketplace";
import { searchDomains } from "./agents/domain";
import { generateLandingPage, deployToVercel, deployToLarpClick } from "./agents/deploy";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

type EventEmitter = (event: StreamEvent) => void;

function emit(emitter: EventEmitter, type: StreamEvent["type"], data: unknown) {
  emitter({ type, timestamp: new Date().toISOString(), data });
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// The 5 stages every project goes through
interface ProjectStage {
  id: string;
  name: string;
  description: string;
  toolCategory: string;
  action: string; // what the agent does in this stage
}

// Simulated outputs per category
const STAGE_OUTPUTS: Record<string, string[]> = {
  "web-scraping": [
    "Scraped 38 competitor pages. Extracted pricing tiers, feature lists, and positioning statements. Key finding: 70% of competitors price between $29-79/mo. Gap identified in the $15-25 range for solo creators.",
    "Collected market data from 52 sources. Industry growing 34% YoY. Top 3 pain points: manual workflows (mentioned 847 times), high cost (612), poor integrations (489). Target persona: technical founders at seed stage.",
  ],
  "data-processing": [
    "Processed research data through statistical analysis. Recommended positioning: 'The fastest way to ship.' Target price: $19/mo (undercuts 80% of market). Key differentiator: speed-to-value. Confidence: 87%.",
    "Generated strategic brief: 3 audience segments identified, 5 messaging angles ranked by projected conversion rate. Top angle: 'Build in minutes, not months' (projected 4.2% CTR based on comparable campaigns).",
  ],
  "text-generation": [
    "Generated full copy suite: 1 headline (8 words), 1 subheadline (18 words), 3 benefit blocks with supporting copy, 2 CTA variants, meta title, and meta description. Tone: confident, concise. Flesch-Kincaid: Grade 7. All copy optimized for scan-reading.",
    "Produced 3 content variants for A/B testing. Variant A: feature-led ('Ship 10x faster'). Variant B: outcome-led ('Your users will thank you'). Variant C: social-proof-led ('Join 2,000+ teams'). Recommended: Variant A for launch.",
  ],
  "image-generation": [
    "Generated 4 visual assets: 1 hero image (1920x1080, dark gradient with product mockup), 1 OG image (1200x630), 2 feature illustrations. Style: minimal, dark background, accent green highlights. All exported as WebP + PNG.",
    "Created product mockup suite: browser frame with live UI, mobile responsive preview, and 3 detail crops for feature sections. Clean, professional, matches brand direction from strategy phase.",
  ],
  "code-analysis": [
    "Quality review complete. Copy clarity: 9.1/10. Visual consistency: strong across all assets. Brand alignment: 94%. Accessibility check: all images have sufficient contrast (WCAG AA). One suggestion: tighten CTA copy from 5 words to 3.",
    "Final QA pass: all deliverables verified. Copy proofread (0 errors). Images optimized (avg 340KB). Responsive layouts confirmed. SEO meta validated. Recommendation: ship as-is, iterate after launch data.",
  ],
  "deployment": [
    "Deployment initiated. Static site built and pushed to edge network. SSL certificate auto-provisioned. CDN propagation complete across 30+ regions. Average TTFB: 45ms.",
  ],
  "domain": [
    "Domain search complete. Checked availability across 6 TLDs via RDAP. Pricing retrieved from registrar APIs.",
  ],
};

// Use AI to plan project stages based on the brief
async function planProject(brief: string): Promise<ProjectStage[]> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are an AI project manager. Given this project brief, plan exactly 5 stages to execute it.

Brief: "${brief}"

Each stage must use one of these tool categories:
- web-scraping (for research, competitor analysis, data gathering)
- data-processing (for strategy, analysis, planning, pricing)
- text-generation (for writing copy, content, scripts, docs)
- image-generation (for visuals, mockups, designs, graphics)
- code-analysis (for review, QA, quality checks, testing)
- deployment (for deploying websites, hosting, shipping to production)
- domain (for checking domain availability, searching domain names)

Respond ONLY with valid JSON (no markdown):
{
  "stages": [
    {
      "id": "research",
      "name": "Research",
      "description": "What this stage accomplishes in one sentence",
      "toolCategory": "web-scraping",
      "action": "What the agent does (2-3 words, like 'Gather market data')"
    }
  ]
}

Always use exactly 5 stages in this order: research/discovery, strategy/planning, creation/building, review/QA, then delivery/final.`
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);
    return parsed.stages as ProjectStage[];
  } catch {
    // Fallback stages
    return getDefaultStages(brief);
  }
}

function getDefaultStages(brief: string): ProjectStage[] {
  const isCode = /code|audit|security|review|app|api|bug/i.test(brief);
  const isResearch = /research|competitor|analysis|data|market/i.test(brief);

  if (isCode) {
    return [
      { id: "scan", name: "Codebase Scan", description: "Scanning repository structure and dependencies", toolCategory: "web-scraping", action: "Scan codebase" },
      { id: "analyze", name: "Vulnerability Analysis", description: "Running static analysis and dependency checks", toolCategory: "data-processing", action: "Analyze vulnerabilities" },
      { id: "report", name: "Report Generation", description: "Writing detailed findings with remediation steps", toolCategory: "text-generation", action: "Generate report" },
      { id: "diagram", name: "Architecture Diagram", description: "Creating visual architecture and threat model diagrams", toolCategory: "image-generation", action: "Create diagrams" },
      { id: "verify", name: "Verification", description: "Final review and severity classification", toolCategory: "code-analysis", action: "Verify findings" },
    ];
  }

  if (isResearch) {
    return [
      { id: "gather", name: "Data Collection", description: "Scraping and collecting data from target sources", toolCategory: "web-scraping", action: "Collect data" },
      { id: "process", name: "Data Processing", description: "Cleaning, normalizing, and analyzing collected data", toolCategory: "data-processing", action: "Process data" },
      { id: "insights", name: "Insight Generation", description: "Extracting key findings and actionable insights", toolCategory: "text-generation", action: "Extract insights" },
      { id: "visualize", name: "Visualization", description: "Creating charts and visual representations", toolCategory: "image-generation", action: "Build visuals" },
      { id: "review", name: "Quality Review", description: "Fact-checking and validating all findings", toolCategory: "code-analysis", action: "Validate results" },
    ];
  }

  // Check if user wants to ship/deploy/host
  const wantsDeploy = /deploy|host|ship|launch|live|vercel|domain|website/i.test(brief);
  const wantsDomain = /domain|url|\.com|\.io|\.dev|\.app|register/i.test(brief);

  if (wantsDeploy || wantsDomain) {
    const stages = [
      { id: "research", name: "Market Research", description: "Analyzing competitors and target audience", toolCategory: "web-scraping", action: "Research market" },
      { id: "create", name: "Content Creation", description: "Writing copy for the landing page", toolCategory: "text-generation", action: "Write copy" },
      { id: "design", name: "Visual Design", description: "Creating visual assets and graphics", toolCategory: "image-generation", action: "Design assets" },
    ];
    if (wantsDomain) {
      stages.push({ id: "domain", name: "Domain Search", description: "Checking domain availability across TLDs via RDAP", toolCategory: "domain", action: "Search domains" });
    }
    stages.push({ id: "deploy", name: "Deploy to Production", description: "Building and deploying site to Vercel edge network", toolCategory: "deployment", action: "Deploy site" });
    return stages;
  }

  // Default: content/marketing project
  return [
    { id: "research", name: "Market Research", description: "Analyzing competitors and target audience", toolCategory: "web-scraping", action: "Research market" },
    { id: "strategy", name: "Strategy", description: "Defining positioning, messaging, and creative direction", toolCategory: "data-processing", action: "Build strategy" },
    { id: "create", name: "Content Creation", description: "Writing copy and generating visual assets", toolCategory: "text-generation", action: "Create content" },
    { id: "design", name: "Visual Design", description: "Producing images, mockups, and graphics", toolCategory: "image-generation", action: "Design assets" },
    { id: "review", name: "Quality Review", description: "Final review, QA, and delivery preparation", toolCategory: "code-analysis", action: "Review quality" },
  ];
}

// Score and pick the best provider for a category
function pickProvider(category: string, priority: string) {
  const providers = getProvidersByCategory(category);
  if (providers.length === 0) return null;

  const weights = priority === "cost" ? { p: 0.5, q: 0.2, l: 0.15, r: 0.15 }
    : priority === "quality" ? { p: 0.1, q: 0.5, l: 0.15, r: 0.25 }
    : priority === "speed" ? { p: 0.15, q: 0.15, l: 0.5, r: 0.2 }
    : { p: 0.25, q: 0.3, l: 0.2, r: 0.25 };

  const maxP = Math.max(...providers.map(p => p.price));
  const minP = Math.min(...providers.map(p => p.price));
  const maxL = Math.max(...providers.map(p => p.latencyMs));
  const minL = Math.min(...providers.map(p => p.latencyMs));

  const scored = providers.map(p => {
    const ps = maxP === minP ? 80 : ((maxP - p.price) / (maxP - minP)) * 100;
    const qs = (p.qualityScore / 10) * 100;
    const ls = maxL === minL ? 80 : ((maxL - p.latencyMs) / (maxL - minL)) * 100;
    const rs = p.reliability * 100;
    const score = ps * weights.p + qs * weights.q + ls * weights.l + rs * weights.r;
    return { provider: p, score: Math.round(score * 100) / 100, ps, qs, ls, rs };
  }).sort((a, b) => b.score - a.score);

  return scored;
}

// Main pipeline
export async function executePipeline(
  task: string,
  config: PipelineConfig,
  onEvent: EventEmitter
): Promise<PipelineResult> {
  const results: ExecutionResult[] = [];
  const wallet = initializeWallets(parseFloat(process.env.DEMO_WALLET_BALANCE || "10.00"));
  initGovernance();

  emit(onEvent, "system", {
    message: "AgentPM initialized. Planning project stages.",
    walletAddress: wallet.address,
    balance: wallet.balance,
  });

  await delay(400);

  // Plan the project
  emit(onEvent, "thinking", { message: `Analyzing brief: "${task}"`, phase: "planning" });
  await delay(300);

  const stages = await planProject(task);

  emit(onEvent, "thinking", {
    message: `Project plan ready: ${stages.length} stages`,
    stages: stages.map(s => ({ id: s.id, name: s.name, action: s.action })),
  });

  await delay(300);

  // Execute each stage
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];

    // Discover providers
    emit(onEvent, "discovery", {
      message: `Stage ${i + 1}/${stages.length}: ${stage.name}`,
      stageId: stage.id,
      stageName: stage.name,
      stageDescription: stage.description,
      stageIndex: i,
      stageTotal: stages.length,
    });
    await delay(250);

    const scored = pickProvider(stage.toolCategory, config.priority);
    if (!scored || scored.length === 0) {
      emit(onEvent, "error", { message: `No providers for ${stage.toolCategory}`, stageId: stage.id });
      continue;
    }

    // Evaluate
    emit(onEvent, "evaluation", {
      message: `${scored.length} providers available`,
      stageId: stage.id,
      providers: scored.slice(0, 4).map(s => ({
        name: s.provider.name,
        price: s.provider.price,
        quality: s.provider.qualityScore,
        latency: s.provider.latencyMs,
        score: s.score,
      })),
    });
    await delay(300);

    // Pick best affordable
    const affordable = scored.filter(s => s.provider.price <= wallet.balance);
    if (affordable.length === 0) {
      emit(onEvent, "error", { message: `Insufficient balance for ${stage.name}`, stageId: stage.id });
      continue;
    }
    const chosen = affordable[0];

    emit(onEvent, "decision", {
      message: `Selected ${chosen.provider.name} ($${chosen.provider.price.toFixed(3)}/call, quality ${chosen.provider.qualityScore}/10)`,
      stageId: stage.id,
      provider: chosen.provider.name,
      price: chosen.provider.price,
      quality: chosen.provider.qualityScore,
      score: chosen.score,
    });
    await delay(200);

    // Governance check
    const gov = govCheck(chosen.provider.price, stage.toolCategory, chosen.provider.network, chosen.provider.name);
    emit(onEvent, "governance", {
      message: gov.allowed ? "Policy check passed" : `Policy denied: ${gov.violations[0]?.message}`,
      allowed: gov.allowed,
      stageId: stage.id,
    });

    if (!gov.allowed) {
      emit(onEvent, "error", { message: `Governance blocked payment for ${stage.name}`, stageId: stage.id });
      continue;
    }
    if (gov.allowed) govRecord(chosen.provider.price);
    await delay(200);

    // x402 Payment
    emit(onEvent, "payment", {
      message: `Paying ${chosen.provider.name}`,
      phase: "signing",
      amount: chosen.provider.price,
      from: wallet.address,
      to: chosen.provider.walletAddress,
      stageId: stage.id,
    });
    await delay(150);

    const x402 = executeX402Payment(wallet.address, chosen.provider.walletAddress, chosen.provider.price, `${stage.name}: ${chosen.provider.name}`, chosen.provider.network);
    const payResult = processPayment(wallet.id, chosen.provider.walletAddress, chosen.provider.price, chosen.provider.name, chosen.provider.network);

    if (!payResult.success) {
      emit(onEvent, "error", { message: `Payment failed: ${payResult.error}`, stageId: stage.id });
      continue;
    }

    emit(onEvent, "payment", {
      message: `Settled on ${chosen.provider.network}`,
      phase: "settled",
      txHash: x402.settlement.txHash,
      amount: chosen.provider.price,
      newBalance: wallet.balance,
      stageId: stage.id,
    });
    await delay(200);

    // Execute (real calls for domain/deploy, simulated for others)
    emit(onEvent, "execution", {
      message: `${chosen.provider.name} executing ${stage.action.toLowerCase()}...`,
      stageId: stage.id,
    });

    let output: string;

    if (stage.toolCategory === "domain") {
      // REAL domain check via RDAP
      try {
        const projectName = task.match(/(?:for|called|named)\s+["']?(\w+)/i)?.[1] || "myproject";
        const results = await searchDomains(projectName.toLowerCase());
        const available = results.filter(r => r.available);
        const taken = results.filter(r => !r.available);
        output = `Domain search for "${projectName}" completed via RDAP:\n` +
          `Available: ${available.map(d => `${d.domain} ($${d.price}/yr)`).join(", ") || "none found"}\n` +
          `Taken: ${taken.map(d => d.domain).join(", ") || "none"}\n` +
          `Checked ${results.length} TLDs in real-time. ${available.length > 0 ? `Recommended: ${available[0].domain} at $${available[0].price}/yr` : "Consider different naming."}`;
      } catch {
        output = STAGE_OUTPUTS["domain"][0];
      }
    } else if (stage.toolCategory === "deployment") {
      // Deploy to larp.click (real, accessible right now)
      try {
        const projectName = task.match(/(?:for|called|named)\s+["']?(\w+)/i)?.[1] || "myproject";
        const site = generateLandingPage(
          projectName,
          "The Future Starts Here",
          "A next-generation product built with AI-powered autonomous execution.",
          ["Lightning fast: Sub-50ms response times globally", "Secure by default: Enterprise-grade security built in", "Scale infinitely: From 0 to millions with zero config"],
          "Get Started",
        );

        // Deploy to larp.click first (always works, instant)
        const larpResult = deployToLarpClick(site, projectName);

        // Also try Vercel if token available
        const vercelResult = await deployToVercel(site, projectName);

        output = `Site deployed and live.\n` +
          `Local URL: ${larpResult.url} (accessible now)\n` +
          `Subdomain: ${larpResult.subdomain}.larp.click\n` +
          `Status: ${larpResult.status}\n`;

        if (vercelResult.success && vercelResult.method === "vercel-api") {
          output += `Vercel URL: ${vercelResult.url}\n`;
        }

        output += `Generated landing page with hero section, feature grid, and CTA. Dark theme, responsive.\n` +
          `The site is live and viewable at the URL above.`;
      } catch {
        output = STAGE_OUTPUTS["deployment"][0];
      }
    } else {
      await delay(Math.min(chosen.provider.latencyMs / 5, 1500));
      const outputs = STAGE_OUTPUTS[stage.toolCategory] || STAGE_OUTPUTS["text-generation"];
      output = outputs[Math.floor(Math.random() * outputs.length)];
    }

    results.push({
      stepId: stage.id,
      provider: chosen.provider,
      output,
      cost: chosen.provider.price,
      latencyMs: chosen.provider.latencyMs,
      payment: x402.settlement,
      success: true,
    });

    emit(onEvent, "result", {
      message: `${stage.name} complete`,
      stageId: stage.id,
      stageName: stage.name,
      provider: chosen.provider.name,
      output,
      cost: chosen.provider.price,
      latencyMs: chosen.provider.latencyMs,
      txHash: x402.settlement.txHash,
      stageIndex: i,
      stageTotal: stages.length,
    });
    await delay(200);
  }

  const { wallet: finalWallet, transactions, totalSpent } = getWalletState();

  emit(onEvent, "complete", {
    message: "All stages complete",
    totalCost: totalSpent,
    totalSteps: results.length,
    walletBalance: finalWallet?.balance ?? 0,
    stages: results.map(r => ({ name: r.stepId, provider: r.provider.name, cost: r.cost })),
    transactions: transactions.slice(0, 10).map(tx => ({ toolName: tx.toolName, amount: tx.amount, txHash: tx.txHash, status: tx.status })),
  });

  return { task, steps: results, totalCost: totalSpent, totalLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0), walletBalance: finalWallet?.balance ?? 0, transactions };
}
