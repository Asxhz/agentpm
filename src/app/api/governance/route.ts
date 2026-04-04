import { NextRequest } from "next/server";
import {
  initGovernance, getGovernanceState, getGovernanceTimeline,
  updatePolicy, resetGovernance, evaluateTransaction, recordPayment,
  resolveApproval, getPendingApprovals, setStrictMode, getStrictMode,
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
    case "evaluate": {
      const { amount, category, network, provider, sessionBudget = 50, sessionSpent = 0 } = body;
      const result = evaluateTransaction(amount, category, network, provider, sessionBudget, sessionSpent);
      if (result.verdict === "APPROVED") recordPayment(amount);
      return Response.json({ ...result, state: getGovernanceState() });
    }
    case "timeline": {
      return Response.json({ events: getGovernanceTimeline() });
    }
    case "update-policy": {
      const { policyId, updates } = body;
      const policy = updatePolicy(policyId, updates);
      return Response.json({ policy, state: getGovernanceState() });
    }
    case "resolve-approval": {
      const { approvalId, approved } = body;
      const result = resolveApproval(approvalId, approved);
      return Response.json({ approval: result });
    }
    case "pending-approvals": {
      const { sessionId } = body;
      return Response.json({ approvals: getPendingApprovals(sessionId) });
    }
    case "reset": {
      resetGovernance();
      return Response.json(getGovernanceState());
    }
    case "strict-on": {
      setStrictMode(true);
      return Response.json({ strictMode: true });
    }
    case "strict-off": {
      setStrictMode(false);
      return Response.json({ strictMode: false });
    }
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
