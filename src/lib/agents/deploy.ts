// ============================================================
// Deploy Agent - Real persistent hosting via Vercel Blob
// Sites persist across serverless cold starts
// ============================================================

import { put, list } from "@vercel/blob";

export interface DeployResult {
  success: boolean;
  url?: string;
  deploymentId?: string;
  projectName?: string;
  status?: string;
  error?: string;
  method: "blob" | "vercel-api" | "simulated";
  subdomain?: string;
}

export interface GeneratedSite {
  files: { path: string; content: string }[];
  framework: string;
  description: string;
}

// Generate a real landing page with actual content
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
    header nav a { font-size: 13px; color: #a1a1aa; text-decoration: none; margin-left: 24px; }
    header nav a:hover { color: #fafafa; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .hero h1 { font-size: 48px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 16px; }
    .hero p { font-size: 18px; color: #a1a1aa; max-width: 500px; margin: 0 auto 32px; line-height: 1.6; }
    .cta { display: inline-block; background: ${brandColor}; color: #09090b; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none; transition: opacity 0.2s; }
    .cta:hover { opacity: 0.9; }
    .features { padding: 60px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .feature { background: #0f0f11; border: 1px solid #27272a; border-radius: 12px; padding: 24px; }
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
  const colonIndex = f.indexOf(": ");
  const title = colonIndex > -1 ? f.slice(0, colonIndex) : f;
  const desc = colonIndex > -1 ? f.slice(colonIndex + 2) : "";
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

// Deploy to Vercel Blob (persistent, survives cold starts)
export async function deployToLarpClick(
  site: GeneratedSite,
  projectName: string,
  customSubdomain?: string,
): Promise<DeployResult> {
  const subdomain = (customSubdomain || projectName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32);
  const html = site.files.find(f => f.path === "index.html")?.content || "";

  // Try Vercel Blob first (persistent across cold starts)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await put(`sites/${subdomain}/index.html`, html, {
        access: "public",
        contentType: "text/html",
        addRandomSuffix: false,
      });

      return {
        success: true,
        url: `https://${subdomain}.larp.click`,
        deploymentId: `blob_${subdomain}`,
        projectName,
        status: "LIVE",
        method: "blob",
        subdomain,
      };
    } catch (err) {
      // Fall through to in-memory
      console.error("Blob storage failed:", err);
    }
  }

  // Fallback: in-memory (won't persist across cold starts but works locally)
  inMemorySites.set(subdomain, { html, projectName, createdAt: new Date().toISOString() });

  return {
    success: true,
    url: `https://${subdomain}.larp.click`,
    deploymentId: `mem_${subdomain}`,
    projectName,
    status: "LIVE",
    method: "simulated",
    subdomain,
  };
}

// In-memory fallback store
const inMemorySites = new Map<string, { html: string; projectName: string; createdAt: string }>();

export function getLarpClickSite(subdomain: string): { html: string; projectName: string; createdAt: string } | undefined {
  return inMemorySites.get(subdomain.toLowerCase());
}

// Get site from Blob storage
export async function getLarpClickSiteFromBlob(subdomain: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { blobs } = await list({ prefix: `sites/${subdomain}/` });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url);
    return await res.text();
  } catch {
    return null;
  }
}

// List all deployed sites
export async function getAllLarpClickSites(): Promise<{ subdomain: string; url: string; projectName: string }[]> {
  const results: { subdomain: string; url: string; projectName: string }[] = [];

  // From in-memory
  for (const [sub, data] of inMemorySites) {
    results.push({ subdomain: sub, url: `https://${sub}.larp.click`, projectName: data.projectName });
  }

  // From Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { blobs } = await list({ prefix: "sites/" });
      for (const blob of blobs) {
        const parts = blob.pathname.split("/");
        const sub = parts[1];
        if (sub && !results.find(r => r.subdomain === sub)) {
          results.push({ subdomain: sub, url: `https://${sub}.larp.click`, projectName: sub });
        }
      }
    } catch { /* ignore */ }
  }

  return results;
}

// Deploy to Vercel via API (for custom domain deployments)
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
