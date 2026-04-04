"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const f = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-[#ededed]">
      {/* NAV */}
      <nav className="h-14 px-6 flex items-center justify-between border-b border-[#1f1f1f]">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold tracking-tight">AgentPM</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/hosting" className="text-[11px] text-[#666] hover:text-[#999] transition-colors">Hosting</Link>
          <Link href="/app">
            <span className="inline-flex h-8 px-4 items-center rounded-lg bg-[#ededed] text-black text-[11px] font-semibold hover:bg-white transition-colors">Open Console</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6">
        {/* HERO */}
        <motion.section {...f} transition={{ duration: 0.5 }} className="pt-28 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#1f1f1f] text-[10px] font-[family-name:var(--font-mono)] text-[#666] mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ededed]" />
            Open Wallet Standard Hackathon 2026
          </div>
          <h1 className="text-5xl font-semibold tracking-tight leading-[1.08] mb-5">
            Give agents a wallet.<br />
            <span className="text-[#666]">Without giving them a blank check.</span>
          </h1>
          <p className="text-[15px] text-[#666] max-w-lg mx-auto leading-relaxed mb-10">
            AgentPM is a governance runtime for autonomous agents that spend money. Delegated budgets, policy enforcement, human escalation, and full audit trails.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/app">
              <motion.span whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 px-7 items-center rounded-xl bg-[#ededed] text-black text-sm font-semibold hover:bg-white transition-colors">
                Open Console
              </motion.span>
            </Link>
            <a href="https://github.com/Asxhz/agentpm" target="_blank" rel="noopener noreferrer"
              className="inline-flex h-11 px-7 items-center rounded-xl border border-[#1f1f1f] text-sm text-[#666] hover:text-[#999] hover:border-[#2e2e2e] transition-colors">
              GitHub
            </a>
          </div>
        </motion.section>

        {/* GOVERNANCE DEMO */}
        <motion.section {...f} transition={{ delay: 0.15 }} className="pb-24">
          <div className="rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] overflow-hidden">
            <div className="h-8 bg-[#0a0a0a] border-b border-[#1f1f1f] flex items-center px-4 gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#1f1f1f]" />
              <span className="h-2 w-2 rounded-full bg-[#1f1f1f]" />
              <span className="h-2 w-2 rounded-full bg-[#1f1f1f]" />
              <span className="text-[9px] text-[#333] font-[family-name:var(--font-mono)] ml-3">governance engine / live trace</span>
            </div>
            <div className="p-6 space-y-3 font-[family-name:var(--font-mono)] text-[11px]">
              {[
                { verdict: "APPROVED", stage: "Research", provider: "Bright Data", cost: "$0.050", risk: "3", reason: "Within per-tx limit, budget sufficient" },
                { verdict: "APPROVED", stage: "Strategy", provider: "BigQuery AI", cost: "$0.030", risk: "2", reason: "Within limits, 94% budget remaining" },
                { verdict: "ESCALATE", stage: "Design", provider: "Midjourney v6", cost: "$0.100", risk: "42", reason: "Exceeds $0.08 approval threshold" },
                { verdict: "DOWNGRADE", stage: "Design", provider: "Flux Pro", cost: "$0.050", risk: "16", reason: "Cheaper alternative selected automatically" },
                { verdict: "APPROVED", stage: "Deploy", provider: "Vercel", cost: "$0.060", risk: "8", reason: "Within limits, deployment authorized" },
                { verdict: "DENIED", stage: "Premium QA", provider: "SecurityScan", cost: "$0.080", risk: "67", reason: "Would exceed remaining session budget" },
              ].map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.12 }}
                  className="flex items-center gap-3 py-2 px-3 rounded border border-[#1f1f1f]">
                  <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded ${
                    r.verdict === "APPROVED" ? "text-[#ededed] bg-[#1f1f1f]" :
                    r.verdict === "ESCALATE" ? "text-[#f59e0b] bg-[#1f1f1f]" :
                    r.verdict === "DOWNGRADE" ? "text-[#a855f7] bg-[#1f1f1f]" :
                    "text-[#ef4444] bg-[#1f1f1f]"
                  }`}>{r.verdict}</span>
                  <span className="text-[#999] w-20">{r.stage}</span>
                  <span className="text-[#666]">{r.provider}</span>
                  <span className="text-[#444] tabular-nums ml-auto">{r.cost}</span>
                  <span className="text-[#333] tabular-nums">risk {r.risk}</span>
                </motion.div>
              ))}
              <div className="pt-2 border-t border-[#1f1f1f] flex justify-between text-[#444]">
                <span>4 approved, 1 downgraded, 1 denied</span>
                <span>$0.190 spent of $0.500 budget</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* THE QUESTION */}
        <motion.section {...f} transition={{ delay: 0.25 }} className="pb-24 text-center">
          <h2 className="text-2xl font-semibold tracking-tight mb-4">The core problem</h2>
          <p className="text-[15px] text-[#666] max-w-2xl mx-auto leading-relaxed">
            AI agents need to spend money. They need to call APIs, deploy code, buy domains, hire other agents. But giving an autonomous system a wallet with no constraints is dangerous. AgentPM is the governance layer between the agent and the money.
          </p>
        </motion.section>

        {/* HOW IT WORKS */}
        <motion.section {...f} transition={{ delay: 0.3 }} className="pb-24">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-12">How governance works</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "Agent requests payment", desc: "The pipeline identifies a provider and quotes a price. Before any money moves, the request enters the governance engine." },
              { title: "Policy evaluation", desc: "5 possible verdicts: APPROVED, DENIED, ESCALATE (halt for human), DOWNGRADE (find cheaper), REROUTE (try different approach). Not just pass/fail." },
              { title: "Budget enforcement", desc: "Per-agent budgets, per-transaction limits, daily caps, session budgets. The pipeline physically stops when limits are hit. Remaining stages are deferred, not crashed." },
              { title: "Human escalation", desc: "When risk is high, the pipeline halts and presents an interactive approval card. You see the exact cost, budget impact, risk score, and alternatives before approving." },
              { title: "Provider comparison", desc: "For every stage, multiple providers are scored on cost, quality, latency, and reliability. The rejected options are logged. You can see why each decision was made." },
              { title: "Full audit trail", desc: "Every decision, every denial, every reroute, every payment. Downloadable as JSON. Complete forensic replay of the agent's spending behavior." },
            ].map((s, i) => (
              <motion.div key={s.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.06 }}
                className="border border-[#1f1f1f] rounded-xl p-5 bg-[#0a0a0a]">
                <p className="text-[13px] font-medium mb-2">{s.title}</p>
                <p className="text-[11px] text-[#666] leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* GOVERNANCE DEPTH */}
        <motion.section {...f} transition={{ delay: 0.35 }} className="pb-24">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-12">Governance features</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { t: "5-Verdict Engine", d: "APPROVED, DENIED, ESCALATE, DOWNGRADE, REROUTE" },
              { t: "Delegated Budgets", d: "Each sub-agent gets a scoped spending cap" },
              { t: "Strict Mode", d: "One toggle to require approval on every payment" },
              { t: "Risk Scoring", d: "0-100 risk score on every transaction" },
              { t: "Budget Guard", d: "Pipeline stops when budget would be exceeded" },
              { t: "Partial Completion", d: "Graceful degradation, not crash" },
              { t: "Provider Scoring", d: "Cost, quality, latency, reliability comparison" },
              { t: "Approval Cards", d: "Interactive approve/deny with budget impact" },
              { t: "Audit Export", d: "Full JSON trace of every decision" },
              { t: "Quality Gates", d: "Auto-retry with better provider if quality is low" },
              { t: "Chain Restrictions", d: "Only allowed networks can receive payments" },
              { t: "Category Controls", d: "Restrict which tool types agents can use" },
            ].map((f, i) => (
              <motion.div key={f.t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.03 }}
                className="border border-[#1f1f1f] rounded-lg p-3 bg-[#0a0a0a]">
                <p className="text-[11px] font-medium">{f.t}</p>
                <p className="text-[9px] text-[#444] mt-0.5">{f.d}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* TRACK ALIGNMENT */}
        <motion.section {...f} transition={{ delay: 0.4 }} className="pb-24">
          <h2 className="text-xl font-semibold tracking-tight text-center mb-3">Optimized for Track 2</h2>
          <p className="text-[13px] text-[#666] text-center mb-10 max-w-lg mx-auto">Agent Spend Governance and Identity, with deep support from Tracks 3 and 4.</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { n: "Track 02", l: "Spend Governance", d: "Primary. Delegated budgets, 5-verdict policy engine, escalation gates, audit trails, partial completion, strict mode, risk scoring.", primary: true },
              { n: "Track 03", l: "Pay-Per-Call", d: "Every provider quoted and scored. Economic reasoning drives selection. Payment intents with signed EIP-712 authorizations.", primary: false },
              { n: "Track 04", l: "Multi-Agent", d: "Overseer delegates to sub-agents with scoped budgets. Agents can be constrained or revoked. Hierarchical authority model.", primary: false },
            ].map((t, i) => (
              <motion.div key={t.n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 + i * 0.05 }}
                className={`rounded-xl border p-5 ${t.primary ? "border-[#2e2e2e] bg-[#0a0a0a]" : "border-[#1f1f1f] bg-[#0a0a0a]"}`}>
                <span className={`text-[10px] font-[family-name:var(--font-mono)] font-medium ${t.primary ? "text-[#ededed]" : "text-[#666]"}`}>{t.n}</span>
                <p className={`text-[13px] font-medium mt-1 ${t.primary ? "text-[#ededed]" : "text-[#999]"}`}>{t.l}</p>
                <p className="text-[10px] text-[#444] mt-2 leading-relaxed">{t.d}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* WHAT MAKES THIS DIFFERENT */}
        <motion.section {...f} transition={{ delay: 0.45 }} className="pb-24 text-center">
          <h2 className="text-xl font-semibold tracking-tight mb-4">What makes this different</h2>
          <div className="max-w-2xl mx-auto text-[13px] text-[#666] leading-relaxed space-y-3">
            <p>Most agent demos are ungoverned: the agent has a wallet and spends freely. AgentPM puts the operator in control. Every payment goes through a governance engine. Every decision is logged. Every risky action requires human approval.</p>
            <p>The system doesn't just check budgets. It evaluates risk, compares providers, considers downstream budget impact, and can automatically downgrade to cheaper alternatives when budget pressure rises. When it can't complete everything, it finishes what it can and defers the rest.</p>
            <p>This is the control layer enterprises would need before deploying autonomous agents that spend real money.</p>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section {...f} transition={{ delay: 0.5 }} className="pb-24 text-center">
          <Link href="/app">
            <motion.span whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="inline-flex h-12 px-8 items-center rounded-xl bg-[#ededed] text-black text-sm font-semibold hover:bg-white transition-colors">
              Try AgentPM
            </motion.span>
          </Link>
        </motion.section>

        <footer className="border-t border-[#1f1f1f] py-6 flex items-center justify-between text-[10px] text-[#333] font-[family-name:var(--font-mono)]">
          <span>AgentPM / OWS Hackathon 2026</span>
          <span>Open Wallet Standard + x402 + Claude</span>
        </footer>
      </div>
    </div>
  );
}
