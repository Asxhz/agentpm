// ============================================================
// AgentPay Router - OWS Wallet Layer
// Manages agent wallets using Open Wallet Standard patterns
// ============================================================

import {
  AgentWallet,
  Transaction,
  WalletAccount,
} from "./types";

// In-memory wallet store (demo mode)
// In production, this would use @open-wallet-standard/core
let walletStore: Map<string, AgentWallet> = new Map();
let transactionStore: Transaction[] = [];
let initialized = false;

function generateAddress(): string {
  const hex = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++) {
    addr += hex[Math.floor(Math.random() * 16)];
  }
  return addr;
}

function generateTxHash(): string {
  const hex = "0123456789abcdef";
  let hash = "0x";
  for (let i = 0; i < 64; i++) {
    hash += hex[Math.floor(Math.random() * 16)];
  }
  return hash;
}

// Create the default agent wallet (simulating OWS wallet creation)
// Mirrors: ows wallet create --name "agent-router"
function createAgentWallet(
  name: string,
  initialBalance: number
): AgentWallet {
  const address = generateAddress();

  // OWS creates accounts across 9 chain families
  const accounts: WalletAccount[] = [
    { chainId: "eip155:84532", address, derivationPath: "m/44'/60'/0'/0/0" },
    { chainId: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", address: "AgentPay" + Math.random().toString(36).slice(2, 8), derivationPath: "m/44'/501'/0'/0'" },
    { chainId: "bip122:000000000019d6689c085ae165831e93", address: "bc1q" + Math.random().toString(36).slice(2, 30), derivationPath: "m/84'/0'/0'/0/0" },
  ];

  const wallet: AgentWallet = {
    id: crypto.randomUUID(),
    name,
    address,
    balance: initialBalance,
    accounts,
    createdAt: new Date().toISOString(),
  };

  walletStore.set(wallet.id, wallet);
  return wallet;
}

export function initializeWallets(initialBalance: number = 50.0): AgentWallet {
  if (initialized) {
    const existing = Array.from(walletStore.values()).find(
      (w) => w.name === "agent-router"
    );
    if (existing) return existing;
  }

  // Create the main router agent wallet
  const routerWallet = createAgentWallet("agent-router", initialBalance);
  initialized = true;
  return routerWallet;
}

export function getWallet(walletId: string): AgentWallet | undefined {
  return walletStore.get(walletId);
}

export function getRouterWallet(): AgentWallet | undefined {
  return Array.from(walletStore.values()).find(
    (w) => w.name === "agent-router"
  );
}

export function getBalance(walletId: string): number {
  const wallet = walletStore.get(walletId);
  return wallet?.balance ?? 0;
}

export function getTransactions(): Transaction[] {
  return [...transactionStore].reverse();
}

// Process a payment from the router wallet to a provider
// Simulates the x402 payment flow:
// 1. Check balance
// 2. Create EIP-3009 authorization
// 3. Sign with wallet
// 4. Submit to facilitator
// 5. Settle on-chain
export function processPayment(
  walletId: string,
  toAddress: string,
  amount: number,
  toolName: string,
  network: string = "base-sepolia"
): { success: boolean; transaction?: Transaction; error?: string } {
  const wallet = walletStore.get(walletId);
  if (!wallet) {
    return { success: false, error: "Wallet not found" };
  }

  if (wallet.balance < amount) {
    return {
      success: false,
      error: `Insufficient balance: $${wallet.balance.toFixed(4)} < $${amount.toFixed(4)}`,
    };
  }

  // Deduct balance
  wallet.balance -= amount;
  wallet.balance = Math.round(wallet.balance * 10000) / 10000;

  // Create transaction record (mirrors x402 settlement)
  const tx: Transaction = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    from: wallet.address,
    to: toAddress,
    amount,
    toolName,
    status: "confirmed",
    txHash: generateTxHash(),
    network,
    gasUsed: Math.floor(Math.random() * 50000) + 21000,
  };

  transactionStore.push(tx);
  walletStore.set(walletId, wallet);

  return { success: true, transaction: tx };
}

// Reset wallet state (for demo)
export function resetWallet(initialBalance: number = 10.0): AgentWallet {
  walletStore.clear();
  transactionStore = [];
  initialized = false;
  return initializeWallets(initialBalance);
}

// Get wallet state summary
export function getWalletState(): {
  wallet: AgentWallet | undefined;
  transactions: Transaction[];
  totalSpent: number;
} {
  const wallet = getRouterWallet();
  const transactions = getTransactions();
  const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  return { wallet, transactions, totalSpent };
}
