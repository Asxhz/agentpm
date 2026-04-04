// ============================================================
// Deploy Agent - Real deployments with rich site generation
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

const deployments: { subdomain: string; url: string; projectName: string; createdAt: string }[] = [];

export function generateLandingPage(
  projectName: string,
  headline: string,
  description: string,
  features: string[],
  ctaText: string,
  brandColor: string = "#ededed"
): GeneratedSite {
  const isFood = /coffee|food|restaurant|cafe|bakery|pizza|taco|burrito|brew/i.test(projectName + " " + description);
  const isFitness = /fitness|gym|workout|health|yoga|fit/i.test(projectName + " " + description);
  const isTech = /tech|saas|app|software|startup|api|dev|code/i.test(projectName + " " + description);

  const menuItems = isFood ? [
    { name: "Espresso", desc: "Single origin, pulled fresh", price: "$4.50" },
    { name: "Pour Over", desc: "Hand-brewed, single cup", price: "$5.50" },
    { name: "Cortado", desc: "Equal parts espresso and steamed milk", price: "$5.00" },
    { name: "Cold Brew", desc: "24-hour steeped, smooth finish", price: "$5.50" },
    { name: "Matcha Latte", desc: "Ceremonial grade, oat milk", price: "$6.00" },
    { name: "Pastry Board", desc: "Daily selection of fresh pastries", price: "$8.00" },
  ] : [];

  const testimonials = [
    { name: "Sarah K.", text: `${projectName} completely changed how I work. The quality is incredible.`, role: "Customer" },
    { name: "Mike R.", text: `Best decision I made this year. Can not recommend ${projectName} enough.`, role: "Regular" },
    { name: "Alex T.", text: `The attention to detail is what sets ${projectName} apart from everything else.`, role: "Fan" },
  ];

  const stats = isFood
    ? [{ n: "2,400+", l: "Cups served daily" }, { n: "4.9", l: "Google rating" }, { n: "2019", l: "Est." }, { n: "12", l: "Bean origins" }]
    : isFitness
    ? [{ n: "5,000+", l: "Members" }, { n: "98%", l: "Retention" }, { n: "50+", l: "Classes/week" }, { n: "4.8", l: "Rating" }]
    : [{ n: "10k+", l: "Users" }, { n: "99.9%", l: "Uptime" }, { n: "< 50ms", l: "Latency" }, { n: "4.9/5", l: "Rating" }];

  const hours = isFood ? `
    <section class="hours" id="hours">
      <div class="container">
        <h2>Hours & Location</h2>
        <div class="hours-grid">
          <div class="hours-card">
            <h3>Hours</h3>
            <div class="hour-row"><span>Monday - Friday</span><span>6:00 AM - 8:00 PM</span></div>
            <div class="hour-row"><span>Saturday</span><span>7:00 AM - 9:00 PM</span></div>
            <div class="hour-row"><span>Sunday</span><span>8:00 AM - 6:00 PM</span></div>
            <div class="status-badge" id="status">Checking status...</div>
          </div>
          <div class="hours-card">
            <h3>Location</h3>
            <p class="address">123 Market Street<br>San Francisco, CA 94105</p>
            <p class="transit">BART: Montgomery St Station<br>Muni: F Line</p>
            <a href="#" class="directions-link">Get Directions</a>
          </div>
        </div>
      </div>
    </section>` : "";

  const menuSection = menuItems.length > 0 ? `
    <section class="menu" id="menu">
      <div class="container">
        <h2>Menu</h2>
        <p class="section-desc">Carefully sourced, expertly prepared</p>
        <div class="menu-grid">
          ${menuItems.map(m => `
          <div class="menu-item">
            <div class="menu-item-header">
              <span class="menu-name">${m.name}</span>
              <span class="menu-price">${m.price}</span>
            </div>
            <p class="menu-desc">${m.desc}</p>
          </div>`).join("")}
        </div>
      </div>
    </section>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <meta name="description" content="${description}">
  <style>
    :root { --brand: ${brandColor}; --bg: #000; --surface: #0a0a0a; --border: #1a1a1a; --text: #ededed; --dim: #888; --muted: #555; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; -webkit-font-smoothing: antialiased; }
    .container { max-width: 900px; margin: 0 auto; padding: 0 24px; }

    /* Nav */
    nav { position: sticky; top: 0; z-index: 50; background: rgba(0,0,0,0.8); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
    nav .inner { display: flex; justify-content: space-between; align-items: center; height: 56px; max-width: 900px; margin: 0 auto; padding: 0 24px; }
    nav .logo { font-size: 15px; font-weight: 600; letter-spacing: -0.02em; }
    nav .links { display: flex; gap: 24px; }
    nav .links a { font-size: 13px; color: var(--dim); text-decoration: none; transition: color 0.2s; }
    nav .links a:hover { color: var(--text); }
    nav .cta-sm { font-size: 12px; font-weight: 500; background: var(--text); color: var(--bg); padding: 8px 16px; border-radius: 8px; text-decoration: none; transition: opacity 0.2s; }
    nav .cta-sm:hover { opacity: 0.85; }

    /* Hero */
    .hero { padding: 120px 0 100px; text-align: center; position: relative; }
    .hero::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 600px; height: 400px; background: radial-gradient(ellipse, ${brandColor}08, transparent 70%); pointer-events: none; }
    .hero h1 { font-size: 56px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 20px; animation: fadeUp 0.6s ease-out; }
    .hero .subtitle { font-size: 18px; color: var(--dim); max-width: 480px; margin: 0 auto 40px; line-height: 1.6; animation: fadeUp 0.6s ease-out 0.1s both; }
    .hero .cta-group { display: flex; gap: 12px; justify-content: center; animation: fadeUp 0.6s ease-out 0.2s both; }
    .cta { display: inline-flex; align-items: center; gap: 8px; background: var(--text); color: var(--bg); padding: 14px 32px; border-radius: 12px; font-size: 14px; font-weight: 600; text-decoration: none; transition: all 0.2s; border: none; cursor: pointer; }
    .cta:hover { opacity: 0.9; transform: translateY(-1px); }
    .cta-outline { background: transparent; color: var(--dim); border: 1px solid var(--border); }
    .cta-outline:hover { color: var(--text); border-color: var(--muted); }

    /* Stats */
    .stats { padding: 60px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
    .stat { background: var(--surface); padding: 32px 24px; text-align: center; }
    .stat-num { font-size: 32px; font-weight: 700; letter-spacing: -0.03em; }
    .stat-label { font-size: 12px; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

    /* Features */
    .features { padding: 80px 0; }
    .features h2, .menu h2, .testimonials h2, .hours h2 { font-size: 28px; font-weight: 600; text-align: center; margin-bottom: 12px; letter-spacing: -0.02em; }
    .section-desc { text-align: center; color: var(--dim); font-size: 15px; margin-bottom: 48px; }
    .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .feature { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px 24px; transition: all 0.3s; }
    .feature:hover { border-color: var(--muted); transform: translateY(-2px); }
    .feature h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
    .feature p { font-size: 13px; color: var(--dim); line-height: 1.6; }

    /* Menu */
    .menu { padding: 80px 0; }
    .menu-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .menu-item { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; transition: border-color 0.2s; }
    .menu-item:hover { border-color: var(--muted); }
    .menu-item-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .menu-name { font-size: 15px; font-weight: 500; }
    .menu-price { font-size: 14px; color: var(--dim); font-family: ui-monospace, monospace; }
    .menu-desc { font-size: 13px; color: var(--muted); }

    /* Testimonials */
    .testimonials { padding: 80px 0; }
    .testimonial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .testimonial { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
    .testimonial p { font-size: 14px; color: var(--dim); line-height: 1.6; margin-bottom: 16px; font-style: italic; }
    .testimonial .author { font-size: 13px; font-weight: 500; }
    .testimonial .role { font-size: 11px; color: var(--muted); }

    /* Hours */
    .hours { padding: 80px 0; }
    .hours-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .hours-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px; }
    .hours-card h3 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
    .hour-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--dim); padding: 8px 0; border-bottom: 1px solid var(--border); }
    .address { font-size: 14px; color: var(--dim); line-height: 1.6; margin-bottom: 12px; }
    .transit { font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 16px; }
    .directions-link { font-size: 13px; color: var(--text); text-decoration: none; border-bottom: 1px solid var(--muted); }
    .status-badge { display: inline-block; margin-top: 16px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; }

    /* Footer */
    footer { padding: 40px 0; border-top: 1px solid var(--border); margin-top: 40px; }
    footer .inner { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); max-width: 900px; margin: 0 auto; padding: 0 24px; }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: var(--dim); }

    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 768px) {
      .hero h1 { font-size: 36px; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .features-grid, .menu-grid, .hours-grid, .testimonial-grid { grid-template-columns: 1fr; }
      nav .links { display: none; }
    }
  </style>
</head>
<body>
  <nav><div class="inner">
    <div class="logo">${projectName}</div>
    <div class="links">
      ${isFood ? '<a href="#menu">Menu</a><a href="#hours">Hours</a>' : '<a href="#features">Features</a>'}
      <a href="#about">About</a>
    </div>
    <a href="#" class="cta-sm">${ctaText}</a>
  </div></nav>

  <section class="hero">
    <div class="container">
      <h1>${headline}</h1>
      <p class="subtitle">${description}</p>
      <div class="cta-group">
        <a href="#" class="cta">${ctaText}</a>
        <a href="#features" class="cta cta-outline">Learn more</a>
      </div>
    </div>
  </section>

  <section class="container">
    <div class="stats">
      ${stats.map(s => `<div class="stat"><div class="stat-num">${s.n}</div><div class="stat-label">${s.l}</div></div>`).join("")}
    </div>
  </section>

  <section class="features" id="features">
    <div class="container">
      <h2>${isFood ? "Why Us" : "Features"}</h2>
      <p class="section-desc">${isFood ? "What makes us different" : "Everything you need"}</p>
      <div class="features-grid">
        ${features.map(f => {
          const i = f.indexOf(": ");
          const t = i > -1 ? f.slice(0, i) : f;
          const d = i > -1 ? f.slice(i + 2) : "";
          return `<div class="feature"><h3>${t}</h3><p>${d || f}</p></div>`;
        }).join("")}
      </div>
    </div>
  </section>

  ${menuSection}

  <section class="testimonials" id="about">
    <div class="container">
      <h2>What people say</h2>
      <p class="section-desc">Real feedback from real ${isFood ? "customers" : "users"}</p>
      <div class="testimonial-grid">
        ${testimonials.map(t => `
        <div class="testimonial">
          <p>"${t.text}"</p>
          <div class="author">${t.name}</div>
          <div class="role">${t.role}</div>
        </div>`).join("")}
      </div>
    </div>
  </section>

  ${hours}

  <section class="container" style="padding: 80px 0; text-align: center;">
    <h2 style="font-size: 32px; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.03em;">${isFood ? "Visit us today" : "Get started"}</h2>
    <p style="color: var(--dim); font-size: 16px; margin-bottom: 32px;">${isFood ? "Your new favorite spot is waiting." : "Join thousands of happy users."}</p>
    <a href="#" class="cta">${ctaText}</a>
  </section>

  <footer><div class="inner">
    <span>${projectName} &copy; ${new Date().getFullYear()}</span>
    <span>Built with <a href="https://agentpm.larp.click">AgentPM</a></span>
  </div></footer>

  <script>
    // Scroll animations
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.feature, .menu-item, .testimonial, .stat, .hours-card').forEach(el => {
      el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = 'all 0.4s ease-out';
      observer.observe(el);
    });
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
    });
    ${isFood ? `
    // Live open/closed status
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isOpen = day >= 1 && day <= 5 ? (hour >= 6 && hour < 20) : day === 6 ? (hour >= 7 && hour < 21) : (hour >= 8 && hour < 18);
    const badge = document.getElementById('status');
    if (badge) { badge.textContent = isOpen ? 'Open Now' : 'Closed'; badge.style.background = isOpen ? '#16a34a22' : '#ef444422'; badge.style.color = isOpen ? '#22c55e' : '#ef4444'; }
    ` : ""}
  </script>
</body>
</html>`;

  return {
    files: [{ path: "index.html", content: html }],
    framework: "static",
    description: `Landing page for ${projectName}`,
  };
}

