import { NextRequest } from "next/server";

// Sites are now deployed as real Vercel deployments with their own URLs.
// This route shows info about the subdomain and links to the real deployment.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params;

  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subdomain}.larp.click</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#09090b;color:#fafafa;min-height:100vh;display:flex;align-items:center;justify-content:center}.c{text-align:center;max-width:520px;padding:24px}h1{font-size:28px;font-weight:600;margin-bottom:12px}.s{font-size:14px;color:#71717a;line-height:1.6;margin-bottom:20px}.d{font-family:'SF Mono',ui-monospace,monospace;font-size:13px;color:#22c55e;background:#0f0f11;border:1px solid #27272a;border-radius:10px;padding:10px 20px;display:inline-block;margin-bottom:24px}a{color:#22c55e;text-decoration:none}a:hover{text-decoration:underline}.btns{display:flex;gap:8px;justify-content:center;margin-top:8px}.btn{display:inline-flex;align-items:center;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:500;transition:all 0.2s}.btn-primary{background:#22c55e;color:#09090b}.btn-primary:hover{opacity:0.9}.btn-secondary{background:#18181b;color:#a1a1aa;border:1px solid #27272a}.btn-secondary:hover{border-color:#3f3f46;color:#fafafa}</style></head><body><div class="c"><h1>${subdomain}</h1><p class="s">This subdomain is managed by AgentPM. Sites deployed through the agent get their own live Vercel URL.</p><div class="d">${subdomain}.larp.click</div><div class="btns"><a href="https://agentpm.larp.click/app" class="btn btn-primary">Build with AgentPM</a><a href="https://agentpm.larp.click/hosting" class="btn btn-secondary">Hosting Manager</a></div></div></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
