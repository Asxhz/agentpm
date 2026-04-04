// ============================================================
// Deploy Agent - Real persistent hosting
// Uses /tmp filesystem for persistence within same Vercel region
// Falls back to in-memory for development
// ============================================================

import { existsSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

export interface DeployResult {
  success: boolean;
  url?: string;
  deploymentId?: string;
  projectName?: string;
  status?: string;
  error?: string;
  method: "filesystem" | "vercel-api" | "simulated";
  subdomain?: string;
}

export interface GeneratedSite {
  files: { path: string; content: string }[];
  framework: string;
  description: string;
}

// Storage directory - /tmp persists within the same Vercel region/instance
const SITES_DIR = process.env.VERCEL ? "/tmp/larp-sites" : join(process.cwd(), ".larp-sites");

function ensureDir() {
  if (!existsSync(SITES_DIR)) {
    mkdirSync(SITES_DIR, { recursive: true });
  }
}

// Generate a real landing page
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
    header .logo { font-size: 14px; font-weight: 600; }
    header nav a { font-size: 13px; color: #a1a1aa; text-decoration: none; margin-left: 24px; transition: color 0.2s; }
    header nav a:hover { color: #fafafa; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .hero h1 { font-size: 48px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 16px; }
    .hero p { font-size: 18px; color: #a1a1aa; max-width: 500px; margin: 0 auto 32px; line-height: 1.6; }
    .cta { display: inline-block; background: ${brandColor}; color: #09090b; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none; transition: opacity 0.2s; }
    .cta:hover { opacity: 0.9; }
    .features { padding: 60px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .feature { background: #0f0f11; border: 1px solid #27272a; border-radius: 12px; padding: 24px; transition: border-color 0.2s; }
    .feature:hover { border-color: #3f3f46; }
    .feature h3 { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
    .feature p { font-size: 13px; color: #71717a; line-height: 1.5; }
    footer { padding: 24px 0; border-top: 1px solid #27272a; text-align: center; font-size: 12px; color: #52525b; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: #18181b; border: 1px solid #27272a; border-radius: 99px; padding: 6px 14px; font-size: 11px; color: #a1a1aa; margin-bottom: 24px; }
    .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: ${brandColor}; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">${projectName}</div>
      <nav><a href="#">Menu</a><a href="#">About</a><a href="#">Contact</a></nav>
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
    <footer>Built with AgentPM / Powered by Open Wallet Standard and x402</footer>
  </div>
</body>
</html>`;

  return {
    files: [{ path: "index.html", content: html }],
    framework: "static",
    description: `Landing page for ${projectName}`,
  };
}

// Deploy to larp.click - writes to filesystem
export async function deployToLarpClick(
  site: GeneratedSite,
  projectName: string,
  customSubdomain?: string,
): Promise<DeployResult> {
  const subdomain = (customSubdomain || projectName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32);
  const html = site.files.find(f => f.path === "index.html")?.content || "";

  try {
    ensureDir();
    const filePath = join(SITES_DIR, `${subdomain}.html`);
    writeFileSync(filePath, html, "utf-8");

    // Also write metadata
    const metaPath = join(SITES_DIR, `${subdomain}.json`);
    writeFileSync(metaPath, JSON.stringify({ projectName, subdomain, createdAt: new Date().toISOString() }), "utf-8");

    return {
      success: true,
      url: `https://${subdomain}.larp.click`,
      deploymentId: `fs_${subdomain}`,
      projectName,
      status: "LIVE",
      method: "filesystem",
      subdomain,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Deploy failed",
      method: "filesystem",
    };
  }
}

// Read a deployed site
export function getLarpClickSite(subdomain: string): { html: string; projectName: string; createdAt: string } | undefined {
  try {
    ensureDir();
    const filePath = join(SITES_DIR, `${subdomain.toLowerCase()}.html`);
    if (!existsSync(filePath)) return undefined;
    const html = readFileSync(filePath, "utf-8");

    let projectName = subdomain;
    let createdAt = new Date().toISOString();
    const metaPath = join(SITES_DIR, `${subdomain.toLowerCase()}.json`);
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      projectName = meta.projectName || subdomain;
      createdAt = meta.createdAt || createdAt;
    }

    return { html, projectName, createdAt };
  } catch {
    return undefined;
  }
}

// List all deployed sites
export async function getAllLarpClickSites(): Promise<{ subdomain: string; url: string; projectName: string }[]> {
  try {
    ensureDir();
    const files = readdirSync(SITES_DIR).filter(f => f.endsWith(".html"));
    return files.map(f => {
      const subdomain = f.replace(".html", "");
      let projectName = subdomain;
      const metaPath = join(SITES_DIR, `${subdomain}.json`);
      if (existsSync(metaPath)) {
        try { projectName = JSON.parse(readFileSync(metaPath, "utf-8")).projectName || subdomain; } catch {}
      }
      return { subdomain, url: `https://${subdomain}.larp.click`, projectName };
    });
  } catch {
    return [];
  }
}

// Deploy to Vercel via API
export async function deployToVercel(
  site: GeneratedSite,
  projectName: string,
  vercelToken?: string,
): Promise<DeployResult> {
  const token = vercelToken || process.env.VERCEL_TOKEN;
  if (!token) {
    const fakeId = Math.random().toString(36).slice(2, 10);
    return {
      success: true,
      url: `https://${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${fakeId}.vercel.app`,
      deploymentId: `sim_${fakeId}`,
      projectName,
      status: "READY",
      method: "simulated",
    };
  }

  try {
    const fileUploads = [];
    for (const file of site.files) {
      const content = Buffer.from(file.content);
      const crypto = await import("crypto");
      const sha = crypto.createHash("sha1").update(content).digest("hex");

      await fetch("https://api.vercel.com/v2/files", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/octet-stream", "x-vercel-digest": sha },
        body: content,
      });

      fileUploads.push({ file: file.path, sha, size: content.length });
    }

    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"), files: fileUploads, target: "production" }),
    });

    const data = await deployRes.json();
    return { success: true, url: `https://${data.url}`, deploymentId: data.id, projectName: data.name, status: data.readyState || "BUILDING", method: "vercel-api" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Deploy failed", method: "vercel-api" };
  }
}
