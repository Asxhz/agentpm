"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      {/* NAV */}
      <nav className="h-14 px-6 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded bg-white/10 flex items-center justify-center">
            <span className="text-[9px] font-bold font-[family-name:var(--font-mono)] text-white/70">PM</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">AgentPM</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/hosting" className="text-[11px] text-text-dim hover:text-text transition-colors">Hosting</Link>
          <span className="text-[11px] text-text-dim font-[family-name:var(--font-mono)]">OWS Hackathon 2026</span>
          <Link href="/app">
            <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="inline-flex h-8 px-4 items-center rounded-lg bg-white text-[#09090b] text-xs font-semibold">
              Launch App
            </motion.span>
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6">
        {/* HERO */}
        <motion.section {...fade} transition={{ duration: 0.6 }} className="pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-[10px] font-[family-name:var(--font-mono)] text-text-dim mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Built on Open Wallet Standard + x402
          </div>
          <h1 className="text-5xl font-semibold tracking-tight leading-[1.1] mb-4">
            Your AI project manager<br />
            <span className="text-text-dim">with its own wallet.</span>
          </h1>
          <p className="text-base text-text-dim max-w-lg mx-auto leading-relaxed mb-8">
            Describe a project. AgentPM plans stages, discovers the best tools, checks spending policies, pays providers via x402, and delivers results. Every payment is on-chain and auditable.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/app">
              <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="inline-flex h-10 px-6 items-center rounded-xl bg-white text-[#09090b] text-sm font-semibold">
                Start a project
              </motion.span>
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 px-6 items-center rounded-xl border border-border text-sm text-text-dim hover:text-text hover:border-border-bright transition-colors">
              View source
            </a>
          </div>
        </motion.section>

        {/* DEMO PREVIEW */}
        <motion.section {...fade} transition={{ delay: 0.2, duration: 0.6 }} className="pb-20">
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="h-8 bg-surface-2 border-b border-border flex items-center px-4 gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
              <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
              <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
              <span className="text-[9px] text-text-muted font-[family-name:var(--font-mono)] ml-3">agentpm / project execution</span>
            </div>
            <div className="p-6 space-y-4 font-[family-name:var(--font-mono)] text-[11px]">
              <div className="flex gap-3">
                <span className="text-text-muted shrink-0">you</span>
                <span className="text-text-secondary">Create a go-to-market campaign for my new developer tools product</span>
              </div>
              <div className="flex gap-3">
                <span className="text-accent shrink-0">pm</span>
                <span className="text-text-dim">Planning 5 stages: Market Research, Strategy, Content Creation, Visual Design, Quality Review</span>
              </div>
              {[
                { n: 1, name: "Market Research", tool: "Apify", cost: "0.025", status: "text-accent" },
                { n: 2, name: "Strategy", tool: "BigQuery AI", cost: "0.030", status: "text-accent" },
                { n: 3, name: "Content Creation", tool: "Claude Opus", cost: "0.015", status: "text-accent" },
                { n: 4, name: "Visual Design", tool: "Flux Pro", cost: "0.050", status: "text-accent" },
                { n: 5, name: "Quality Review", tool: "CodeReview Pro", cost: "0.050", status: "text-accent" },
              ].map((s, i) => (
                <motion.div key={s.n} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.15 }}
                  className="flex items-center gap-3 pl-8">
                  <span className="h-5 w-5 rounded bg-accent/15 flex items-center justify-center text-[9px] font-bold text-accent">{s.n}</span>
                  <span className="text-text-secondary w-32">{s.name}</span>
                  <span className="text-text-muted">{s.tool}</span>
                  <span className="text-text-muted ml-auto">-${s.cost}</span>
                  <span className={`h-1.5 w-1.5 rounded-full bg-accent`} />
                </motion.div>
              ))}
              <div className="flex gap-3 pt-2 border-t border-border/50">
                <span className="text-accent shrink-0">pm</span>
                <span className="text-text-dim">Project complete. 5 stages, $0.1700 spent, $9.8300 remaining. All payments settled on Base Sepolia.</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* HOW IT WORKS */}
        <motion.section {...fade} transition={{ delay: 0.3 }} className="pb-20">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-10">How it works</h2>
          <div className="grid grid-cols-5 gap-3">
            {[
              { step: "01", title: "Describe", desc: "Tell the agent what you need in plain language" },
              { step: "02", title: "Plan", desc: "AI decomposes into executable stages" },
              { step: "03", title: "Discover", desc: "Finds and compares tool providers" },
              { step: "04", title: "Pay", desc: "x402 micropayment via OWS wallet" },
              { step: "05", title: "Deliver", desc: "Results returned, budget tracked" },
            ].map((s, i) => (
              <motion.div key={s.step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="bg-surface border border-border rounded-xl p-4 text-center">
                <span className="text-[10px] font-[family-name:var(--font-mono)] text-text-muted">{s.step}</span>
                <p className="text-sm font-medium mt-1">{s.title}</p>
                <p className="text-[10px] text-text-dim mt-1 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* FEATURES */}
        <motion.section {...fade} transition={{ delay: 0.4 }} className="pb-20">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-10">Built for the agent economy</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { title: "OWS Wallet", desc: "Multi-chain wallet with local key custody. Supports EVM, Solana, Bitcoin, and 6 more chain families." },
              { title: "x402 Payments", desc: "HTTP-native micropayments. Tools return 402, agent signs EIP-712 authorization, facilitator settles on-chain." },
              { title: "Policy Engine", desc: "Spending limits, chain restrictions, rate limiting, and approval gates on every transaction." },
              { title: "21 Tool Providers", desc: "Image generation, text, code analysis, translation, data processing, web scraping, and audio across 8 categories." },
              { title: "AI Decision Engine", desc: "Claude evaluates providers on price, quality, latency, and reliability based on your priority." },
              { title: "Full Audit Trail", desc: "Every payment, policy check, and tool execution logged with transaction hashes on Base Sepolia." },
            ].map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.06 }}
                className="bg-surface border border-border rounded-xl p-5">
                <p className="text-sm font-medium mb-1.5">{f.title}</p>
                <p className="text-[11px] text-text-dim leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* TRACK COVERAGE */}
        <motion.section {...fade} transition={{ delay: 0.5 }} className="pb-20">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-3">One product, five tracks</h2>
          <p className="text-sm text-text-dim text-center mb-8 max-w-lg mx-auto">Every project execution naturally demonstrates all five OWS hackathon tracks in a single flow.</p>
          <div className="grid grid-cols-5 gap-3">
            {[
              { n: "01", l: "Commerce", d: "Full autonomous commerce loop at every stage" },
              { n: "02", l: "Governance", d: "Policy engine checks every payment" },
              { n: "03", l: "Pay-Per-Call", d: "Every tool paid via x402 micropayment" },
              { n: "04", l: "Multi-Agent", d: "Stages coordinate across providers" },
              { n: "05", l: "Creative", d: "Autonomous PM spending money for you" },
            ].map((t, i) => (
              <motion.div key={t.n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 + i * 0.05 }}
                className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-center">
                <span className="text-[10px] font-[family-name:var(--font-mono)] text-accent font-medium">{t.n}</span>
                <p className="text-xs font-medium mt-0.5">{t.l}</p>
                <p className="text-[9px] text-text-dim mt-1 leading-relaxed">{t.d}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section {...fade} transition={{ delay: 0.6 }} className="pb-24 text-center">
          <Link href="/app">
            <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="inline-flex h-12 px-8 items-center rounded-xl bg-white text-[#09090b] text-sm font-semibold">
              Launch AgentPM
            </motion.span>
          </Link>
          <p className="text-[10px] text-text-muted mt-3 font-[family-name:var(--font-mono)]">Base Sepolia testnet / No real funds required</p>
        </motion.section>

        {/* FOOTER */}
        <footer className="border-t border-border py-6 flex items-center justify-between text-[10px] text-text-muted font-[family-name:var(--font-mono)]">
          <span>AgentPM / OWS Hackathon 2026</span>
          <span>Open Wallet Standard + x402 + Claude</span>
        </footer>
      </div>
    </div>
  );
}
