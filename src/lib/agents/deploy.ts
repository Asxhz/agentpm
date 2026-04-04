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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #09090b; color: #fafafa; min-height: 100vh; overflow-x: hidden; }
    .container { max-width: 860px; margin: 0 auto; padding: 0 24px; }
    header { padding: 16px 0; border-bottom: 1px solid #1a1a1f; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: rgba(9,9,11,0.85); backdrop-filter: blur(12px); z-index: 50; }
    header .logo { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
    header nav { display: flex; gap: 4px; }
    header nav a { font-size: 12px; color: #71717a; text-decoration: none; padding: 6px 12px; border-radius: 8px; transition: all 0.2s; }
    header nav a:hover { color: #fafafa; background: #18181b; }
    .hero { padding: 120px 0 100px; text-align: center; position: relative; }
    .hero::before { content: ''; position: absolute; top: 40px; left: 50%; transform: translateX(-50%); width: 600px; height: 400px; background: radial-gradient(ellipse, ${brandColor}15, transparent 70%); pointer-events: none; }
    .hero h1 { font-size: 56px; font-weight: 800; letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 20px; background: linear-gradient(135deg, #fafafa 0%, #a1a1aa 50%, #fafafa 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: shimmer 4s linear infinite; position: relative; }
    .hero p { font-size: 17px; color: #a1a1aa; max-width: 460px; margin: 0 auto 40px; line-height: 1.65; }
    .cta-group { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .cta { display: inline-flex; align-items: center; gap: 8px; background: ${brandColor}; color: #09090b; padding: 14px 32px; border-radius: 14px; font-size: 14px; font-weight: 600; text-decoration: none; transition: all 0.25s; border: none; cursor: pointer; }
    .cta:hover { transform: translateY(-2px); box-shadow: 0 8px 30px ${brandColor}40; }
    .cta-secondary { background: transparent; color: #a1a1aa; border: 1px solid #27272a; }
    .cta-secondary:hover { border-color: #3f3f46; color: #fafafa; box-shadow: none; transform: translateY(-1px); }
    .features { padding: 80px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .feature { background: #0c0c0e; border: 1px solid #1a1a1f; border-radius: 20px; padding: 32px 28px; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); position: relative; overflow: hidden; }
    .feature::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, ${brandColor}40, transparent); opacity: 0; transition: opacity 0.3s; }
    .feature:hover { border-color: #27272a; transform: translateY(-4px); }
    .feature:hover::before { opacity: 1; }
    .feature .icon { width: 40px; height: 40px; border-radius: 12px; background: ${brandColor}15; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 18px; }
    .feature h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.01em; }
    .feature p { font-size: 13px; color: #71717a; line-height: 1.65; }
    .stats { padding: 60px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; text-align: center; border-top: 1px solid #1a1a1f; }
    .stat-num { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; background: linear-gradient(135deg, ${brandColor}, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .stat-label { font-size: 12px; color: #52525b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    footer { padding: 32px 0; border-top: 1px solid #1a1a1f; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #3f3f46; }
    footer a { color: #52525b; text-decoration: none; transition: color 0.2s; }
    footer a:hover { color: #a1a1aa; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: #111113; border: 1px solid #1a1a1f; border-radius: 99px; padding: 8px 18px; font-size: 12px; color: #a1a1aa; margin-bottom: 28px; animation: fadeUp 0.6s ease-out; }
    .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: ${brandColor}; animation: pulse 2s infinite; }
    .mascot { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; background: #111113; border: 1px solid #27272a; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; transition: all 0.3s; z-index: 100; animation: float 3s ease-in-out infinite; }
    .mascot:hover { transform: scale(1.15); border-color: ${brandColor}; box-shadow: 0 0 20px ${brandColor}30; }
    @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeUp 0.6s ease-out both; }
    .fade-in-1 { animation-delay: 0.1s; }
    .fade-in-2 { animation-delay: 0.2s; }
    .fade-in-3 { animation-delay: 0.3s; }
    .fade-in-4 { animation-delay: 0.4s; }
    @media (max-width: 640px) { .hero h1 { font-size: 36px; } .hero { padding: 80px 0 60px; } .stats { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">${projectName}</div>
      <nav><a href="#">Features</a><a href="#">Pricing</a><a href="#">About</a></nav>
    </header>
    <section class="hero">
      <div class="badge fade-in"><span class="dot"></span>Now available</div>
      <h1 class="fade-in fade-in-1">${headline}</h1>
      <p class="fade-in fade-in-2">${description}</p>
      <div class="cta-group fade-in fade-in-3">
        <a href="#" class="cta">${ctaText}</a>
        <a href="#features" class="cta cta-secondary">Learn more</a>
      </div>
    </section>
    <section class="features" id="features">
${features.map((f, idx) => {
  const i = f.indexOf(": ");
  const title = i > -1 ? f.slice(0, i) : f;
  const desc = i > -1 ? f.slice(i + 2) : "";
  const icons = ["&#9889;", "&#9733;", "&#9775;", "&#9830;", "&#10024;", "&#9827;"];
  return `      <div class="feature fade-in fade-in-${idx + 1}">
        <div class="icon">${icons[idx % icons.length]}</div>
        <h3>${title}</h3>
        <p>${desc || f}</p>
      </div>`;
}).join("\n")}
    </section>
    <section class="stats">
      <div class="fade-in fade-in-1"><div class="stat-num">10k+</div><div class="stat-label">Happy customers</div></div>
      <div class="fade-in fade-in-2"><div class="stat-num">99.9%</div><div class="stat-label">Uptime</div></div>
      <div class="fade-in fade-in-3"><div class="stat-num">4.9/5</div><div class="stat-label">Rating</div></div>
    </section>
    <footer>
      <span>${projectName} &copy; ${new Date().getFullYear()}</span>
      <span>Built with <a href="https://agentpm.larp.click" target="_blank">AgentPM</a></span>
    </footer>
  </div>
  <div class="mascot" onclick="this.style.transform='scale(1.3) rotate(20deg)'; setTimeout(()=>this.style.transform='',500)" title="Hi! I'm the ${projectName} mascot">&#128075;</div>
  <script>
    // Intersection Observer for scroll animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.style.opacity = '1';
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.feature, .stats > div').forEach(el => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
      observer.observe(el);
    });
    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });
  </script>
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
        name: "agentpay-router",
        files: fileUploads,
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
