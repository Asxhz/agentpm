// ============================================================
// /api/wallet - Wallet Operations
// GET: Get wallet state  |  POST: Reset wallet
// ============================================================

import { NextRequest } from "next/server";
import {
  initializeWallets,
  getWalletState,
  resetWallet,
} from "@/lib/wallet";

export async function GET() {
  initializeWallets(
    parseFloat(process.env.DEMO_WALLET_BALANCE || "10.00")
  );

  const state = getWalletState();

  return Response.json({
    wallet: state.wallet
      ? {
          id: state.wallet.id,
          name: state.wallet.name,
          address: state.wallet.address,
          balance: state.wallet.balance,
          accounts: state.wallet.accounts,
          createdAt: state.wallet.createdAt,
        }
      : null,
    transactions: state.transactions,
    totalSpent: state.totalSpent,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, balance } = body as {
    action: "reset";
    balance?: number;
  };

  if (action === "reset") {
    const wallet = resetWallet(balance || 10.0);
    return Response.json({
      wallet: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        balance: wallet.balance,
        accounts: wallet.accounts,
        createdAt: wallet.createdAt,
      },
      transactions: [],
      totalSpent: 0,
    });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
