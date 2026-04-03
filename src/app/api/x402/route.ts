import { NextRequest } from "next/server";

export async function GET() {
  try {
    const { getWalletInfo } = await import("@/lib/x402-real");
    const info = await getWalletInfo();
    return Response.json(info);
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to initialize wallet",
      network: "base-sepolia",
      chainId: 84532,
      usdcContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

  try {
    const { getWalletInfo, signPaymentAuthorization, getAgentWallet, executeRealX402Payment } = await import("@/lib/x402-real");

    switch (action) {
      case "wallet": {
        return Response.json(await getWalletInfo());
      }
      case "sign": {
        const { to, amount } = body as { to: string; amount: number };
        if (!to || !amount) return Response.json({ error: "to and amount required" }, { status: 400 });
        const result = await signPaymentAuthorization(to, amount);
        return Response.json({
          signed: true,
          from: getAgentWallet().address,
          to,
          amount,
          signature: result.signature,
          authorization: result.authorization,
          network: "base-sepolia",
        });
      }
      case "pay": {
        const { to, amount, description } = body as { to: string; amount: number; description: string };
        if (!to || !amount) return Response.json({ error: "to, amount required" }, { status: 400 });
        const result = await executeRealX402Payment(to, amount, description || "AgentPM payment");
        return Response.json(result);
      }
      default:
        return Response.json({ error: "Unknown action. Use: wallet, sign, pay" }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "x402 operation failed" }, { status: 500 });
  }
}
