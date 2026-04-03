import { NextRequest } from "next/server";
import { checkDomain, searchDomains, getTLDPrices, purchaseDomain, connectDomain, getPurchasedDomains } from "@/lib/agents/domain";

export async function GET() {
  return Response.json({ domains: getPurchasedDomains(), tlds: getTLDPrices() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

  switch (action) {
    case "check": {
      const { domain } = body as { domain: string };
      if (!domain) return Response.json({ error: "domain required" }, { status: 400 });
      return Response.json(await checkDomain(domain));
    }
    case "search": {
      const { name, tlds } = body as { name: string; tlds?: string[] };
      if (!name) return Response.json({ error: "name required" }, { status: 400 });
      return Response.json({ suggestions: await searchDomains(name, tlds) });
    }
    case "purchase": {
      const { domain } = body as { domain: string };
      if (!domain) return Response.json({ error: "domain required" }, { status: 400 });
      return Response.json(await purchaseDomain(domain));
    }
    case "connect": {
      const { domain, deploymentUrl } = body as { domain: string; deploymentUrl: string };
      if (!domain || !deploymentUrl) return Response.json({ error: "domain and deploymentUrl required" }, { status: 400 });
      return Response.json(connectDomain(domain, deploymentUrl));
    }
    case "list": {
      return Response.json({ domains: getPurchasedDomains() });
    }
    case "prices": {
      return Response.json({ tlds: getTLDPrices() });
    }
    default:
      return Response.json({ error: "Unknown action. Use: check, search, purchase, connect, list, prices" }, { status: 400 });
  }
}
