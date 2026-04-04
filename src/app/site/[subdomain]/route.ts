import { NextRequest } from "next/server";
import { getLarpClickSite } from "@/lib/agents/deploy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params;
  const site = getLarpClickSite(subdomain);

  if (site) {
    return new Response(site.html, {
      headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=60" },
    });
  }

  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subdomain}.larp.click</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#09090b;color:#fafafa;min-height:100vh;display:flex;align-items:center;justify-content:center}.c{text-align:center;max-width:480px;padding:24px}h1{font-size:32px;font-weight:600;margin-bottom:8px}.s{font-size:14px;color:#71717a;line-height:1.6;margin-bottom:24px}.d{font-family:'SF Mono',monospace;font-size:13px;color:#22c55e;background:#0f0f11;border:1px solid #27272a;border-radius:8px;padding:8px 16px;display:inline-block;margin-bottom:24px}a{color:#22c55e;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><div class="c"><h1>${subdomain}</h1><p class="s">This site hasn't been deployed yet.</p><div class="d">${subdomain}.larp.click</div><p class="s">Deploy here with <a href="https://agentpm.larp.click/app">AgentPM</a> or the <a href="https://agentpm.larp.click/hosting">Hosting Manager</a></p></div></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html" } }
  );
}