// Deploy via Vercel API
export async function deployToLarpClick(
  site: GeneratedSite,
  projectName: string,
  customSubdomain?: string,
): Promise<DeployResult> {
  const subdomain = (customSubdomain || projectName).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32);
  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    const id = Math.random().toString(36).slice(2, 8);
    deployments.push({ subdomain, url: `https://${subdomain}-${id}.vercel.app`, projectName, createdAt: new Date().toISOString() });
    return { success: true, url: `https://${subdomain}-${id}.vercel.app`, deploymentId: `sim_${id}`, projectName, status: "READY", method: "simulated", subdomain };
  }

  try {
    const fileUploads = [];
    for (const file of site.files) {
      const content = Buffer.from(file.content);
      const sha = createHash("sha1").update(content).digest("hex");
      await fetch("https://api.vercel.com/v2/files", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/octet-stream", "x-vercel-digest": sha }, body: content });
      fileUploads.push({ file: file.path, sha, size: content.length });
    }

    const res = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "agentpay-router", files: fileUploads, projectSettings: { framework: null }, meta: { subdomain, projectName, source: "agentpm" } }),
    });

    if (!res.ok) throw new Error(`Deploy failed: ${res.status}`);
    const data = await res.json();
    const url = `https://${data.url}`;
    deployments.push({ subdomain, url, projectName, createdAt: new Date().toISOString() });
    return { success: true, url, deploymentId: data.id, projectName, status: data.readyState || "BUILDING", method: "vercel-api", subdomain };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Deploy failed", method: "vercel-api" };
  }
}

export async function deployToVercel(site: GeneratedSite, projectName: string, vercelToken?: string): Promise<DeployResult> {
  const orig = process.env.VERCEL_TOKEN;
  if (vercelToken) process.env.VERCEL_TOKEN = vercelToken;
  const result = await deployToLarpClick(site, projectName);
  if (vercelToken && orig) process.env.VERCEL_TOKEN = orig;
  return result;
}

export async function getAllLarpClickSites() { return [...deployments]; }
export function getLarpClickSite() { return undefined; }
