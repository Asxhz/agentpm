// ============================================================
// AgentPay Router - Multi-Agent Economy Simulation (Track 4)
// Multiple agents with OWS wallets trading services
// ============================================================

import { StreamEvent } from "./types";
import { executeX402Payment } from "./payment";

export interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  walletAddress: string;
  balance: number;
  specialty: string;
  pricePerCall: number;
  earnings: number;
  tasksCompleted: number;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: "request" | "quote" | "payment" | "delivery" | "broadcast";
  content: string;
  amount?: number;
  timestamp: string;
}

export interface EconomyState {
  agents: Agent[];
  messages: AgentMessage[];
  totalTransactions: number;
  totalVolume: number;
}

function genAddr(): string {
  const hex = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++) addr += hex[Math.floor(Math.random() * 16)];
  return addr;
}

// Initialize the agent economy
function createAgentEconomy(): Agent[] {
  return [
    {
      id: "orchestrator",
      name: "OrchestratorAI",
      role: "Task Coordinator",
      emoji: "ORCH",
      walletAddress: genAddr(),
      balance: 5.0,
      specialty: "Decomposes complex tasks and coordinates specialist agents",
      pricePerCall: 0,
      earnings: 0,
      tasksCompleted: 0,
    },
    {
      id: "writer",
      name: "WriterBot",
      role: "Content Specialist",
      emoji: "WRT",
      walletAddress: genAddr(),
      balance: 0,
      specialty: "Marketing copy, blog posts, product descriptions",
      pricePerCall: 0.01,
      earnings: 0,
      tasksCompleted: 0,
    },
    {
      id: "designer",
      name: "DesignerBot",
      role: "Visual Specialist",
      emoji: "DSN",
      walletAddress: genAddr(),
      balance: 0,
      specialty: "Product images, banners, logos, illustrations",
      pricePerCall: 0.05,
      earnings: 0,
      tasksCompleted: 0,
    },
    {
      id: "translator",
      name: "TranslatorBot",
      role: "Localization Specialist",
      emoji: "I18N",
      walletAddress: genAddr(),
      balance: 0,
      specialty: "Multi-language translation with cultural adaptation",
      pricePerCall: 0.008,
      earnings: 0,
      tasksCompleted: 0,
    },
    {
      id: "analyst",
      name: "AnalystBot",
      role: "Data Specialist",
      emoji: "DATA",
      walletAddress: genAddr(),
      balance: 0,
      specialty: "Market research, pricing analysis, competitive intel",
      pricePerCall: 0.03,
      earnings: 0,
      tasksCompleted: 0,
    },
    {
      id: "auditor",
      name: "AuditorBot",
      role: "Quality Assurance",
      emoji: "QA",
      walletAddress: genAddr(),
      balance: 0,
      specialty: "Reviews output quality, checks for errors, ensures consistency",
      pricePerCall: 0.015,
      earnings: 0,
      tasksCompleted: 0,
    },
  ];
}

type EventEmitter = (event: StreamEvent) => void;

