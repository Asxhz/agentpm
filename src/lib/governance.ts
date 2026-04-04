// ============================================================
// AgentPM - Governance Engine
// The core operating model. Every payment goes through here.
// 5 verdicts: APPROVED, DENIED, ESCALATE, DOWNGRADE, REROUTE
// ============================================================

export type PolicyVerdict = "APPROVED" | "DENIED" | "ESCALATE" | "DOWNGRADE" | "REROUTE";

export interface PolicyRule {
  type: "max_per_tx" | "max_daily" | "allowed_chains" | "allowed_categories" | "require_approval" | "rate_limit" | "blocked_providers" | "max_session_budget";
  value: unknown;
}

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
  createdAt: string;
  active: boolean;
}

export interface PolicyDecision {
  verdict: PolicyVerdict;
  violations: { policy: string; rule: string; message: string }[];
  requiresHumanApproval: boolean;
  approvalReason?: string;
  suggestedAction?: {
    type: "downgrade_provider" | "reroute_network" | "reduce_amount" | "skip_stage";
    detail: string;
  };
  budgetImpact: {
    currentSpend: number;
    projectedSpend: number;
    sessionBudget: number;
    percentUsed: number;
    remaining: number;
    dailySpend: number;
    dailyLimit: number;
  };
  riskScore: number; // 0-100
}

export interface PendingApproval {
  id: string;
  sessionId: string;
  stageId: string;
  stageName: string;
  provider: string;
  amount: number;
  category: string;
  decision: PolicyDecision;
  createdAt: string;
  status: "pending" | "approved" | "denied";
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: PolicyVerdict;
  amount: number;
  provider: string;
  stageName: string;
  riskScore: number;
}

interface GovernanceState {
  policies: Policy[];
  auditLog: TimelineEvent[];
  dailySpend: number;
  dailyTxCount: number;
  dayStart: string;
}

// State
let state: GovernanceState = { policies: [], auditLog: [], dailySpend: 0, dailyTxCount: 0, dayStart: new Date().toISOString().split("T")[0] };
let strictMode = false;

export function setStrictMode(enabled: boolean) { strictMode = enabled; }
export function getStrictMode() { return strictMode; }
const pendingApprovals = new Map<string, PendingApproval>();

function genId(): string { return Math.random().toString(36).slice(2, 10); }

// Initialize default policies
export function initGovernance() {
  if (state.policies.length > 0) return state;
  state.policies = [
    {
      id: "spending-limits",
      name: "Spending Limits",
      rules: [
        { type: "max_per_tx", value: 2.00 },
        { type: "max_daily", value: 20.00 },
        { type: "rate_limit", value: 100 },
      ],
      createdAt: new Date().toISOString(),
      active: true,
    },
    {
      id: "chain-restrictions",
      name: "Chain Restrictions",
      rules: [
        { type: "allowed_chains", value: ["base-sepolia", "base"] },
        {
          type: "allowed_categories",
          value: ["image-generation", "text-generation", "code-analysis", "translation", "data-processing", "web-scraping", "audio-generation", "deployment", "domain"],
        },
      ],
      createdAt: new Date().toISOString(),
      active: true,
    },
    {
      id: "escalation-policy",
      name: "Escalation Policy",
      rules: [{ type: "require_approval", value: 0.08 }],
      createdAt: new Date().toISOString(),
      active: true,
    },
  ];
  return state;
}

