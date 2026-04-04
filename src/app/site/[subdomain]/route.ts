import { NextRequest, NextResponse } from "next/server";

// Look up the real Vercel deployment for this subdomain and redirect
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params;
  const token = process.env.VERCEL_TOKEN;

  if (token) {
    try {
      // Search for a deployment with this subdomain name
      const res = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=prj_jJEnWHVGC5tHPg7Hnsx6k8fuesEr&limit=20&state=READY`,
        { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 30 } }
      );

      if (res.ok) {
        const data = await res.json();
        // Find a deployment whose meta or name matches the subdomain
        const match = data.deployments?.find((d: { name: string; url: string; meta?: Record<string, string> }) =>
          d.meta?.subdomain === subdomain || d.url?.includes(subdomain)
        );

        if (match) {
          return NextResponse.redirect(`https://${match.url}`, 307);
        }
      }
    } catch { /* fall through to placeholder */ }
  }

  // No match found - show a nice page with links
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subdomain}.larp.click</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#09090b;color:#fafafa;min-height:100vh;display:flex;align-items:center;justify-content:center}
.c{text-align:center;max-width:480px;padding:32px}.logo{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#22c55e,#06b6d4);display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px}
.logo svg{width:24px;height:24px}h1{font-size:24px;font-weight:600;margin-bottom:8px}
.sub{font-size:14px;color:#71717a;line-height:1.6;margin-bottom:24px}
.domain{font-family:ui-monospace,monospace;font-size:13px;color:#22c55e;background:#18181b;border:1px solid #27272a;border-radius:10px;padding:10px 20px;display:inline-block;margin-bottom:24px}
.btns{display:flex;gap:8px;justify-content:center}
.btn{display:inline-flex;align-items:center;padding:10px 24px;border-radius:10px;font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s}
.btn-p{background:#fafafa;color:#09090b}.btn-p:hover{opacity:0.9}
.btn-s{background:#18181b;color:#a1a1aa;border:1px solid #27272a}.btn-s:hover{border-color:#3f3f46;color:#fafafa}
</style></head><body><div class="c">
<div class="logo"><svg viewBox="0 0 32 32" fill="none"><path d="M10 16.5L14 20.5L22 12.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<h1>${subdomain}</h1>
<p class="sub">This subdomain is available on larp.click. Deploy a project here with AgentPM.</p>
<div class="domain">${subdomain}.larp.click</div>
<div class="btns">
<a href="https://agentpm.larp.click/app" class="btn btn-p">Build with AgentPM</a>
<a href="https://agentpm.larp.click/hosting" class="btn btn-s">Host manually</a>
</div></div></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
