// ============================================================
// AgentPay Router - Type Definitions
// The operating system for AI agents that spend money
// ============================================================

// --- Tool Marketplace Types ---

export type ToolCategory =
  | "image-generation"
  | "text-generation"
  | "code-analysis"
  | "translation"
  | "data-processing"
  | "web-scraping"
  | "audio-generation"
  | "video-generation";

export interface ToolProvider {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  price: number; // USD per call
  qualityScore: number; // 1-10
  latencyMs: number; // average latency
  reliability: number; // 0-1
  walletAddress: string; // provider's OWS wallet (EVM address)
  network: string; // payment network
  features: string[];
  rateLimit: number; // calls per minute
}

export interface ToolCategory_Info {
  id: ToolCategory;
  name: string;
  description: string;
  icon: string;
}

// --- Wallet Types (OWS-compatible) ---

export interface WalletAccount {
  chainId: string; // CAIP-2 format
  address: string;
  derivationPath: string;
}

export interface AgentWallet {
  id: string;
  name: string;
  address: string; // primary EVM address
  balance: number; // USDC balance
  accounts: WalletAccount[];
  createdAt: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  amount: number;
  toolName: string;
  status: "pending" | "confirmed" | "failed";
  txHash: string;
  network: string;
  gasUsed?: number;
}

// --- x402 Payment Types ---

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  asset: string; // token contract address
  amount: string; // atomic units
  payTo: string;
  maxTimeoutSeconds: number;
  description: string;
  extra: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: number;
      validBefore: number;
      nonce: string;
    };
  };
}

export interface PaymentResult {
  success: boolean;
  txHash: string;
  amount: number;
  from: string;
  to: string;
  network: string;
  settledAt: string;
}

// --- AI Router Types ---

export interface TaskAnalysis {
  originalTask: string;
  steps: TaskStep[];
  estimatedTotalCost: number;
  estimatedTotalTime: number;
  complexity: "simple" | "moderate" | "complex";
}

export interface TaskStep {
  id: string;
  description: string;
  category: ToolCategory;
  requirements: string[];
  dependsOn: string[];
}

export interface ProviderEvaluation {
  provider: ToolProvider;
  score: number; // 0-100 composite score
  breakdown: {
    priceScore: number;
    qualityScore: number;
    latencyScore: number;
    reliabilityScore: number;
  };
  reasoning: string;
}

export interface RoutingDecision {
  stepId: string;
  selectedProvider: ToolProvider;
  alternatives: ProviderEvaluation[];
  reasoning: string;
  estimatedCost: number;
  confidence: number; // 0-1
}

export interface ExecutionResult {
  stepId: string;
  provider: ToolProvider;
  output: string;
  cost: number;
  latencyMs: number;
  payment: PaymentResult;
  success: boolean;
}

// --- Pipeline Types ---

export interface PipelineConfig {
  budget: number;
  priority: "cost" | "quality" | "speed" | "balanced";
  riskTolerance: "low" | "medium" | "high";
  maxSteps: number;
}

export type StreamEventType =
  | "system"
  | "thinking"
  | "discovery"
  | "evaluation"
  | "decision"
  | "payment"
  | "execution"
  | "result"
  | "error"
  | "complete";

export interface StreamEvent {
  type: StreamEventType;
  timestamp: string;
  data: unknown;
}

export interface PipelineResult {
  task: string;
  steps: ExecutionResult[];
  totalCost: number;
  totalLatencyMs: number;
  walletBalance: number;
  transactions: Transaction[];
}

// --- UI State Types ---

export interface AgentState {
  wallet: AgentWallet;
  transactions: Transaction[];
  currentTask: string | null;
  isRunning: boolean;
  events: StreamEvent[];
  result: PipelineResult | null;
}
