// ============================================================
// /api/governance - Governance & Policy Engine
// GET: state  |  POST: run demo / update policy
// ============================================================

import { NextRequest } from "next/server";
import {
  initGovernance,
  getGovernanceState,
  runGovernanceDemo,
  updatePolicy,
  resetGovernance,
  evaluatePayment,
  recordPayment,
} from "@/lib/governance";

export async function GET() {
  initGovernance();
  return Response.json(getGovernanceState());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

  initGovernance();

  switch (action) {
    case "demo": {
      resetGovernance();
      const results = runGovernanceDemo();
      return Response.json({
        results,
        state: getGovernanceState(),
      });
    }
    case "evaluate": {
      const { amount, category, network, provider } = body as {
        amount: number;
        category: string;
        network: string;
        provider: string;
      };
      const result = evaluatePayment(amount, category, network, provider);
      if (result.allowed && !result.requiresApproval) {
        recordPayment(amount);
      }
      return Response.json({
        ...result,
        state: getGovernanceState(),
      });
    }
    case "update-policy": {
      const { policyId, updates } = body as {
        policyId: string;
        updates: { active?: boolean };
      };
      const policy = updatePolicy(policyId, updates);
      return Response.json({
        policy,
        state: getGovernanceState(),
      });
    }
    case "reset": {
      resetGovernance();
      return Response.json(getGovernanceState());
    }
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
