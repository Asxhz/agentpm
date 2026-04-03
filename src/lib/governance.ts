// ============================================================
// AgentPay Router - Governance & Policy Engine (Track 2)
// Spend control, chain restrictions, audit logs, approvals
// ============================================================

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
  createdAt: string;
  active: boolean;
}

export interface PolicyRule {
  type:
    | "max_per_tx"
    | "max_daily"
    | "allowed_chains"
    | "allowed_categories"
    | "require_approval"
    | "rate_limit"
    | "blocked_providers";
  value: unknown;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: "payment_attempt" | "payment_approved" | "payment_denied" | "policy_violation" | "policy_created" | "policy_updated" | "wallet_reset";
  details: Record<string, unknown>;
  policyId?: string;
  ruleFailed?: string;
}

export interface GovernanceState {
  policies: Policy[];
  auditLog: AuditEntry[];
  dailySpend: number;
  dailyTxCount: number;
  dayStart: string;
}

// In-memory governance state
let state: GovernanceState = {
  policies: [],
  auditLog: [],
  dailySpend: 0,
  dailyTxCount: 0,
  dayStart: new Date().toISOString().split("T")[0],
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function addAudit(
  action: AuditEntry["action"],
  details: Record<string, unknown>,
  policyId?: string,
  ruleFailed?: string
) {
  state.auditLog.unshift({
    id: genId(),
    timestamp: new Date().toISOString(),
    action,
    details,
    policyId,
    ruleFailed,
  });
  // Keep last 100 entries
  if (state.auditLog.length > 100) state.auditLog.length = 100;
}

// Initialize with default policies
export function initGovernance() {
  if (state.policies.length > 0) return state;

  state.policies = [
    {
      id: "default-safety",
      name: "Default Safety Policy",
      rules: [
        { type: "max_per_tx", value: 0.50 },
        { type: "max_daily", value: 5.00 },
        { type: "allowed_chains", value: ["base-sepolia", "base"] },
        { type: "rate_limit", value: 30 }, // max 30 tx/day
      ],
      createdAt: new Date().toISOString(),
      active: true,
    },
    {
      id: "category-restrict",
      name: "Category Restrictions",
      rules: [
        {
          type: "allowed_categories",
          value: [
            "image-generation",
            "text-generation",
            "code-analysis",
            "translation",
            "data-processing",
            "web-scraping",
            "audio-generation",
            "deployment",
            "domain",
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      active: true,
    },
    {
      id: "high-value-approval",
      name: "High-Value Approval Gate",
      rules: [{ type: "require_approval", value: 0.25 }],
      createdAt: new Date().toISOString(),
      active: true,
    },
  ];

  addAudit("policy_created", { message: "Default governance policies initialized", count: state.policies.length });

  return state;
}

// Check if a payment is allowed by all active policies
export function evaluatePayment(
  amount: number,
  category: string,
  network: string,
  providerName: string
): {
  allowed: boolean;
  violations: { policy: string; rule: string; message: string }[];
  requiresApproval: boolean;
  approvalReason?: string;
} {
  // Reset daily counters if new day
  const today = new Date().toISOString().split("T")[0];
  if (today !== state.dayStart) {
    state.dailySpend = 0;
    state.dailyTxCount = 0;
    state.dayStart = today;
  }

  const violations: { policy: string; rule: string; message: string }[] = [];
  let requiresApproval = false;
  let approvalReason: string | undefined;

  for (const policy of state.policies) {
    if (!policy.active) continue;

    for (const rule of policy.rules) {
      switch (rule.type) {
        case "max_per_tx": {
          const max = rule.value as number;
          if (amount > max) {
            violations.push({
              policy: policy.name,
              rule: `max_per_tx: $${max}`,
              message: `Transaction $${amount.toFixed(4)} exceeds per-tx limit of $${max.toFixed(2)}`,
            });
          }
          break;
        }
        case "max_daily": {
          const max = rule.value as number;
          if (state.dailySpend + amount > max) {
            violations.push({
              policy: policy.name,
              rule: `max_daily: $${max}`,
              message: `Daily spend would reach $${(state.dailySpend + amount).toFixed(4)}, exceeding limit of $${max.toFixed(2)}`,
            });
          }
          break;
        }
        case "allowed_chains": {
          const chains = rule.value as string[];
          if (!chains.includes(network)) {
            violations.push({
              policy: policy.name,
              rule: `allowed_chains`,
              message: `Network "${network}" not in allowed list: ${chains.join(", ")}`,
            });
          }
          break;
        }
        case "allowed_categories": {
          const cats = rule.value as string[];
          if (!cats.includes(category)) {
            violations.push({
              policy: policy.name,
              rule: `allowed_categories`,
              message: `Category "${category}" not in allowed list`,
            });
          }
          break;
        }
        case "rate_limit": {
          const limit = rule.value as number;
          if (state.dailyTxCount >= limit) {
            violations.push({
              policy: policy.name,
              rule: `rate_limit: ${limit}/day`,
              message: `Daily transaction count (${state.dailyTxCount}) has reached limit of ${limit}`,
            });
          }
          break;
        }
        case "require_approval": {
          const threshold = rule.value as number;
          if (amount >= threshold) {
            requiresApproval = true;
            approvalReason = `Amount $${amount.toFixed(4)} >= approval threshold $${threshold.toFixed(2)}`;
          }
          break;
        }
        case "blocked_providers": {
          const blocked = rule.value as string[];
          if (blocked.includes(providerName)) {
            violations.push({
              policy: policy.name,
              rule: `blocked_providers`,
              message: `Provider "${providerName}" is blocked by policy`,
            });
          }
          break;
        }
      }
    }
  }

  const allowed = violations.length === 0;

  addAudit(
    allowed ? "payment_attempt" : "policy_violation",
    {
      amount,
      category,
      network,
      providerName,
      allowed,
      violations: violations.length,
      requiresApproval,
    },
    violations[0]?.policy,
    violations[0]?.rule
  );

  return { allowed, violations, requiresApproval, approvalReason };
}

// Record a completed payment
export function recordPayment(amount: number) {
  state.dailySpend += amount;
  state.dailyTxCount += 1;

  addAudit("payment_approved", {
    amount,
    dailySpend: state.dailySpend,
    dailyTxCount: state.dailyTxCount,
  });
}

// Get governance state
export function getGovernanceState(): GovernanceState {
  return { ...state };
}

// Update a policy
export function updatePolicy(
  policyId: string,
  updates: { active?: boolean; rules?: PolicyRule[] }
): Policy | null {
  const policy = state.policies.find((p) => p.id === policyId);
  if (!policy) return null;

  if (updates.active !== undefined) policy.active = updates.active;
  if (updates.rules) policy.rules = updates.rules;

  addAudit("policy_updated", {
    policyId,
    changes: updates,
  });

  return policy;
}

// Create a new policy
export function createPolicy(name: string, rules: PolicyRule[]): Policy {
  const policy: Policy = {
    id: genId(),
    name,
    rules,
    createdAt: new Date().toISOString(),
    active: true,
  };
  state.policies.push(policy);

  addAudit("policy_created", { name, ruleCount: rules.length });

  return policy;
}

// Reset governance state
export function resetGovernance() {
  state = {
    policies: [],
    auditLog: [],
    dailySpend: 0,
    dailyTxCount: 0,
    dayStart: new Date().toISOString().split("T")[0],
  };
  initGovernance();
}

// Simulate a governance stress test (for demo)
export function runGovernanceDemo(): AuditEntry[] {
  initGovernance();

  const scenarios = [
    { amount: 0.02, category: "text-generation", network: "base-sepolia", provider: "GPT-4o", label: "Small text gen" },
    { amount: 0.05, category: "image-generation", network: "base-sepolia", provider: "Flux Pro", label: "Medium image gen" },
    { amount: 0.30, category: "code-analysis", network: "base-sepolia", provider: "CodeReview Pro", label: "High-value code review (needs approval)" },
    { amount: 0.60, category: "image-generation", network: "base-sepolia", provider: "Midjourney v6", label: "Over per-tx limit" },
    { amount: 0.10, category: "translation", network: "ethereum-mainnet", provider: "DeepL Pro", label: "Wrong network" },
    { amount: 0.05, category: "video-generation", network: "base-sepolia", provider: "RunwayML", label: "Blocked category" },
  ];

  const results: AuditEntry[] = [];

  for (const s of scenarios) {
    const result = evaluatePayment(s.amount, s.category, s.network, s.provider);

    if (result.allowed && !result.requiresApproval) {
      recordPayment(s.amount);
    }

    results.push({
      id: genId(),
      timestamp: new Date().toISOString(),
      action: result.allowed
        ? result.requiresApproval
          ? "payment_attempt"
          : "payment_approved"
        : "payment_denied",
      details: {
        label: s.label,
        amount: s.amount,
        provider: s.provider,
        category: s.category,
        network: s.network,
        allowed: result.allowed,
        requiresApproval: result.requiresApproval,
        approvalReason: result.approvalReason,
        violations: result.violations,
      },
    });
  }

  return results;
}
