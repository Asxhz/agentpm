// ============================================================
// Deploy Agent - Real Vercel deployment via API
// Also generates static HTML for projects to deploy
// ============================================================

export interface DeployResult {
  success: boolean;
  url?: string;
  deploymentId?: string;
  projectName?: string;
  status?: string;
  error?: string;
  method: "vercel-api" | "vercel-cli" | "simulated" | "larp-click";
  customDomain?: string;
  subdomain?: string;
}

// In-memory store for larp.click subdomains
const larpClickSites = new Map<string, { html: string; projectName: string; createdAt: string }>();

export function getLarpClickSite(subdomain: string) {
  return larpClickSites.get(subdomain.toLowerCase());
}

export function getAllLarpClickSites() {
  return Array.from(larpClickSites.entries()).map(([sub, data]) => ({
    subdomain: sub,
    url: `${sub}.larp.click`,
    projectName: data.projectName,
    createdAt: data.createdAt,
  }));
}

export interface GeneratedSite {
  files: { path: string; content: string }[];
  framework: string;
  description: string;
}

// Generate a static landing page based on project context
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
    header { padding: 20px 0; border-bottom: 1px solid #27272a; }
    header .logo { font-size: 14px; font-weight: 600; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .hero h1 { font-size: 48px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 16px; }
    .hero p { font-size: 18px; color: #a1a1aa; max-width: 500px; margin: 0 auto 32px; line-height: 1.6; }
    .cta { display: inline-block; background: ${brandColor}; color: #09090b; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none; }
    .cta:hover { opacity: 0.9; }
    .features { padding: 60px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .feature { background: #0f0f11; border: 1px solid #27272a; border-radius: 12px; padding: 24px; }
    .feature h3 { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
    .feature p { font-size: 13px; color: #71717a; line-height: 1.5; }
    footer { padding: 24px 0; border-top: 1px solid #27272a; text-align: center; font-size: 12px; color: #52525b; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: #18181b; border: 1px solid #27272a; border-radius: 99px; padding: 6px 12px; font-size: 11px; color: #a1a1aa; margin-bottom: 24px; }
    .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: ${brandColor}; }
  </style>
</head>
<body>
  <div class="container">
    <header><div class="logo">${projectName}</div></header>
    <section class="hero">
      <div class="badge"><span class="dot"></span>Now available</div>
      <h1>${headline}</h1>
      <p>${description}</p>
      <a href="#" class="cta">${ctaText}</a>
    </section>
    <section class="features">
${features.map(f => {
  const [title, ...rest] = f.split(": ");
  return `      <div class="feature"><h3>${title}</h3><p>${rest.join(": ") || f}</p></div>`;
}).join("\n")}
    </section>
    <footer>Built with AgentPM / Powered by Open Wallet Standard</footer>
  </div>
</body>
</html>`;

  return {
    files: [
      { path: "index.html", content: html },
      { path: "package.json", content: JSON.stringify({ name: projectName.toLowerCase().replace(/[^a-z0-9]/g, "-"), version: "1.0.0", private: true }, null, 2) },
    ],
    framework: "static",
    description: `Landing page for ${projectName}`,
  };
}

// Deploy to larp.click (in-memory, served by our own route)
export function deployToLarpClick(
  site: GeneratedSite,
  projectName: string,
  customSubdomain?: string,
): DeployResult {
  const subdomain = (customSubdomain || projectName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32);
  const html = site.files.find(f => f.path === "index.html")?.content || "";

  larpClickSites.set(subdomain, {
    html,
    projectName,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    url: `http://localhost:3003/site/${subdomain}`,
    deploymentId: `larp_${subdomain}`,
    projectName,
    status: "LIVE",
    method: "larp-click",
    subdomain,
  };
}

// Deploy to Vercel via API
export async function deployToVercel(
  site: GeneratedSite,
  projectName: string,
  vercelToken?: string,
): Promise<DeployResult> {
  const token = vercelToken || process.env.VERCEL_TOKEN;
  if (!token) {
    // Simulated deployment for demo
    const fakeId = Math.random().toString(36).slice(2, 10);
    return {
      success: true,
      url: `https://${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${fakeId}.vercel.app`,
      deploymentId: `dpl_${fakeId}`,
      projectName,
      status: "READY",
      method: "simulated",
    };
  }

  try {
    // Upload files to Vercel
    const fileUploads = [];
    for (const file of site.files) {
      const content = Buffer.from(file.content);
      const sha = await computeSha1(content);

      const uploadRes = await fetch("https://api.vercel.com/v2/files", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "x-vercel-digest": sha,
        },
        body: content,
      });

      if (!uploadRes.ok && uploadRes.status !== 409) {
        throw new Error(`File upload failed: ${uploadRes.status}`);
      }

      fileUploads.push({ file: file.path, sha, size: content.length });
    }

    // Create deployment
    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        files: fileUploads,
        target: "production",
      }),
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      throw new Error(`Deploy failed: ${err}`);
    }

    const data = await deployRes.json();
    return {
      success: true,
      url: `https://${data.url}`,
      deploymentId: data.id,
      projectName: data.name,
      status: data.readyState || "BUILDING",
      method: "vercel-api",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Deployment failed",
      method: "vercel-api",
    };
  }
}

async function computeSha1(data: Buffer): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("sha1").update(data).digest("hex");
}
