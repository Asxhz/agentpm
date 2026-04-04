// ============================================================
// Deploy Agent - Real deployments via Vercel API
// Each site gets its own Vercel deployment with a live URL
// ============================================================

import { createHash } from "crypto";

export interface DeployResult {
  success: boolean;
  url?: string;
  deploymentId?: string;
  projectName?: string;
  status?: string;
  error?: string;
  method: "vercel-api" | "simulated";
  subdomain?: string;
}

export interface GeneratedSite {
  files: { path: string; content: string }[];
  framework: string;
  description: string;
}

// In-memory registry of deployments (for listing)
const deployments: { subdomain: string; url: string; projectName: string; createdAt: string }[] = [];

export function generateLandingPage(
  projectName: string,
  headline: string,
  description: string,
  features: string[],
  ctaText: string,
  brandColor: string = "#22c55e"
): GeneratedSite {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #09090b; color: #fafafa; min-height: 100vh; }
    .container { max-width: 800px; margin: 0 auto; padding: 0 24px; }
    header { padding: 20px 0; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; }
    header .logo { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
    header nav a { font-size: 13px; color: #a1a1aa; text-decoration: none; margin-left: 24px; transition: color 0.2s; }
    header nav a:hover { color: #fafafa; }
    .hero { padding: 100px 0 80px; text-align: center; }
    .hero h1 { font-size: 52px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.08; margin-bottom: 20px; background: linear-gradient(135deg, #fafafa, #a1a1aa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero p { font-size: 18px; color: #a1a1aa; max-width: 480px; margin: 0 auto 36px; line-height: 1.6; }
    .cta { display: inline-block; background: ${brandColor}; color: #09090b; padding: 14px 36px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none; transition: all 0.2s; }
    .cta:hover { opacity: 0.9; transform: translateY(-1px); }
    .features { padding: 80px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .feature { background: #0f0f11; border: 1px solid #27272a; border-radius: 16px; padding: 28px; transition: all 0.2s; }
    .feature:hover { border-color: #3f3f46; transform: translateY(-2px); }
    .feature h3 { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
    .feature p { font-size: 13px; color: #71717a; line-height: 1.6; }
    .social-proof { padding: 40px 0; text-align: center; border-top: 1px solid #18181b; }
    .social-proof p { font-size: 13px; color: #52525b; }
    .social-proof .logos { display: flex; justify-content: center; gap: 32px; margin-top: 16px; opacity: 0.4; }
    .social-proof .logos span { font-size: 14px; font-weight: 600; color: #71717a; }
    footer { padding: 32px 0; border-top: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #52525b; }
    footer a { color: #52525b; text-decoration: none; }
    footer a:hover { color: #a1a1aa; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: #18181b; border: 1px solid #27272a; border-radius: 99px; padding: 8px 16px; font-size: 12px; color: #a1a1aa; margin-bottom: 28px; }
    .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: ${brandColor}; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    @media (max-width: 640px) { .hero h1 { font-size: 36px; } .hero { padding: 60px 0 40px; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">${projectName}</div>
      <nav><a href="#">Features</a><a href="#">Pricing</a><a href="#">About</a></nav>
    </header>
    <section class="hero">
      <div class="badge"><span class="dot"></span>Now available</div>
      <h1>${headline}</h1>
      <p>${description}</p>
      <a href="#" class="cta">${ctaText}</a>
    </section>
    <section class="features">
${features.map(f => {
  const i = f.indexOf(": ");
  const title = i > -1 ? f.slice(0, i) : f;
  const desc = i > -1 ? f.slice(i + 2) : "";
  return `      <div class="feature"><h3>${title}</h3><p>${desc || f}</p></div>`;
}).join("\n")}
    </section>
    <div class="social-proof">
      <p>Trusted by teams everywhere</p>
      <div class="logos"><span>Vercel</span><span>Stripe</span><span>Linear</span><span>Notion</span></div>
    </div>
    <footer>
      <span>${projectName} &copy; ${new Date().getFullYear()}</span>
      <span>Built with <a href="https://agentpm.larp.click" target="_blank">AgentPM</a></span>
    </footer>
  </div>
</body>
</html>`;

  return {
    files: [{ path: "index.html", content: html }],
    framework: "static",
    description: `Landing page for ${projectName}`,
  };
}

// Deploy via Vercel API - creates a REAL deployment with a live URL
export async function deployToLarpClick(
  site: GeneratedSite,
  projectName: string,
  customSubdomain?: string,
): Promise<DeployResult> {
  const subdomain = (customSubdomain || projectName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32);
  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    // No token - simulated deployment
    const fakeId = Math.random().toString(36).slice(2, 8);
    const url = `https://${subdomain}-${fakeId}.vercel.app`;
    deployments.push({ subdomain, url, projectName, createdAt: new Date().toISOString() });
    return { success: true, url, deploymentId: `sim_${fakeId}`, projectName, status: "READY", method: "simulated", subdomain };
  }

  // Real Vercel deployment
  try {
    // Upload files
    const fileUploads = [];
    for (const file of site.files) {
      const content = Buffer.from(file.content);
      const sha = createHash("sha1").update(content).digest("hex");

      const uploadRes = await fetch("https://api.vercel.com/v2/files", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/octet-stream", "x-vercel-digest": sha },
        body: content,
      });

      // 409 = already exists, that's fine
      if (!uploadRes.ok && uploadRes.status !== 409) {
        const err = await uploadRes.text();
        throw new Error(`File upload failed (${uploadRes.status}): ${err}`);
      }

      fileUploads.push({ file: file.path, sha, size: content.length });
    }

    // Create deployment
    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: subdomain,
        files: fileUploads,
        target: "production",
        projectSettings: { framework: null },
      }),
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      throw new Error(`Deploy failed (${deployRes.status}): ${err}`);
    }

    const data = await deployRes.json();
    const url = `https://${data.url}`;

    deployments.push({ subdomain, url, projectName, createdAt: new Date().toISOString() });

    return {
      success: true,
      url,
      deploymentId: data.id,
      projectName,
      status: data.readyState || "BUILDING",
      method: "vercel-api",
      subdomain,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Deploy failed", method: "vercel-api" };
  }
}

// Alias for backward compat
export async function deployToVercel(
  site: GeneratedSite,
  projectName: string,
  vercelToken?: string,
): Promise<DeployResult> {
  // Temporarily override token if provided
  const origToken = process.env.VERCEL_TOKEN;
  if (vercelToken) process.env.VERCEL_TOKEN = vercelToken;
  const result = await deployToLarpClick(site, projectName);
  if (vercelToken && origToken) process.env.VERCEL_TOKEN = origToken;
  return result;
}

// List all deployed sites this session
export async function getAllLarpClickSites(): Promise<{ subdomain: string; url: string; projectName: string }[]> {
  return [...deployments];
}

// Kept for backward compat but not used for serving anymore
export function getLarpClickSite(_subdomain: string): undefined {
  return undefined;
}
