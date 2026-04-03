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
      headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=60" },
    });
  }

  // No stored site - show a branded placeholder that explains this is an AgentPM deployment
  const placeholder = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subdomain} - Powered by AgentPM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #09090b; color: #fafafa; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; max-width: 480px; padding: 24px; }
    h1 { font-size: 32px; font-weight: 600; margin-bottom: 8px; }
    .sub { font-size: 14px; color: #71717a; line-height: 1.6; margin-bottom: 24px; }
    .domain { font-family: 'SF Mono', monospace; font-size: 13px; color: #22c55e; background: #0f0f11; border: 1px solid #27272a; border-radius: 8px; padding: 8px 16px; display: inline-block; margin-bottom: 24px; }
    a { color: #22c55e; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: #18181b; border: 1px solid #27272a; border-radius: 99px; padding: 6px 14px; font-size: 11px; color: #a1a1aa; }
    .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge" style="margin-bottom: 24px"><span class="dot"></span>AgentPM Deployment</div>
    <h1>${subdomain}</h1>
    <p class="sub">This subdomain is reserved on larp.click. The site hasn't been deployed yet, or the serverless instance was recycled.</p>
    <div class="domain">${subdomain}.larp.click</div>
    <p class="sub">Deploy a site here by telling <a href="https://agentpm.larp.click/app">AgentPM</a> to build and deploy your project to ${subdomain}.larp.click</p>
  </div>
</body>
</html>`;

  return new Response(placeholder, {
    headers: { "Content-Type": "text/html" },
  });
}
