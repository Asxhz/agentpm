import { NextRequest } from "next/server";
import { getLarpClickSite } from "@/lib/agents/deploy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params;
  const site = getLarpClickSite(subdomain);

  if (!site) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Not Found</title><style>body{background:#09090b;color:#fafafa;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center}h1{font-size:48px;font-weight:600;margin:0}p{color:#71717a;margin-top:8px;font-size:14px}</style></head><body><div><h1>404</h1><p>${subdomain}.larp.click not found</p><p style="margin-top:24px"><a href="/app" style="color:#22c55e;text-decoration:none">Create a site with AgentPM</a></p></div></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  return new Response(site.html, {
    headers: { "Content-Type": "text/html" },
  });
}
