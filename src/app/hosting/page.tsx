"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface DeployedSite {
  subdomain: string;
  url: string;
  projectName: string;
}

interface DeployResult {
  success: boolean;
  url?: string;
  subdomain?: string;
  projectName?: string;
  status?: string;
  method?: string;
  error?: string;
}

export default function HostingPage() {
  const [sites, setSites] = useState<DeployedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [lastDeploy, setLastDeploy] = useState<DeployResult | null>(null);

  // Form state
  const [projectName, setProjectName] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");
  const [ctaText, setCtaText] = useState("Get Started");
  const [subdomain, setSubdomain] = useState("");
  const [brandColor, setBrandColor] = useState("#22c55e");

  // Preview
  const [previewHtml, setPreviewHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const refreshSites = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy");
      const data = await res.json();
      setSites(data.sites || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refreshSites(); }, [refreshSites]);

  const generatePreview = async () => {
    if (!projectName.trim()) return;
    const res = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        projectName,
        headline: headline || `Welcome to ${projectName}`,
        description: description || `${projectName} is built for the future.`,
        features: features.split("\n").filter(f => f.trim()),
        ctaText,
        brandColor,
      }),
    });
    const data = await res.json();
    setPreviewHtml(data.preview || "");
    setShowPreview(true);
  };

  const deploy = async () => {
    if (!projectName.trim()) return;
    setDeploying(true);
    setLastDeploy(null);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deploy-larp",
          projectName,
          headline: headline || `Welcome to ${projectName}`,
          description: description || `${projectName} is built for the future.`,
          features: features.split("\n").filter(f => f.trim()),
          ctaText,
          brandColor,
          subdomain: subdomain || projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        }),
      });
      const data = await res.json();
      setLastDeploy(data);
      refreshSites();
    } catch (err) {
      setLastDeploy({ success: false, error: err instanceof Error ? err.message : "Deploy failed" });
    }
    setDeploying(false);
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="h-12 px-6 flex items-center justify-between border-b border-border bg-bg/80 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="h-6 w-6 rounded bg-white/10 flex items-center justify-center">
              <span className="text-[9px] font-bold font-[family-name:var(--font-mono)] text-white/70">PM</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">AgentPM</span>
          </Link>
          <span className="text-[10px] text-text-muted font-[family-name:var(--font-mono)]">/ hosting manager</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-[10px] text-text-dim hover:text-text transition-colors">Back to chat</Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 gap-8">
          {/* Left: Deploy Form */}
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Deploy a Site</h1>
              <p className="text-xs text-text-dim">Generate and deploy a landing page to your-name.larp.click instantly.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">Project Name *</label>
                <input value={projectName} onChange={e => { setProjectName(e.target.value); if (!subdomain) setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }}
                  placeholder="My Awesome Project"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-bright placeholder:text-text-muted" />
              </div>
              <div>
                <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">Subdomain</label>
                <div className="flex items-center gap-0">
                  <input value={subdomain} onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    placeholder="my-project"
                    className="flex-1 bg-surface border border-border rounded-l-lg px-3 py-2 text-sm font-[family-name:var(--font-mono)] focus:outline-none focus:border-border-bright placeholder:text-text-muted" />
                  <span className="bg-surface-2 border border-l-0 border-border rounded-r-lg px-3 py-2 text-sm text-text-muted font-[family-name:var(--font-mono)]">.larp.click</span>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">Headline</label>
                <input value={headline} onChange={e => setHeadline(e.target.value)}
                  placeholder="The Future of Whatever You Do"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-bright placeholder:text-text-muted" />
              </div>
              <div>
                <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="A short description of your project..."
                  rows={2}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-border-bright placeholder:text-text-muted" />
              </div>
              <div>
                <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">Features (one per line)</label>
                <textarea value={features} onChange={e => setFeatures(e.target.value)}
                  placeholder={"Fast: Lightning-fast performance\nSecure: Enterprise-grade security\nScalable: Grows with you"}
                  rows={3}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-mono)] text-[11px] resize-none focus:outline-none focus:border-border-bright placeholder:text-text-muted" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">CTA Button</label>
                  <input value={ctaText} onChange={e => setCtaText(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-bright" />
                </div>
                <div>
                  <label className="text-[9px] font-medium uppercase tracking-wider text-text-dim block mb-1">Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)}
                      className="h-9 w-9 rounded border border-border bg-surface cursor-pointer" />
                    <span className="text-[10px] font-[family-name:var(--font-mono)] text-text-muted">{brandColor}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={generatePreview} disabled={!projectName.trim()}
                  className="flex-1 h-10 rounded-lg border border-border text-xs font-medium text-text-dim hover:text-text hover:border-border-bright disabled:opacity-20 transition-colors">
                  Preview
                </button>
                <motion.button onClick={deploy} disabled={deploying || !projectName.trim()}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex-1 h-10 rounded-lg bg-white text-[#09090b] text-xs font-semibold disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                  {deploying ? "Deploying..." : "Deploy to larp.click"}
                </motion.button>
              </div>
            </div>

            {/* Deploy result */}
            <AnimatePresence>
              {lastDeploy && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl border p-4 ${lastDeploy.success ? "border-accent/30 bg-accent/5" : "border-red/30 bg-red/5"}`}>
                  {lastDeploy.success ? (
                    <>
                      <p className="text-xs font-medium text-accent mb-2">Deployed successfully</p>
                      <div className="space-y-1 text-[10px] font-[family-name:var(--font-mono)]">
                        <div className="flex justify-between"><span className="text-text-muted">URL</span>
                          <a href={lastDeploy.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{lastDeploy.url}</a>
                        </div>
                        <div className="flex justify-between"><span className="text-text-muted">Subdomain</span><span>{lastDeploy.subdomain}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">Method</span><span>{lastDeploy.method}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">Status</span><span className="text-accent">{lastDeploy.status}</span></div>
                      </div>
                      <a href={`/site/${lastDeploy.subdomain}`} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-3 text-[10px] text-accent hover:underline font-[family-name:var(--font-mono)]">
                        Open site (local route)
                      </a>
                    </>
                  ) : (
                    <p className="text-xs text-red">{lastDeploy.error || "Deployment failed"}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Deployed Sites + Preview */}
          <div className="space-y-6">
            {/* Preview */}
            {showPreview && previewHtml && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-medium">Preview</h2>
                  <button onClick={() => setShowPreview(false)} className="text-[9px] text-text-muted hover:text-text transition-colors">close</button>
                </div>
                <div className="rounded-xl border border-border overflow-hidden bg-surface">
                  <div className="h-6 bg-surface-2 border-b border-border flex items-center px-3 gap-1">
                    <span className="h-2 w-2 rounded-full bg-surface-3" />
                    <span className="h-2 w-2 rounded-full bg-surface-3" />
                    <span className="h-2 w-2 rounded-full bg-surface-3" />
                    <span className="text-[8px] text-text-muted font-[family-name:var(--font-mono)] ml-2">{subdomain || "preview"}.larp.click</span>
                  </div>
                  <iframe srcDoc={previewHtml} className="w-full h-80 border-0" sandbox="allow-scripts" title="Site preview" />
                </div>
              </div>
            )}

            {/* Deployed sites list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">Deployed Sites</h2>
                <button onClick={refreshSites} className="text-[9px] text-text-muted hover:text-text transition-colors font-[family-name:var(--font-mono)]">refresh</button>
              </div>
              {loading ? (
                <p className="text-xs text-text-muted">Loading...</p>
              ) : sites.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface p-8 text-center">
                  <p className="text-xs text-text-muted mb-1">No sites deployed yet</p>
                  <p className="text-[10px] text-text-muted">Fill out the form and click Deploy to create your first site.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sites.map((site, i) => (
                    <motion.div key={site.subdomain} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-border bg-surface p-3 hover:border-border-bright transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{site.projectName}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                          <span className="text-[9px] text-accent font-[family-name:var(--font-mono)]">live</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <a href={`/site/${site.subdomain}`} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-[family-name:var(--font-mono)] text-accent hover:underline">{site.subdomain}.larp.click</a>
                        <a href={`/site/${site.subdomain}`} target="_blank" rel="noopener noreferrer"
                          className="text-[9px] text-text-muted hover:text-text transition-colors">open</a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-xs font-medium mb-2">How hosting works</h3>
              <div className="space-y-2 text-[10px] text-text-dim leading-relaxed">
                <p>Sites are deployed to larp.click subdomains and served via Vercel's edge network. Each site gets a unique URL like <span className="font-[family-name:var(--font-mono)] text-text-secondary">yourproject.larp.click</span>.</p>
                <p>You can also deploy sites through the AgentPM chat. Tell the agent to "build and deploy a landing page" and it will handle everything.</p>
                <p>Sites are generated as static HTML with dark theme, responsive layout, and zero dependencies.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