function emit(emitter: EventEmitter, type: StreamEvent["type"], data: unknown) {
  emitter({ type, timestamp: new Date().toISOString(), data });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Task plans for different scenarios
interface TaskPlan {
  steps: {
    agentId: string;
    task: string;
    output: string;
    dependsOn?: string;
  }[];
}

const TASK_PLANS: Record<string, TaskPlan> = {
  "launch-campaign": {
    steps: [
      {
        agentId: "analyst",
        task: "Research target market demographics and competitor messaging strategies",
        output: "Market analysis: Target audience is tech-savvy professionals 25-40. Competitors focus on price; opportunity to differentiate on UX and reliability. Recommended tone: confident, modern, data-driven.",
      },
      {
        agentId: "writer",
        task: "Write product launch copy based on market research",
        output: "Headline: 'Ship Faster, Break Nothing.' Body: 3 paragraphs of launch copy with 5 key benefit bullets and a CTA. Tone: confident-professional. Flesch-Kincaid: Grade 9.",
        dependsOn: "analyst",
      },
      {
        agentId: "designer",
        task: "Create hero image and social media visuals for launch",
        output: "Generated 4 assets: 1x hero banner (1920x1080), 2x social cards (1200x630), 1x product screenshot with annotation overlay. Style: dark mode, gradient accents, clean typography.",
        dependsOn: "writer",
      },
      {
        agentId: "translator",
        task: "Translate launch copy to Spanish, French, and Japanese",
        output: "3 translations completed. ES: marketing-optimized (not literal). FR: formal register for EU market. JA: adapted cultural references. All preserve CTA urgency.",
        dependsOn: "writer",
      },
      {
        agentId: "auditor",
        task: "Review all deliverables for quality and brand consistency",
        output: "QA Pass: All assets meet brand guidelines. Copy score: 9.2/10. Visual consistency: strong. Translation accuracy: 96% (BLEU). 1 minor suggestion: strengthen FR CTA verb.",
        dependsOn: "designer",
      },
    ],
  },
  "competitive-intel": {
    steps: [
      {
        agentId: "analyst",
        task: "Scrape and analyze top 5 competitor pricing pages",
        output: "Pricing analysis complete. Competitor A: $29/49/99/mo. Competitor B: $19/39/79/mo. Competitor C: usage-based $0.01/req. Average: $45/mo mid-tier. Your pricing headroom: $35-55/mo.",
      },
      {
        agentId: "writer",
        task: "Generate competitive comparison document",
        output: "5-page competitive teardown: feature matrix, pricing comparison, SWOT for each competitor, recommended positioning strategy, talking points for sales team.",
        dependsOn: "analyst",
      },
      {
        agentId: "auditor",
        task: "Fact-check claims and verify data accuracy",
        output: "Audit complete: 47 claims checked, 45 verified accurate, 2 flagged for recheck (Competitor B's enterprise pricing may have changed). Confidence: 96%.",
        dependsOn: "writer",
      },
    ],
  },
  "ecommerce-listing": {
    steps: [
      {
        agentId: "writer",
        task: "Write SEO-optimized product descriptions for 3 products",
        output: "3 product descriptions generated. Each: 150-word description, 5 bullet points, meta title, meta description. Target keywords integrated. Readability: Grade 7.",
      },
      {
        agentId: "designer",
        task: "Generate product photography for each listing",
        output: "9 images generated: 3 per product (hero, lifestyle, detail). White background, studio lighting, 2000x2000px. Marketplace-compliant aspect ratios.",
        dependsOn: "writer",
      },
      {
        agentId: "translator",
        task: "Localize listings for German and Japanese markets",
        output: "6 listing translations completed (3 products x 2 languages). DE: formal product language, metric units. JA: adapted sizing references, honorific style.",
        dependsOn: "writer",
      },
      {
        agentId: "analyst",
        task: "Recommend pricing based on market analysis",
        output: "Pricing recommendations: Product A: $34.99 (15% below avg competitor). Product B: $89.99 (premium positioning). Product C: $19.99 (penetration pricing). Expected margin: 62% avg.",
        dependsOn: "designer",
      },
    ],
  },
};

// Run the multi-agent economy simulation
export async function runMultiAgentEconomy(
  scenario: string,
  onEvent: EventEmitter
): Promise<EconomyState> {
  const agents = createAgentEconomy();
  const messages: AgentMessage[] = [];
  let totalTx = 0;
  let totalVol = 0;

  const plan = TASK_PLANS[scenario] || TASK_PLANS["launch-campaign"];
  const orchestrator = agents.find((a) => a.id === "orchestrator")!;

  // System init
  emit(onEvent, "system", {
    message: "Multi-Agent Economy initialized",
    agentCount: agents.length,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      emoji: a.emoji,
      wallet: a.walletAddress.slice(0, 10) + "...",
      balance: a.balance,
      pricePerCall: a.pricePerCall,
    })),
  });

  await delay(500);

  // Orchestrator broadcasts task
  emit(onEvent, "thinking", {
    message: `${orchestrator.emoji} ${orchestrator.name}: Decomposing task into ${plan.steps.length} sub-tasks`,
    agent: orchestrator.name,
    stepCount: plan.steps.length,
  });

  await delay(400);

  // Execute each step
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const agent = agents.find((a) => a.id === step.agentId)!;

    // Orchestrator requests work
    const requestMsg: AgentMessage = {
      from: orchestrator.name,
      to: agent.name,
      type: "request",
      content: step.task,
      timestamp: new Date().toISOString(),
    };
    messages.push(requestMsg);

    emit(onEvent, "discovery", {
      message: `${orchestrator.emoji} > ${agent.emoji} ${agent.name}: "${step.task.slice(0, 80)}..."`,
      from: orchestrator.name,
      to: agent.name,
      task: step.task,
    });

    await delay(300);

    // Agent sends quote
    const quoteMsg: AgentMessage = {
      from: agent.name,
      to: orchestrator.name,
      type: "quote",
      content: `Quote: $${agent.pricePerCall.toFixed(4)} for ${agent.specialty.split(",")[0].toLowerCase()}`,
      amount: agent.pricePerCall,
      timestamp: new Date().toISOString(),
    };
    messages.push(quoteMsg);

    emit(onEvent, "evaluation", {
      message: `${agent.emoji} ${agent.name} quotes $${agent.pricePerCall.toFixed(4)}`,
      agent: agent.name,
      price: agent.pricePerCall,
      specialty: agent.specialty,
    });

    await delay(200);

    // Orchestrator pays
    const payment = executeX402Payment(
      orchestrator.walletAddress,
      agent.walletAddress,
      agent.pricePerCall,
      `${orchestrator.name} > ${agent.name}: ${step.task.slice(0, 50)}`,
      "base-sepolia"
    );

    orchestrator.balance -= agent.pricePerCall;
    agent.balance += agent.pricePerCall;
    agent.earnings += agent.pricePerCall;
    totalTx++;
    totalVol += agent.pricePerCall;

    const paymentMsg: AgentMessage = {
      from: orchestrator.name,
      to: agent.name,
      type: "payment",
      content: `Paid $${agent.pricePerCall.toFixed(4)} via x402`,
      amount: agent.pricePerCall,
      timestamp: new Date().toISOString(),
    };
    messages.push(paymentMsg);

    emit(onEvent, "payment", {
      message: `${orchestrator.emoji} pays ${agent.emoji} $${agent.pricePerCall.toFixed(4)} via x402`,
      from: orchestrator.name,
      fromWallet: orchestrator.walletAddress,
      to: agent.name,
      toWallet: agent.walletAddress,
      amount: agent.pricePerCall,
      txHash: payment.settlement.txHash,
      orchestratorBalance: orchestrator.balance,
      agentBalance: agent.balance,
    });

    await delay(300);

    // Agent delivers work
    emit(onEvent, "execution", {
      message: `${agent.emoji} ${agent.name} executing...`,
      agent: agent.name,
    });

    await delay(500);

    agent.tasksCompleted++;

    const deliveryMsg: AgentMessage = {
      from: agent.name,
      to: orchestrator.name,
      type: "delivery",
      content: step.output,
      timestamp: new Date().toISOString(),
    };
    messages.push(deliveryMsg);

    emit(onEvent, "result", {
      message: `${agent.emoji} ${agent.name} delivered`,
      agent: agent.name,
      output: step.output,
      cost: agent.pricePerCall,
      txHash: payment.settlement.txHash,
    });

    await delay(200);
  }

  // Final economy state
  emit(onEvent, "complete", {
    message: "Multi-agent task complete",
    totalTransactions: totalTx,
    totalVolume: totalVol,
    agents: agents.map((a) => ({
      name: a.name,
      emoji: a.emoji,
      balance: Math.round(a.balance * 10000) / 10000,
      earnings: Math.round(a.earnings * 10000) / 10000,
      tasksCompleted: a.tasksCompleted,
    })),
  });

  return {
    agents,
    messages,
    totalTransactions: totalTx,
    totalVolume: totalVol,
  };
}
