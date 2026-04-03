import { NextRequest } from "next/server";
import { getWalletInfo, executeRealX402Payment, signPaymentAuthorization, getAgentWallet } from "@/lib/x402-real";

export async function GET() {
  const info = await getWalletInfo();
  return Response.json(info);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

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
}
