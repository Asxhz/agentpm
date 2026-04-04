// agent-model.ts — Delegated agent model for the AgentPM governance system.
// Each project execution creates sub-agents with their own budgets,
// allowed categories, and lifecycle state.

export type AgentLifecycle =
  | "created"
  | "active"
  | "constrained"
  | "escalated"
  | "completed"
  | "revoked";

export interface DelegatedAgent {
  id: string;
  role: string;
  delegatedBudget: number;
  spent: number;
  allowedCategories: string[];
  trustScore: number;
  lifecycle: AgentLifecycle;
  tasksCompleted: number;
  tasksFailed: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface AgentDelegation {
  projectId: string;
  overseerBudget: number;
  agents: DelegatedAgent[];
  createdAt: string;
}

// -------------------------------------------------------------------
// Agent blueprint used during delegation creation
// -------------------------------------------------------------------

interface AgentBlueprint {
  role: string;
  budgetPct: number;
  categories: string[];
}

const AGENT_BLUEPRINTS: AgentBlueprint[] = [
  { role: "Research Agent", budgetPct: 0.12, categories: ["web-scraping", "data-processing"] },
  { role: "Content Agent", budgetPct: 0.20, categories: ["text-generation"] },
  { role: "Design Agent",  budgetPct: 0.30, categories: ["image-generation"] },
  { role: "Deploy Agent",  budgetPct: 0.25, categories: ["deployment", "domain"] },
  { role: "QA Agent",      budgetPct: 0.13, categories: ["code-analysis"] },
];

// -------------------------------------------------------------------
// createDelegation
// -------------------------------------------------------------------

export function createDelegation(projectBudget: number): AgentDelegation {
  const now = new Date().toISOString();

  const agents: DelegatedAgent[] = AGENT_BLUEPRINTS.map((bp) => ({
    id: crypto.randomUUID(),
    role: bp.role,
    delegatedBudget: Math.round(projectBudget * bp.budgetPct * 100) / 100,
    spent: 0,
    allowedCategories: [...bp.categories],
    trustScore: 70,
    lifecycle: "created" as AgentLifecycle,
    tasksCompleted: 0,
    tasksFailed: 0,
    createdAt: now,
    lastActivityAt: now,
  }));

  return {
    projectId: crypto.randomUUID(),
    overseerBudget: projectBudget,
    agents,
    createdAt: now,
  };
}

// -------------------------------------------------------------------
// getAgentForCategory
// -------------------------------------------------------------------

export function getAgentForCategory(
  delegation: AgentDelegation,
  category: string,
): DelegatedAgent | null {
  return (
    delegation.agents.find((a) => a.allowedCategories.includes(category)) ??
    null
  );
}

// -------------------------------------------------------------------
// checkAgentBudget
// -------------------------------------------------------------------

export function checkAgentBudget(
  agent: DelegatedAgent,
  amount: number,
): { allowed: boolean; reason?: string; remainingBudget: number } {
  const remaining = agent.delegatedBudget - agent.spent;

  if (agent.lifecycle === "revoked") {
    return { allowed: false, reason: "Agent has been revoked", remainingBudget: remaining };
  }

  if (amount > remaining) {
    return {
      allowed: false,
      reason: `Insufficient budget: requested $${amount.toFixed(2)} but only $${remaining.toFixed(2)} remains`,
      remainingBudget: remaining,
    };
  }

  return { allowed: true, remainingBudget: remaining };
}

// -------------------------------------------------------------------
// recordAgentSpend
// -------------------------------------------------------------------

export function recordAgentSpend(agent: DelegatedAgent, amount: number): void {
  agent.spent = Math.round((agent.spent + amount) * 100) / 100;
  agent.lastActivityAt = new Date().toISOString();

  // If agent has spent > 80% of its budget, constrain it
  if (agent.spent > agent.delegatedBudget * 0.8) {
    agent.lifecycle = "constrained";
  }
}

// -------------------------------------------------------------------
// updateAgentLifecycle
// -------------------------------------------------------------------

export function updateAgentLifecycle(
  agent: DelegatedAgent,
  newState: AgentLifecycle,
): void {
  agent.lifecycle = newState;
  agent.lastActivityAt = new Date().toISOString();
}

// -------------------------------------------------------------------
// recordTaskSuccess / recordTaskFailure (internal helpers)
// -------------------------------------------------------------------

export function recordTaskSuccess(agent: DelegatedAgent): void {
  agent.tasksCompleted += 1;
  agent.trustScore = Math.min(100, agent.trustScore + 5);
  agent.lastActivityAt = new Date().toISOString();
}

export function recordTaskFailure(agent: DelegatedAgent): void {
  agent.tasksFailed += 1;
  agent.trustScore = Math.max(0, agent.trustScore - 10);
  agent.lastActivityAt = new Date().toISOString();

  // If trust drops below 40, revoke the agent
  if (agent.trustScore < 40) {
    agent.lifecycle = "revoked";
  }
}

// -------------------------------------------------------------------
// getAgentSummary
// -------------------------------------------------------------------

export function getAgentSummary(delegation: AgentDelegation): {
  totalDelegated: number;
  totalSpent: number;
  activeAgents: number;
  constrainedAgents: number;
} {
  let totalDelegated = 0;
  let totalSpent = 0;
  let activeAgents = 0;
  let constrainedAgents = 0;

  for (const agent of delegation.agents) {
    totalDelegated += agent.delegatedBudget;
    totalSpent += agent.spent;
    if (agent.lifecycle === "active") activeAgents++;
    if (agent.lifecycle === "constrained") constrainedAgents++;
  }

  return {
    totalDelegated: Math.round(totalDelegated * 100) / 100,
    totalSpent: Math.round(totalSpent * 100) / 100,
    activeAgents,
    constrainedAgents,
  };
}
