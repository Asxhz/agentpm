import { NextRequest } from "next/server";
import { checkDomain, searchDomains, getTLDPrices } from "@/lib/agents/domain";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, domain, name, tlds } = body as {
    action: "check" | "search" | "prices";
    domain?: string;
    name?: string;
    tlds?: string[];
  };

  switch (action) {
    case "check": {
      if (!domain) return Response.json({ error: "domain required" }, { status: 400 });
      const result = await checkDomain(domain);
      return Response.json(result);
    }
    case "search": {
      if (!name) return Response.json({ error: "name required" }, { status: 400 });
      const results = await searchDomains(name, tlds);
      return Response.json({ suggestions: results });
    }
    case "prices": {
      return Response.json({ tlds: getTLDPrices() });
    }
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