// Core: Evaluate a transaction and return a rich decision
export function evaluateTransaction(
  amount: number,
  category: string,
  network: string,
  providerName: string,
  sessionBudget: number,
  sessionSpent: number,
): PolicyDecision {
  // Reset daily counters if new day
  const today = new Date().toISOString().split("T")[0];
  if (today !== state.dayStart) { state.dailySpend = 0; state.dailyTxCount = 0; state.dayStart = today; }

  const violations: { policy: string; rule: string; message: string }[] = [];
  let requiresHumanApproval = false;
  let approvalReason: string | undefined;
  let suggestedAction: PolicyDecision["suggestedAction"] | undefined;

  for (const policy of state.policies) {
    if (!policy.active) continue;
    for (const rule of policy.rules) {
      switch (rule.type) {
        case "max_per_tx": {
          const max = rule.value as number;
          if (amount > max) violations.push({ policy: policy.name, rule: `max_per_tx: $${max}`, message: `$${amount.toFixed(4)} exceeds per-transaction limit of $${max.toFixed(2)}` });
          break;
        }
        case "max_daily": {
          const max = rule.value as number;
          if (state.dailySpend + amount > max) violations.push({ policy: policy.name, rule: `max_daily: $${max}`, message: `Daily spend would reach $${(state.dailySpend + amount).toFixed(4)}, exceeding $${max.toFixed(2)} limit` });
          break;
        }
        case "allowed_chains": {
          const chains = rule.value as string[];
          if (!chains.includes(network)) violations.push({ policy: policy.name, rule: "allowed_chains", message: `Network "${network}" not allowed. Permitted: ${chains.join(", ")}` });
          break;
        }
        case "allowed_categories": {
          const cats = rule.value as string[];
          if (!cats.includes(category)) violations.push({ policy: policy.name, rule: "allowed_categories", message: `Category "${category}" not permitted` });
          break;
        }
        case "rate_limit": {
          const limit = rule.value as number;
          if (state.dailyTxCount >= limit) violations.push({ policy: policy.name, rule: `rate_limit: ${limit}/day`, message: `Transaction count (${state.dailyTxCount}) reached daily limit of ${limit}` });
          break;
        }
        case "require_approval": {
          const threshold = strictMode ? 0.001 : (rule.value as number); // Strict mode: escalate everything
          if (amount >= threshold) {
            requiresHumanApproval = true;
            approvalReason = strictMode
              ? `Strict mode: all payments require approval ($${amount.toFixed(4)})`
              : `Amount $${amount.toFixed(4)} exceeds approval threshold of $${threshold.toFixed(2)}`;
          }
          break;
        }
        case "blocked_providers": {
          const blocked = rule.value as string[];
          if (blocked.includes(providerName)) violations.push({ policy: policy.name, rule: "blocked_providers", message: `Provider "${providerName}" is blocked` });
          break;
        }
      }
    }
  }

  // Session budget check (hard limit)
  const wouldExceedBudget = sessionSpent + amount > sessionBudget;
  if (wouldExceedBudget) {
    violations.push({ policy: "Session Budget", rule: `budget: $${sessionBudget}`, message: `Would spend $${(sessionSpent + amount).toFixed(4)} of $${sessionBudget.toFixed(2)} session budget` });
  }

  // Compute budget impact
  const budgetImpact: PolicyDecision["budgetImpact"] = {
    currentSpend: sessionSpent,
    projectedSpend: sessionSpent + amount,
    sessionBudget,
    percentUsed: Math.min(100, ((sessionSpent + amount) / sessionBudget) * 100),
    remaining: Math.max(0, sessionBudget - sessionSpent - amount),
    dailySpend: state.dailySpend + amount,
    dailyLimit: 20.00,
  };

  // Compute risk score (0-100)
  const perTxLimit = 2.00;
  const riskScore = Math.min(100, Math.round((amount / perTxLimit) * 40 + (budgetImpact.percentUsed * 0.6)));

  // Determine verdict
  let verdict: PolicyVerdict;

  if (violations.length > 0 && wouldExceedBudget) {
    verdict = "DENIED";
  } else if (violations.length > 0) {
    // Check if we can suggest a downgrade
    const perTxViolation = violations.find(v => v.rule.startsWith("max_per_tx"));
    if (perTxViolation && amount <= perTxLimit * 1.5) {
      verdict = "DOWNGRADE";
      suggestedAction = { type: "downgrade_provider", detail: `Reduce spending by switching to a cheaper provider (current: $${amount.toFixed(3)}, limit: $${perTxLimit.toFixed(2)})` };
    } else {
      verdict = "DENIED";
    }
  } else if (requiresHumanApproval) {
    verdict = "ESCALATE";
  } else {
    verdict = "APPROVED";
  }

  // Log to timeline
  state.auditLog.unshift({ id: genId(), timestamp: new Date().toISOString(), type: verdict, amount, provider: providerName, stageName: "", riskScore });
  if (state.auditLog.length > 50) state.auditLog.length = 50;

  return { verdict, violations, requiresHumanApproval, approvalReason, suggestedAction, budgetImpact, riskScore };
}

// Record a completed payment
export function recordPayment(amount: number) {
  state.dailySpend += amount;
  state.dailyTxCount += 1;
}

// Pending approvals
export function createApproval(sessionId: string, stageId: string, stageName: string, provider: string, amount: number, category: string, decision: PolicyDecision): PendingApproval {
  const approval: PendingApproval = { id: genId(), sessionId, stageId, stageName, provider, amount, category, decision, createdAt: new Date().toISOString(), status: "pending" };
  pendingApprovals.set(approval.id, approval);
  return approval;
}

export function resolveApproval(approvalId: string, approved: boolean): PendingApproval | null {
  const approval = pendingApprovals.get(approvalId);
  if (!approval) return null;
  approval.status = approved ? "approved" : "denied";
  pendingApprovals.set(approvalId, approval);
  return approval;
}

export function getPendingApprovals(sessionId: string): PendingApproval[] {
  return Array.from(pendingApprovals.values()).filter(a => a.sessionId === sessionId && a.status === "pending");
}

// State access
export function getGovernanceState() { return { ...state, pendingApprovals: Array.from(pendingApprovals.values()) }; }
export function getGovernanceTimeline(): TimelineEvent[] { return [...state.auditLog]; }

export function updatePolicy(policyId: string, updates: { active?: boolean }): Policy | null {
  const policy = state.policies.find(p => p.id === policyId);
  if (!policy) return null;
  if (updates.active !== undefined) policy.active = updates.active;
  return policy;
}

export function resetGovernance() {
  state = { policies: [], auditLog: [], dailySpend: 0, dailyTxCount: 0, dayStart: new Date().toISOString().split("T")[0] };
  pendingApprovals.clear();
  initGovernance();
}
