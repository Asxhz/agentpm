"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";

// ================================================================
// CONSTANTS & TYPES
// ================================================================

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

interface ChatMessage { id: string; role: "user" | "assistant"; content: string; stages?: StageResult[]; summary?: Record<string, unknown>; timestamp: string; isStreaming?: boolean }
interface StageResult { stageId: string; stageName: string; stageDescription?: string; stageIndex: number; stageTotal: number; provider?: string; cost?: number; output?: string; txHash?: string; latencyMs?: number; status: "pending" | "running" | "done"; providers?: { name: string; price: number; quality: number; latency: number; score: number }[]; governancePassed?: boolean; governanceVerdict?: string; paymentTxHash?: string; paymentAmount?: number; newBalance?: number }
interface WalletInfo { balance: number; address: string; totalSpent: number; txCount: number }
interface TxInfo { toolName: string; amount: number; txHash: string; status: string }
interface GovDecision { id: string; type: string; amount: number; provider: string; riskScore: number; timestamp: string; stageName?: string }
interface DelegatedAgent { id: string; name: string; role: string; budget: number; spent: number; trust: number; status: "active" | "constrained" | "revoked" | "completed"; taskCount: number; lastAction?: string }

type PaymentMode = "simulation" | "testnet" | "real";
type CenterTab = "chat" | "agents" | "audit";
type AuditFilter = "all" | "APPROVED" | "DENIED" | "ESCALATE" | "DOWNGRADE";

// ================================================================
// COPY BUTTON
// ================================================================

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
    className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1 rounded hover:bg-surface-2 transition-all text-text-muted hover:text-text">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    {ok && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-accent">copied</span>}
  </button>;
}

// ================================================================
// MAIN PAGE COMPONENT
// ================================================================

export default function AppPage() {
  // ---- existing state ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [liveStages, setLiveStages] = useState<StageResult[]>([]);
  const [budget, setBudget] = useState(5);
  const [priority, setPriority] = useState("balanced");
  const [allTxns, setAllTxns] = useState<TxInfo[]>([]);
  const [deployedSites, setDeployedSites] = useState<{ subdomain: string; url: string; projectName: string }[]>([]);
  const [strictModeOn, setStrictModeOn] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ approvalId: string; stageName: string; provider: string; amount: number; reason: string; budgetImpact: { currentSpend: number; projectedSpend: number; sessionBudget: number; percentUsed: number; remaining: number }; riskScore: number } | null>(null);
  const [govTimeline, setGovTimeline] = useState<GovDecision[]>([]);

  // ---- new state ----
  const [centerTab, setCenterTab] = useState<CenterTab>("chat");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("simulation");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [delegatedAgents, setDelegatedAgents] = useState<DelegatedAgent[]>([
    { id: "overseer", name: "Overseer PM", role: "Orchestrator", budget: 5.0, spent: 0, trust: 100, status: "active", taskCount: 0, lastAction: "Awaiting task" },
    { id: "researcher", name: "Research Agent", role: "Web Research", budget: 1.5, spent: 0, trust: 85, status: "active", taskCount: 0 },
    { id: "builder", name: "Builder Agent", role: "Code & Deploy", budget: 2.0, spent: 0, trust: 90, status: "active", taskCount: 0 },
    { id: "auditor", name: "Audit Agent", role: "Security Review", budget: 0.5, spent: 0, trust: 95, status: "active", taskCount: 0 },
    { id: "designer", name: "Design Agent", role: "UI/UX Assets", budget: 1.0, spent: 0, trust: 80, status: "active", taskCount: 0 },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { address, isConnected } = useAccount();
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
  const usdcBalance = usdcRaw ? parseFloat(formatUnits(usdcRaw, 6)) : 0;

  const refreshWallet = useCallback(() => {
    fetch("/api/wallet").then(r => r.json()).then(d => {
      if (d.wallet) setWallet({ balance: d.wallet.balance, address: d.wallet.address, totalSpent: d.totalSpent || 0, txCount: d.transactions?.length || 0 });
      if (d.transactions) setAllTxns(d.transactions);
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshWallet(); }, [refreshWallet]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, liveStages]);

  // Update delegated agents from pipeline events
  useEffect(() => {
    if (!liveStages.length && !allTxns.length) return;
    setDelegatedAgents(prev => {
      const next = [...prev];
      const overseer = next.find(a => a.id === "overseer");
      if (overseer) {
        overseer.spent = wallet?.totalSpent || 0;
        overseer.budget = budget;
        overseer.taskCount = messages.filter(m => m.role === "user").length;
        overseer.status = isLoading ? "active" : overseer.taskCount > 0 ? "completed" : "active";
        overseer.lastAction = isLoading ? "Executing pipeline..." : "Idle";
      }
      // distribute spend among sub-agents based on stages
      const completedStages = liveStages.filter(s => s.status === "done");
      const researchStages = completedStages.filter(s => s.stageName?.toLowerCase().includes("research") || s.stageName?.toLowerCase().includes("discover"));
      const buildStages = completedStages.filter(s => s.stageName?.toLowerCase().includes("build") || s.stageName?.toLowerCase().includes("deploy") || s.stageName?.toLowerCase().includes("generat"));
      const auditStages = completedStages.filter(s => s.stageName?.toLowerCase().includes("audit") || s.stageName?.toLowerCase().includes("security") || s.stageName?.toLowerCase().includes("review"));
      const designStages = completedStages.filter(s => s.stageName?.toLowerCase().includes("design") || s.stageName?.toLowerCase().includes("asset") || s.stageName?.toLowerCase().includes("ui"));

      const researcher = next.find(a => a.id === "researcher");
      if (researcher) {
        researcher.spent = researchStages.reduce((sum, s) => sum + (s.cost || 0), 0);
        researcher.taskCount = researchStages.length;
        researcher.status = researchStages.length > 0 ? "active" : "active";
      }
      const builder = next.find(a => a.id === "builder");
      if (builder) {
        builder.spent = buildStages.reduce((sum, s) => sum + (s.cost || 0), 0);
        builder.taskCount = buildStages.length;
      }
      const auditor = next.find(a => a.id === "auditor");
      if (auditor) {
        auditor.spent = auditStages.reduce((sum, s) => sum + (s.cost || 0), 0);
        auditor.taskCount = auditStages.length;
      }
      const designer = next.find(a => a.id === "designer");
      if (designer) {
        designer.spent = designStages.reduce((sum, s) => sum + (s.cost || 0), 0);
        designer.taskCount = designStages.length;
      }
      return next;
    });
  }, [liveStages, allTxns, wallet, budget, messages, isLoading]);

  const resetAll = useCallback(async () => {
    await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", balance: 50.0 }) });
    refreshWallet(); setMessages([]); setLiveStages([]); setAllTxns([]); setGovTimeline([]);
    setDelegatedAgents(prev => prev.map(a => ({ ...a, spent: 0, taskCount: 0, status: "active" as const, lastAction: a.id === "overseer" ? "Awaiting task" : undefined })));
  }, [refreshWallet]);

  // ---- SSE send function (preserved from original) ----
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: text, timestamp: new Date().toISOString() }]);
    setInput(""); setIsLoading(true); setLiveStages([]);
    const aId = (Date.now() + 1).toString();
    let ac = ""; let stages: StageResult[] = []; let summary: Record<string, unknown> | undefined;
    setMessages(prev => [...prev, { id: aId, role: "assistant", content: "", timestamp: new Date().toISOString(), isStreaming: true }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, sessionId, budget, priority }) });
      const reader = res.body?.getReader(); if (!reader) return;
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue; const raw = line.slice(6).trim(); if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw) as { type: string; data: Record<string, unknown> };
            if (ev.type === "text_delta") { ac += ev.data.text as string; setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: ac } : m)); }
            if (ev.type === "stage_event") {
              const se = ev.data as Record<string, unknown>; const sd = se.data as Record<string, unknown>;
              if (se.type === "discovery") { stages = [...stages, { stageId: sd.stageId as string, stageName: sd.stageName as string, stageDescription: sd.stageDescription as string, stageIndex: sd.stageIndex as number, stageTotal: sd.stageTotal as number, status: "running" }]; setLiveStages([...stages]); }
              if (se.type === "evaluation") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, providers: sd.providers as StageResult["providers"] } : s); setLiveStages([...stages]); }
              if (se.type === "governance") {
                const verdict = sd.verdict as string || (sd.allowed ? "APPROVED" : "DENIED");
                stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, governancePassed: verdict === "APPROVED", governanceVerdict: verdict } : s);
                setLiveStages([...stages]);
                if (sd.budgetImpact) {
                  const bi = sd.budgetImpact as Record<string, number>;
                  setGovTimeline(prev => [...prev, {
                    id: Math.random().toString(36).slice(2),
                    type: verdict,
                    amount: bi.projectedSpend - bi.currentSpend,
                    provider: (sd.provider as string) || "",
                    riskScore: sd.riskScore as number || 0,
                    timestamp: new Date().toISOString(),
                    stageName: sd.stageName as string || "",
                  }]);
                }
              }
              if (se.type === "approval_required") {
                setPendingApproval(sd as typeof pendingApproval);
              }
              if (se.type === "payment" && sd.phase === "settled") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, paymentTxHash: sd.txHash as string, paymentAmount: sd.amount as number, newBalance: sd.newBalance as number } : s); setLiveStages([...stages]); setWallet(w => w ? { ...w, balance: sd.newBalance as number } : w); }
              if (se.type === "decision") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, provider: sd.provider as string, cost: sd.price as number } : s); setLiveStages([...stages]); }
              if (se.type === "result") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, status: "done" as const, output: sd.output as string, txHash: sd.txHash as string, latencyMs: sd.latencyMs as number, provider: sd.provider as string, cost: sd.cost as number, truthLabel: sd.truthLabel as string } : s); setLiveStages([...stages]); }
            }
            if (ev.type === "execution_complete") { summary = ev.data; refreshWallet(); }
          } catch { /* skip */ }
        }
      }
    } catch (err) { ac = `Error: ${err instanceof Error ? err.message : "Connection failed"}`; }
    setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: ac.replace(/\[EXECUTE:[^\]]*\]/, "").trim(), stages: stages.length > 0 ? stages : undefined, summary, isStreaming: false } : m));
    setLiveStages([]); setIsLoading(false); refreshWallet(); inputRef.current?.focus();
  }, [input, isLoading, sessionId, budget, priority, refreshWallet]);

  const filteredAuditEntries = useMemo(() => {
    if (auditFilter === "all") return govTimeline;
    return govTimeline.filter(e => e.type === auditFilter);
  }, [govTimeline, auditFilter]);

  const totalAgentBudget = delegatedAgents.reduce((s, a) => s + a.budget, 0);
  const totalAgentSpent = delegatedAgents.reduce((s, a) => s + a.spent, 0);

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* ============ HEADER ============ */}
      <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="shrink-0 h-11 px-4 flex items-center justify-between border-b border-border bg-bg/80 backdrop-blur-lg z-50">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#logo-grad)" />
              <path d="M10 16.5L14 20.5L22 12.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs><linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#22c55e" /><stop offset="1" stopColor="#06b6d4" /></linearGradient></defs>
            </svg>
            <span className="text-xs font-semibold tracking-tight">AgentPM</span>
          </Link>
          <span className="text-[9px] text-text-muted font-[family-name:var(--font-mono)]">{sessionId.slice(0, 6)}</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-text-dim font-[family-name:var(--font-mono)]">OWS Track 2</span>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-[family-name:var(--font-mono)]">
          {isLoading && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-accent flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" />running</motion.span>}
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${
            paymentMode === "simulation" ? "bg-surface-3 text-text-muted" :
            paymentMode === "testnet" ? "bg-blue/15 text-blue" :
            "bg-red/15 text-red"
          }`}>{paymentMode}</span>
          <span className="text-text-muted">x402 / base-sepolia</span>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
      </motion.header>

      <div className="flex-1 flex overflow-hidden">
        {/* ============ LEFT SIDEBAR (240px) ============ */}
        <aside className="w-60 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {/* Wallet Connect */}
            <div className="[&_button]:!rounded-lg [&_button]:!text-[10px] [&_button]:!h-8">
              <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            </div>

            {isConnected && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="bg-surface rounded-lg p-3 border border-border">
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1">On-Chain (Base Sepolia)</span>
                <span className="text-xl font-semibold font-[family-name:var(--font-mono)] tabular-nums">${usdcBalance.toFixed(2)}</span>
                <span className="text-[9px] text-text-muted ml-1">USDC</span>
                <a href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                  className="text-[8px] text-accent hover:underline block mt-1 font-[family-name:var(--font-mono)]">View on BaseScan</a>
                {usdcBalance === 0 && (
                  <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                    <span className="text-[8px] text-amber block">Need testnet funds?</span>
                    <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-[8px] text-accent hover:underline block">Get USDC</a>
                    <a href="https://portal.cdp.coinbase.com/products/faucet" target="_blank" rel="noopener noreferrer" className="text-[8px] text-accent hover:underline block">Get ETH</a>
                  </div>
                )}
              </motion.div>
            )}

            {/* Budget Controls */}
            {wallet && (
              <>
                <div className="bg-surface rounded-lg p-3 border border-border">
                  <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Session Budget</span>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-lg font-semibold font-[family-name:var(--font-mono)] tabular-nums">${wallet.balance.toFixed(2)}</span>
                    <span className="text-[8px] text-text-muted">${wallet.totalSpent.toFixed(3)} used</span>
                  </div>
                  <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-accent rounded-full" animate={{ width: `${Math.min((wallet.totalSpent / (wallet.totalSpent + wallet.balance)) * 100, 100)}%` }} transition={{ duration: 0.4 }} />
                  </div>
                </div>

                <div className="bg-surface rounded-lg p-3 border border-border space-y-2">
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-[8px] uppercase tracking-widest text-text-dim">Budget Limit</span><span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums">${budget}</span></div>
                    <input type="range" min="1" max="10" step="0.5" value={budget} onChange={e => setBudget(parseFloat(e.target.value))}
                      className="w-full h-px bg-border appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
                  </div>
                  <div>
                    <span className="text-[8px] uppercase tracking-widest text-text-dim block mb-1">Priority</span>
                    <div className="grid grid-cols-4 gap-1">
                      {(["cost","quality","speed","balanced"] as const).map(p => (
                        <button key={p} onClick={() => setPriority(p)}
                          className={`text-[7px] py-1 rounded font-[family-name:var(--font-mono)] transition-all capitalize ${
                            priority === p ? "bg-surface-3 text-text" : "text-text-muted hover:text-text-dim"
                          }`}>{p}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Payment Mode Selector */}
            <PaymentModeSelector mode={paymentMode} onSelect={setPaymentMode} />

            {/* Active Policies */}
            <div className="bg-surface rounded-lg p-3 border border-border">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Active Policies</span>
              <div className="space-y-1 text-[9px] font-[family-name:var(--font-mono)]">
                <div className="flex justify-between"><span className="text-text-muted">per tx max</span><span>$2.00</span></div>
                <div className="flex justify-between"><span className="text-text-muted">daily max</span><span>$20.00</span></div>
                <div className="flex justify-between"><span className="text-text-muted">escalation at</span><span className="text-amber">$0.50</span></div>
                <div className="flex justify-between"><span className="text-text-muted">network</span><span>base-sepolia</span></div>
                <div className="flex justify-between"><span className="text-text-muted">mode</span><span className={paymentMode === "simulation" ? "text-text-muted" : paymentMode === "testnet" ? "text-blue" : "text-red"}>{paymentMode}</span></div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-1.5">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block">Quick Actions</span>
              <div className="flex gap-1.5">
                <Link href="/hosting" className="flex-1 text-center py-1.5 rounded-lg text-[8px] text-text-muted hover:text-text bg-surface border border-border transition-colors">Hosting</Link>
                <button onClick={resetAll} className="flex-1 py-1.5 rounded-lg text-[8px] text-text-muted hover:text-text bg-surface border border-border transition-colors">Reset</button>
              </div>
              <button onClick={() => setCenterTab("audit")} className="w-full py-1.5 rounded-lg text-[8px] text-text-muted hover:text-text bg-surface border border-border transition-colors">
                View Audit Log ({govTimeline.length})
              </button>
              <button onClick={() => setCenterTab("agents")} className="w-full py-1.5 rounded-lg text-[8px] text-text-muted hover:text-text bg-surface border border-border transition-colors">
                Agent Delegation Graph
              </button>
            </div>

            {/* Deployed Sites */}
            <div className="bg-surface rounded-lg p-3 border border-border">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Deployed Sites</span>
              {deployedSites.length === 0 ? <p className="text-[8px] text-text-muted">No deployments</p> : (
                deployedSites.map(s => (
                  <a key={s.subdomain} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-[8px] text-accent hover:underline font-[family-name:var(--font-mono)]">{s.url}</a>
                ))
              )}
              <button onClick={() => fetch("/api/deploy").then(r => r.json()).then(d => setDeployedSites(d.sites || []))} className="text-[7px] text-text-muted hover:text-text-dim mt-1">refresh</button>
            </div>
          </div>
        </aside>

        {/* ============ CENTER PANEL ============ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Center tabs */}
          <div className="shrink-0 border-b border-border bg-bg/60 backdrop-blur-sm">
            <div className="flex gap-0 px-4">
              {([
                { key: "chat" as const, label: "Chat", icon: <ChatIcon /> },
                { key: "agents" as const, label: "Agents", icon: <AgentsIcon /> },
                { key: "audit" as const, label: `Audit (${govTimeline.length})`, icon: <AuditIcon /> },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setCenterTab(tab.key)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-medium transition-colors ${
                    centerTab === tab.key ? "text-text" : "text-text-muted hover:text-text-dim"
                  }`}>
                  {tab.icon}
                  {tab.label}
                  {centerTab === tab.key && (
                    <motion.div layoutId="centerTabIndicator" className="absolute bottom-0 left-0 right-0 h-px bg-accent" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {centerTab === "chat" && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
                {/* Chat scroll area */}
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto px-5 py-6 space-y-1">
                    {/* EMPTY STATE */}
                    {messages.length === 0 && (
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pt-16 pb-8 text-center space-y-5">
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
                          className="mx-auto w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center">
                          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                            <rect width="32" height="32" rx="8" fill="url(#lg2)" />
                            <path d="M10 16.5L14 20.5L22 12.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            <defs><linearGradient id="lg2" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#22c55e" /><stop offset="1" stopColor="#06b6d4" /></linearGradient></defs>
                          </svg>
                        </motion.div>
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight mb-1">Operator Console</h2>
                          <p className="text-[12px] text-text-dim max-w-md mx-auto leading-relaxed">Agent Spend Governance. I plan projects, delegate to sub-agents, enforce budgets, and pay via x402. Every payment is governed, auditable, and traceable.</p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 pt-1">
                          {["Build a landing page for my startup", "Run a security audit on my API", "Research top 5 competitors in my space", "Create all assets for a product launch"].map((s, i) => (
                            <motion.button key={s} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}
                              onClick={() => setInput(s)}
                              className="text-[10px] px-3 py-1.5 rounded-lg border border-border text-text-dim hover:text-text hover:border-border-bright hover:bg-surface transition-all">
                              {s}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* MESSAGES */}
                    <AnimatePresence>
                      {messages.map(msg => (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                          {msg.role === "user" && (
                            <div className="flex gap-3 py-4">
                              <div className="h-6 w-6 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-[8px] font-[family-name:var(--font-mono)] text-text-dim font-bold">U</span>
                              </div>
                              <div className="text-[13px] text-text leading-relaxed pt-0.5">{msg.content}</div>
                            </div>
                          )}
                          {msg.role === "assistant" && (
                            <div className="flex gap-3 py-4 border-t border-border/30 group relative">
                              <div className="h-6 w-6 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                                <svg width="12" height="12" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="url(#lg3)" /><path d="M10 16.5L14 20.5L22 12.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><defs><linearGradient id="lg3" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#22c55e" /><stop offset="1" stopColor="#06b6d4" /></linearGradient></defs></svg>
                              </div>
                              <div className="flex-1 min-w-0 space-y-4">
                                {msg.content && (
                                  <div className="relative">
                                    <div className="text-[13px] text-text-secondary leading-[1.75] [&_strong]:text-text [&_strong]:font-semibold [&_table]:w-full [&_table]:text-[10px] [&_table]:font-[family-name:var(--font-mono)] [&_table]:my-2 [&_th]:text-left [&_th]:px-2 [&_th]:py-1.5 [&_th]:border-b [&_th]:border-border [&_th]:text-text-muted [&_th]:font-medium [&_td]:px-2 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-border/50 [&_ul]:space-y-1 [&_ul]:my-2 [&_ol]:space-y-1 [&_ol]:my-2 [&_li]:text-text-dim [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px] [&_code]:font-[family-name:var(--font-mono)] [&_a]:text-accent [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-xs [&_h4]:font-medium [&_p]:mb-2 [&_hr]:border-border [&_hr]:my-3">
                                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                                      {msg.isStreaming && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-accent">|</motion.span>}
                                    </div>
                                    <CopyBtn text={msg.content} />
                                  </div>
                                )}
                                {msg.stages && msg.stages.length > 0 && <div className="space-y-2">{msg.stages.map((s, i) => <StageCard key={s.stageId} stage={s} index={i} />)}</div>}
                                {msg.summary && <SummaryCard data={msg.summary} />}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {liveStages.length > 0 && (
                      <div className="flex gap-3 py-4 border-t border-border/30">
                        <div className="h-6 w-6 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                          <svg width="12" height="12" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="url(#lg4)" /><path d="M10 16.5L14 20.5L22 12.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><defs><linearGradient id="lg4" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#22c55e" /><stop offset="1" stopColor="#06b6d4" /></linearGradient></defs></svg>
                        </div>
                        <div className="flex-1 space-y-2">{liveStages.map((s, i) => <StageCard key={s.stageId} stage={s} index={i} live />)}</div>
                      </div>
                    )}
                    {/* Approval Card */}
                    {pendingApproval && (
                      <ApprovalCard approval={pendingApproval} onRespond={async (id, approved) => {
                        setPendingApproval(null);
                        setIsLoading(true);
                        try {
                          const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "", sessionId, approvalResponse: { approvalId: id, approved } }) });
                          const reader = res.body?.getReader(); if (!reader) return;
                          const dec = new TextDecoder(); let buf = ""; let ac = "";
                          const aId2 = (Date.now() + 1).toString();
                          setMessages(prev => [...prev, { id: aId2, role: "assistant", content: "", timestamp: new Date().toISOString(), isStreaming: true }]);
                          while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; const raw = line.slice(6).trim(); if (raw === "[DONE]") continue; try { const ev = JSON.parse(raw); if (ev.type === "text_delta") { ac += ev.data.text; setMessages(prev => prev.map(m => m.id === aId2 ? { ...m, content: ac } : m)); } } catch {} } }
                          setMessages(prev => prev.map(m => m.id === aId2 ? { ...m, isStreaming: false } : m));
                        } finally { setIsLoading(false); refreshWallet(); }
                      }} />
                    )}
                    {isLoading && liveStages.length === 0 && !pendingApproval && messages[messages.length - 1]?.role === "user" && (
                      <div className="flex gap-3 py-4">
                        <div className="h-6 w-6 rounded-lg bg-accent/15 flex items-center justify-center shrink-0"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="url(#lg5)" /><path d="M10 16.5L14 20.5L22 12.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><defs><linearGradient id="lg5" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#22c55e" /><stop offset="1" stopColor="#06b6d4" /></linearGradient></defs></svg></div>
                        <div className="flex items-center gap-1.5 pt-1">
                          {[0,1,2].map(i => <motion.span key={i} animate={{ opacity: [0.15, 0.6, 0.15] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-text-muted" />)}
                        </div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                </div>

                {/* INPUT */}
                <div className="shrink-0 border-t border-border bg-bg/80 backdrop-blur-lg">
                  <div className="max-w-3xl mx-auto px-5 py-3">
                    <div className="flex gap-2 items-end">
                      <textarea ref={inputRef} value={input}
                        onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Describe your project, ask questions, or give feedback..."
                        disabled={isLoading} rows={1}
                        className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-[13px] resize-none focus:outline-none focus:border-border-bright placeholder:text-text-muted transition-colors min-h-[42px] max-h-[120px]" />
                      <motion.button onClick={send} disabled={isLoading || !input.trim()}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="h-[42px] px-5 rounded-xl bg-white text-[#09090b] text-xs font-semibold disabled:opacity-15 disabled:cursor-not-allowed transition-colors shrink-0">
                        Send
                      </motion.button>
                    </div>
                    <div className="flex justify-between mt-1.5 text-[8px] font-[family-name:var(--font-mono)] text-text-muted">
                      <span>{messages.filter(m => m.role === "user").length} messages / ${budget} budget / {priority} / {paymentMode}</span>
                      <span>enter to send</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {centerTab === "agents" && (
              <motion.div key="agents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto">
                <AgentDelegationView agents={delegatedAgents} totalBudget={totalAgentBudget} totalSpent={totalAgentSpent} />
              </motion.div>
            )}

            {centerTab === "audit" && (
              <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto">
                <AuditLogView entries={filteredAuditEntries} allEntries={govTimeline} filter={auditFilter} onFilterChange={setAuditFilter} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ============ RIGHT PANEL (280px) ============ */}
        <aside className="w-70 shrink-0 border-l border-border flex flex-col overflow-hidden">
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {/* Spend Ring */}
            <div className="bg-surface rounded-lg p-4 border border-border">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-3">Spend Overview</span>
              <div className="flex items-center justify-center mb-3">
                <SpendRing spent={wallet?.totalSpent || 0} limit={budget} size={80} />
              </div>
              <div className="text-center">
                <span className="text-lg font-semibold font-[family-name:var(--font-mono)] tabular-nums">${(wallet?.totalSpent || 0).toFixed(3)}</span>
                <span className="text-[9px] text-text-muted"> / ${budget}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
                <div className="text-center">
                  <span className="text-[7px] uppercase tracking-widest text-text-dim block">Txns</span>
                  <span className="text-[11px] font-semibold font-[family-name:var(--font-mono)] tabular-nums">{allTxns.length}</span>
                </div>
                <div className="text-center">
                  <span className="text-[7px] uppercase tracking-widest text-text-dim block">Stages</span>
                  <span className="text-[11px] font-semibold font-[family-name:var(--font-mono)] tabular-nums">{liveStages.filter(s => s.status === "done").length}</span>
                </div>
                <div className="text-center">
                  <span className="text-[7px] uppercase tracking-widest text-text-dim block">Agents</span>
                  <span className="text-[11px] font-semibold font-[family-name:var(--font-mono)] tabular-nums">{delegatedAgents.filter(a => a.status === "active").length}</span>
                </div>
              </div>
            </div>

            {/* Policy Timeline */}
            <div className="bg-surface rounded-lg p-3 border border-border">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Decision Timeline</span>
              {govTimeline.length === 0 ? <p className="text-[8px] text-text-muted">No decisions yet</p> : (
                <div className="space-y-1">
                  {govTimeline.slice(-12).reverse().map(e => (
                    <motion.div key={e.id} initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-1.5 text-[8px]">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        e.type === "APPROVED" ? "bg-accent" : e.type === "DENIED" ? "bg-red" : e.type === "ESCALATE" ? "bg-amber" : e.type === "DOWNGRADE" ? "bg-purple" : "bg-cyan"
                      }`} />
                      <span className="text-text-muted font-[family-name:var(--font-mono)]">{e.type}</span>
                      <span className="text-text-muted ml-auto tabular-nums font-[family-name:var(--font-mono)]">${e.amount.toFixed(3)}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Strict Mode */}
            <div className="bg-surface rounded-lg p-3 border border-border flex items-center justify-between">
              <div>
                <span className="text-[9px] font-medium block">Strict Mode</span>
                <span className="text-[7px] text-text-muted">Approve every payment</span>
              </div>
              <button onClick={async () => {
                const next = !strictModeOn;
                setStrictModeOn(next);
                await fetch("/api/governance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: next ? "strict-on" : "strict-off" }) });
              }} className={`w-8 h-4 rounded-full transition-colors ${strictModeOn ? "bg-amber" : "bg-surface-3"}`}>
                <motion.div animate={{ x: strictModeOn ? 16 : 2 }} className="w-3 h-3 rounded-full bg-white" />
              </button>
            </div>

            {/* Escalation Inbox */}
            <div className="bg-surface rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim">Escalation Inbox</span>
                {pendingApproval && <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />}
              </div>
              {pendingApproval ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                    <span className="text-[9px] font-medium text-amber">Pending approval</span>
                  </div>
                  <div className="text-[8px] text-text-dim font-[family-name:var(--font-mono)]">
                    {pendingApproval.stageName} - ${pendingApproval.amount.toFixed(4)}
                  </div>
                  <button onClick={() => setCenterTab("chat")} className="text-[8px] text-accent hover:underline">Go to chat to respond</button>
                </div>
              ) : (
                <p className="text-[8px] text-text-muted">No pending escalations</p>
              )}
              {govTimeline.filter(e => e.type === "ESCALATE").length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="text-[8px] text-text-muted">{govTimeline.filter(e => e.type === "ESCALATE").length} total escalations this session</span>
                </div>
              )}
            </div>

            {/* Agent Budget Breakdown */}
            <div className="bg-surface rounded-lg p-3 border border-border">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-2">Agent Budgets</span>
              <div className="space-y-2">
                {delegatedAgents.filter(a => a.id !== "overseer").map(agent => (
                  <div key={agent.id} className="space-y-0.5">
                    <div className="flex justify-between text-[8px]">
                      <span className="text-text-dim">{agent.name}</span>
                      <span className="font-[family-name:var(--font-mono)] tabular-nums">${agent.spent.toFixed(3)}</span>
                    </div>
                    <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          agent.status === "active" ? "bg-accent" :
                          agent.status === "constrained" ? "bg-amber" :
                          agent.status === "revoked" ? "bg-red" : "bg-text-muted"
                        }`}
                        animate={{ width: `${Math.min((agent.spent / Math.max(agent.budget, 0.01)) * 100, 100)}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-surface rounded-lg p-3 border border-border">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">{allTxns.length} Transactions</span>
              {allTxns.length === 0 ? <p className="text-[8px] text-text-muted">No activity</p> : (
                <div className="space-y-1">
                  {allTxns.slice(-6).reverse().map((tx, i) => (
                    <div key={tx.txHash + i} className="flex justify-between items-center text-[8px]">
                      <span className="text-text-dim truncate mr-2">{tx.toolName}</span>
                      <span className="font-[family-name:var(--font-mono)] tabular-nums text-red shrink-0">-${tx.amount.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ================================================================
// PAYMENT MODE SELECTOR
// ================================================================

function PaymentModeSelector({ mode, onSelect }: { mode: PaymentMode; onSelect: (m: PaymentMode) => void }) {
  const modes: { key: PaymentMode; label: string; desc: string; color: string; borderColor: string; disabled?: boolean }[] = [
    { key: "simulation", label: "Simulation", desc: "No real transactions", color: "text-text-muted", borderColor: "border-surface-3" },
    { key: "testnet", label: "Testnet", desc: "EIP-712 signing, simulated settlement", color: "text-blue", borderColor: "border-blue/30" },
    { key: "real", label: "Real", desc: "Live mainnet payments", color: "text-red", borderColor: "border-red/30", disabled: true },
  ];

  return (
    <div className="bg-surface rounded-lg p-3 border border-border">
      <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-2">Payment Mode</span>
      <div className="space-y-1.5">
        {modes.map(m => (
          <button key={m.key} onClick={() => !m.disabled && onSelect(m.key)}
            disabled={m.disabled}
            className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
              mode === m.key ? `${m.borderColor} bg-surface-2` : "border-transparent hover:bg-surface-2"
            } ${m.disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
            <span className={`h-2 w-2 rounded-full shrink-0 ${
              m.key === "simulation" ? "bg-text-muted" :
              m.key === "testnet" ? "bg-blue" : "bg-red"
            } ${mode === m.key ? `ring-2 ring-offset-1 ring-offset-surface ${
              m.key === "simulation" ? "ring-text-muted" : m.key === "testnet" ? "ring-blue" : "ring-red"
            }` : ""}`} />
            <div>
              <span className={`text-[9px] font-medium block ${mode === m.key ? m.color : "text-text-dim"}`}>{m.label}</span>
              <span className="text-[7px] text-text-muted">{m.desc}</span>
            </div>
            {m.disabled && <span className="text-[6px] uppercase tracking-widest text-red ml-auto">locked</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// AGENT DELEGATION VIEW
// ================================================================

function AgentDelegationView({ agents, totalBudget, totalSpent }: { agents: DelegatedAgent[]; totalBudget: number; totalSpent: number }) {
  const overseer = agents.find(a => a.id === "overseer");
  const subAgents = agents.filter(a => a.id !== "overseer");

  const statusColor = (s: DelegatedAgent["status"]) => ({
    active: "border-accent/40 bg-accent/5",
    constrained: "border-amber/40 bg-amber/5",
    revoked: "border-red/40 bg-red/5",
    completed: "border-text-muted/30 bg-surface",
  }[s]);

  const statusDot = (s: DelegatedAgent["status"]) => ({
    active: "bg-accent",
    constrained: "bg-amber animate-pulse",
    revoked: "bg-red",
    completed: "bg-text-muted",
  }[s]);

  const statusLabel = (s: DelegatedAgent["status"]) => ({
    active: "Active",
    constrained: "Constrained",
    revoked: "Revoked",
    completed: "Completed",
  }[s]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Agent Delegation Graph</h2>
          <p className="text-[10px] text-text-dim mt-0.5">Hierarchical budget delegation with trust scoring and lifecycle management</p>
        </div>
        <div className="flex items-center gap-4 text-[8px] font-[family-name:var(--font-mono)]">
          <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /><span className="text-text-muted">active</span></div>
          <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber" /><span className="text-text-muted">constrained</span></div>
          <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red" /><span className="text-text-muted">revoked</span></div>
          <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-text-muted" /><span className="text-text-muted">completed</span></div>
        </div>
      </div>

      {/* Overseer node */}
      {overseer && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-sm mb-2">
          <div className={`rounded-xl border-2 p-4 ${statusColor(overseer.status)}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[11px] font-semibold block">{overseer.name}</span>
                  <span className="text-[8px] text-text-dim">{overseer.role}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusDot(overseer.status)}`} />
                <span className="text-[8px] font-[family-name:var(--font-mono)] text-text-dim">{statusLabel(overseer.status)}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <span className="text-[7px] uppercase tracking-widest text-text-dim block">Total Budget</span>
                <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums">${totalBudget.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[7px] uppercase tracking-widest text-text-dim block">Spent</span>
                <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums">${totalSpent.toFixed(3)}</span>
              </div>
              <div>
                <span className="text-[7px] uppercase tracking-widest text-text-dim block">Trust</span>
                <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums">{overseer.trust}%</span>
              </div>
            </div>
            {overseer.lastAction && <span className="text-[8px] text-text-muted mt-2 block font-[family-name:var(--font-mono)]">{overseer.lastAction}</span>}
          </div>
        </motion.div>
      )}

      {/* Connection lines */}
      <div className="flex justify-center mb-2">
        <svg width="400" height="40" className="overflow-visible">
          {subAgents.map((_, i) => {
            const totalAgents = subAgents.length;
            const startX = 200;
            const endX = (i / (totalAgents - 1)) * 360 + 20;
            return (
              <motion.path key={i}
                d={`M ${startX} 0 C ${startX} 20, ${endX} 20, ${endX} 40`}
                fill="none" stroke="#27272a" strokeWidth="1" strokeDasharray="3 3"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              />
            );
          })}
        </svg>
      </div>

      {/* Sub-agent cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {subAgents.map((agent, i) => (
          <motion.div key={agent.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.08 }}
            className={`rounded-xl border p-3 ${statusColor(agent.status)} transition-all hover:scale-[1.02]`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusDot(agent.status)}`} />
                <span className="text-[10px] font-semibold">{agent.name}</span>
              </div>
              <span className={`text-[7px] px-1.5 py-0.5 rounded font-medium ${
                agent.status === "active" ? "bg-accent/15 text-accent" :
                agent.status === "constrained" ? "bg-amber/15 text-amber" :
                agent.status === "revoked" ? "bg-red/15 text-red" :
                "bg-surface-3 text-text-muted"
              }`}>{statusLabel(agent.status)}</span>
            </div>

            <span className="text-[8px] text-text-dim block mb-2">{agent.role}</span>

            {/* Budget bar */}
            <div className="mb-2">
              <div className="flex justify-between text-[7px] mb-0.5">
                <span className="text-text-muted font-[family-name:var(--font-mono)]">${agent.spent.toFixed(3)}</span>
                <span className="text-text-muted font-[family-name:var(--font-mono)]">${agent.budget.toFixed(2)}</span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    agent.status === "active" ? "bg-accent" :
                    agent.status === "constrained" ? "bg-amber" :
                    agent.status === "revoked" ? "bg-red" : "bg-text-muted"
                  }`}
                  animate={{ width: `${Math.min((agent.spent / Math.max(agent.budget, 0.01)) * 100, 100)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Trust & tasks */}
            <div className="flex justify-between text-[8px]">
              <div>
                <span className="text-text-muted">Trust: </span>
                <span className={`font-[family-name:var(--font-mono)] font-medium ${
                  agent.trust >= 80 ? "text-accent" : agent.trust >= 50 ? "text-amber" : "text-red"
                }`}>{agent.trust}%</span>
              </div>
              <div>
                <span className="text-text-muted">Tasks: </span>
                <span className="font-[family-name:var(--font-mono)]">{agent.taskCount}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Strategy Preview - shows when we have live stages indicating preflight */}
      <StrategyPreview />
    </div>
  );
}

// ================================================================
// STRATEGY PREVIEW
// ================================================================

function StrategyPreview() {
  const [selected, setSelected] = useState<string | null>(null);

  const strategies = [
    {
      id: "quality",
      name: "Quality-first",
      desc: "Uses best-in-class providers for maximum output quality",
      estimatedCost: "$3.20 - $4.50",
      estimatedQuality: "9.2/10",
      stages: "All stages use premium providers",
      risks: "May exceed budget on complex tasks",
      color: "border-accent/40 bg-accent/5",
      iconColor: "text-accent",
    },
    {
      id: "balanced",
      name: "Balanced",
      desc: "Optimal mix of quality and cost efficiency",
      estimatedCost: "$1.80 - $2.80",
      estimatedQuality: "7.5/10",
      stages: "Premium for critical stages, budget for routine",
      risks: "Moderate quality variance",
      color: "border-blue/40 bg-blue/5",
      iconColor: "text-blue",
    },
    {
      id: "budget",
      name: "Budget-preserving",
      desc: "Minimizes cost using cheapest available providers",
      estimatedCost: "$0.80 - $1.40",
      estimatedQuality: "5.8/10",
      stages: "All stages use cheapest providers",
      risks: "Lower quality outputs, possible retries",
      color: "border-amber/40 bg-amber/5",
      iconColor: "text-amber",
    },
  ];

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[11px] font-semibold">Execution Strategy</h3>
          <p className="text-[8px] text-text-muted">Select a strategy for how agents allocate provider spend</p>
        </div>
        {selected && (
          <span className="text-[8px] px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">
            Selected: {strategies.find(s => s.id === selected)?.name}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {strategies.map((strat, i) => (
          <motion.button key={strat.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            onClick={() => setSelected(strat.id)}
            className={`rounded-xl border-2 p-3 text-left transition-all hover:scale-[1.01] ${
              selected === strat.id ? strat.color : "border-border bg-surface hover:border-border-bright"
            }`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`text-[10px] font-semibold ${selected === strat.id ? strat.iconColor : "text-text"}`}>{strat.name}</span>
              {selected === strat.id && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </div>
            <p className="text-[8px] text-text-dim mb-3">{strat.desc}</p>
            <div className="space-y-1.5 text-[8px] font-[family-name:var(--font-mono)]">
              <div className="flex justify-between">
                <span className="text-text-muted">Est. cost</span>
                <span className={selected === strat.id ? strat.iconColor : "text-text-dim"}>{strat.estimatedCost}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Quality</span>
                <span>{strat.estimatedQuality}</span>
              </div>
              <div className="pt-1 border-t border-border/50">
                <span className="text-text-muted block">{strat.stages}</span>
              </div>
              <div className="text-amber/80">{strat.risks}</div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// AUDIT LOG VIEW
// ================================================================

function AuditLogView({ entries, allEntries, filter, onFilterChange }: {
  entries: GovDecision[];
  allEntries: GovDecision[];
  filter: AuditFilter;
  onFilterChange: (f: AuditFilter) => void;
}) {
  const verdictCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allEntries.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
    return counts;
  }, [allEntries]);

  const downloadAuditTrace = useCallback(() => {
    const trace = {
      sessionId: Math.random().toString(36).slice(2),
      exportedAt: new Date().toISOString(),
      totalDecisions: allEntries.length,
      decisions: allEntries.map(e => ({
        id: e.id,
        verdict: e.type,
        amount: e.amount,
        provider: e.provider,
        riskScore: e.riskScore,
        timestamp: e.timestamp,
        stageName: e.stageName,
      })),
      summary: {
        approved: verdictCounts["APPROVED"] || 0,
        denied: verdictCounts["DENIED"] || 0,
        escalated: verdictCounts["ESCALATE"] || 0,
        downgraded: verdictCounts["DOWNGRADE"] || 0,
        totalSpend: allEntries.reduce((s, e) => s + e.amount, 0),
      },
    };
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `agentpm-audit-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [allEntries, verdictCounts]);

  const filters: { key: AuditFilter; label: string; color: string }[] = [
    { key: "all", label: `All (${allEntries.length})`, color: "text-text" },
    { key: "APPROVED", label: `Approved (${verdictCounts["APPROVED"] || 0})`, color: "text-accent" },
    { key: "DENIED", label: `Denied (${verdictCounts["DENIED"] || 0})`, color: "text-red" },
    { key: "ESCALATE", label: `Escalated (${verdictCounts["ESCALATE"] || 0})`, color: "text-amber" },
    { key: "DOWNGRADE", label: `Downgraded (${verdictCounts["DOWNGRADE"] || 0})`, color: "text-purple" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Governance Audit Log</h2>
          <p className="text-[10px] text-text-dim mt-0.5">Complete record of all governance decisions for this session</p>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={downloadAuditTrace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-[9px] text-text-dim hover:text-text transition-colors font-[family-name:var(--font-mono)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Trace
        </motion.button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {filters.map(f => (
          <button key={f.key} onClick={() => onFilterChange(f.key)}
            className={`px-2.5 py-1 rounded-lg text-[8px] font-medium transition-all ${
              filter === f.key ? `bg-surface-2 ${f.color} border border-border` : "text-text-muted hover:text-text-dim border border-transparent"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: "Total", value: allEntries.length, color: "text-text" },
          { label: "Approved", value: verdictCounts["APPROVED"] || 0, color: "text-accent" },
          { label: "Denied", value: verdictCounts["DENIED"] || 0, color: "text-red" },
          { label: "Escalated", value: verdictCounts["ESCALATE"] || 0, color: "text-amber" },
          { label: "Total Spend", value: `$${allEntries.reduce((s, e) => s + e.amount, 0).toFixed(3)}`, color: "text-text" },
        ].map(stat => (
          <div key={stat.label} className="bg-surface rounded-lg p-3 border border-border text-center">
            <span className="text-[7px] uppercase tracking-widest text-text-dim block">{stat.label}</span>
            <span className={`text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Log entries */}
      {entries.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-[10px] text-text-muted">No governance decisions recorded yet. Start a task to see audit entries.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[80px_1fr_100px_80px_80px_60px] gap-2 px-3 py-1.5 text-[7px] uppercase tracking-widest text-text-dim font-medium">
            <span>Time</span>
            <span>Stage</span>
            <span>Verdict</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Provider</span>
            <span className="text-right">Risk</span>
          </div>
          {entries.map((entry, i) => (
            <motion.div key={entry.id}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="grid grid-cols-[80px_1fr_100px_80px_80px_60px] gap-2 px-3 py-2 rounded-lg bg-surface border border-border hover:border-border-bright transition-colors items-center">
              <span className="text-[8px] font-[family-name:var(--font-mono)] text-text-muted tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-[9px] text-text-dim truncate">{entry.stageName || "---"}</span>
              <span className={`text-[8px] font-medium px-2 py-0.5 rounded w-fit ${
                entry.type === "APPROVED" ? "bg-accent/10 text-accent" :
                entry.type === "DENIED" ? "bg-red/10 text-red" :
                entry.type === "ESCALATE" ? "bg-amber/10 text-amber" :
                entry.type === "DOWNGRADE" ? "bg-purple/10 text-purple" :
                "bg-cyan/10 text-cyan"
              }`}>{entry.type}</span>
              <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-right">${entry.amount.toFixed(4)}</span>
              <span className="text-[8px] font-[family-name:var(--font-mono)] text-text-dim text-right truncate">{entry.provider || "---"}</span>
              <span className={`text-[8px] font-[family-name:var(--font-mono)] tabular-nums text-right ${
                entry.riskScore < 30 ? "text-accent" : entry.riskScore < 70 ? "text-amber" : "text-red"
              }`}>{entry.riskScore}/100</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================
// STAGE CARD (preserved from original)
// ================================================================

function StageCard({ stage, index, live }: { stage: StageResult; index: number; live?: boolean }) {
  const [open, setOpen] = useState(live || false);
  const isDone = stage.status === "done"; const isRunning = stage.status === "running";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: live ? 0 : index * 0.05 }}
      className={`rounded-xl border transition-all ${isDone ? "bg-surface border-border" : isRunning ? "bg-surface border-accent/20" : "bg-surface border-border/50 opacity-50"}`}>
      <button onClick={() => setOpen(!open)} className="w-full p-3 flex items-center justify-between text-left">
        <div className="flex items-center gap-2.5">
          <div className={`h-6 w-6 rounded-lg flex items-center justify-center text-[9px] font-[family-name:var(--font-mono)] font-bold ${isDone ? "bg-accent/15 text-accent" : isRunning ? "bg-surface-3 text-white" : "bg-surface-2 text-text-muted"}`}>{index + 1}</div>
          <div>
            <span className="text-[11px] font-medium block">{stage.stageName}</span>
            {stage.stageDescription && <span className="text-[9px] text-text-dim">{stage.stageDescription}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stage.provider && <span className="text-[8px] font-[family-name:var(--font-mono)] text-text-dim bg-surface-2 px-1.5 py-0.5 rounded">{stage.provider}</span>}
          {stage.cost !== undefined && <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-text-dim">-${stage.cost.toFixed(3)}</span>}
          {isDone && <span className="h-2 w-2 rounded-full bg-accent" />}
          {isRunning && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-2 w-2 rounded-full bg-amber" />}
          <span className="text-[10px] text-text-muted">{open ? "-" : "+"}</span>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              {stage.providers && stage.providers.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-[9px] font-[family-name:var(--font-mono)]">
                    <thead><tr className="bg-surface-2 text-text-muted"><th className="text-left px-2 py-1">Provider</th><th className="text-right px-2 py-1">Price</th><th className="text-right px-2 py-1">Quality</th><th className="text-right px-2 py-1">Score</th></tr></thead>
                    <tbody>{stage.providers.map((p, i) => (
                      <tr key={p.name} className={`border-t border-border/50 ${i === 0 ? "bg-accent/[0.03]" : ""}`}>
                        <td className="px-2 py-1">{i === 0 && <span className="text-accent mr-1">{">"}</span>}{p.name}</td>
                        <td className="text-right px-2 py-1 tabular-nums">${p.price.toFixed(3)}</td>
                        <td className="text-right px-2 py-1 tabular-nums">{p.quality}/10</td>
                        <td className="text-right px-2 py-1 tabular-nums text-accent">{p.score.toFixed(1)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {stage.governanceVerdict && <span className={`px-2 py-0.5 rounded text-[8px] font-medium ${
                  stage.governanceVerdict === "APPROVED" ? "bg-accent/10 text-accent" :
                  stage.governanceVerdict === "DENIED" ? "bg-red/10 text-red" :
                  stage.governanceVerdict === "ESCALATE" ? "bg-amber/10 text-amber" :
                  stage.governanceVerdict === "DOWNGRADE" ? "bg-purple/10 text-purple" :
                  "bg-cyan/10 text-cyan"
                }`}>{stage.governanceVerdict}</span>}
                {stage.paymentTxHash && <span className="px-2 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-surface-2 text-text-muted">{stage.paymentTxHash.slice(0, 18)}...</span>}
                <TruthBadge label={(stage as unknown as Record<string, unknown>).truthLabel as string} />
                {stage.latencyMs && <span className="px-2 py-0.5 rounded text-[8px] font-[family-name:var(--font-mono)] bg-surface-2 text-text-muted">{stage.latencyMs}ms</span>}
              </div>
              {stage.output && <div className="bg-surface-2 rounded-lg p-3 text-[11px] text-text-secondary leading-relaxed">{stage.output}</div>}
              {isRunning && !stage.output && <div className="flex items-center gap-1.5 py-2">{[0,1,2].map(i => <motion.span key={i} animate={{ opacity: [0.15, 0.6, 0.15] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-text-muted" />)}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ================================================================
// SUMMARY CARD (preserved from original)
// ================================================================

function SummaryCard({ data }: { data: Record<string, unknown> }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-accent/20 bg-surface p-4">
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { l: "Cost", v: `$${((data.totalCost as number) || 0).toFixed(4)}` },
          { l: "Stages", v: `${data.totalSteps || 0}${(data.deferredStages as string[])?.length ? ` (${(data.deferredStages as string[]).length} deferred)` : ""}` },
          { l: "Remaining", v: `$${((data.walletBalance as number) || 0).toFixed(4)}` },
          { l: "Payments", v: String(((data.transactions as unknown[]) || []).length) },
        ].map(s => (
          <div key={s.l}>
            <span className="text-[7px] font-medium uppercase tracking-widest text-text-dim block">{s.l}</span>
            <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums">{s.v}</span>
          </div>
        ))}
      </div>
      {Boolean(data.partialCompletion) ? (
        <div className="mt-3 p-2 rounded-lg bg-amber/10 border border-amber/20 text-[9px] text-amber">
          Partial completion: {(data.deferredStages as string[])?.join(", ")} deferred due to budget constraints.
        </div>
      ) : null}
      {data.auditTrace ? (
        <button onClick={() => {
          const blob = new Blob([JSON.stringify(data.auditTrace, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `agentpm-audit-${Date.now()}.json`; a.click();
          URL.revokeObjectURL(url);
        }} className="mt-2 w-full py-1.5 rounded-lg bg-surface-2 border border-border text-[9px] text-text-dim hover:text-text transition-colors font-[family-name:var(--font-mono)]">
          Download Audit Trace (JSON)
        </button>
      ) : null}
    </motion.div>
  );
}

// ================================================================
// APPROVAL CARD (preserved from original)
// ================================================================

function ApprovalCard({ approval, onRespond }: {
  approval: { approvalId: string; stageName: string; provider: string; amount: number; reason: string; budgetImpact: { currentSpend: number; projectedSpend: number; sessionBudget: number; percentUsed: number; remaining: number }; riskScore: number };
  onRespond: (approvalId: string, approved: boolean) => void;
}) {
  const [responding, setResponding] = useState(false);
  const bi = approval.budgetImpact;
  const riskColor = approval.riskScore < 30 ? "text-accent" : approval.riskScore < 70 ? "text-amber" : "text-red";
  const riskBg = approval.riskScore < 30 ? "bg-accent/10" : approval.riskScore < 70 ? "bg-amber/10" : "bg-red/10";

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      className="rounded-xl border border-amber/40 bg-amber/5 p-4 my-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] font-bold uppercase tracking-widest text-amber">Approval Required</span>
        <span className={`text-[8px] font-[family-name:var(--font-mono)] px-2 py-0.5 rounded ${riskBg} ${riskColor}`}>risk {approval.riskScore}/100</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div><span className="text-[8px] text-text-dim block">Stage</span><span className="text-xs font-medium">{approval.stageName}</span></div>
        <div><span className="text-[8px] text-text-dim block">Provider</span><span className="text-xs font-[family-name:var(--font-mono)]">{approval.provider}</span></div>
        <div><span className="text-[8px] text-text-dim block">Amount</span><span className="text-xs font-[family-name:var(--font-mono)] font-semibold tabular-nums">${approval.amount.toFixed(4)}</span></div>
      </div>

      <div className="text-[10px] text-text-dim mb-3">{approval.reason}</div>

      <div className="mb-3">
        <div className="flex justify-between text-[8px] text-text-muted mb-1">
          <span>Budget impact</span>
          <span className="tabular-nums font-[family-name:var(--font-mono)]">${bi.projectedSpend.toFixed(3)} / ${bi.sessionBudget.toFixed(2)}</span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden flex">
          <div className="h-full bg-accent rounded-l-full" style={{ width: `${(bi.currentSpend / bi.sessionBudget) * 100}%` }} />
          <motion.div initial={{ width: 0 }} animate={{ width: `${(approval.amount / bi.sessionBudget) * 100}%` }} className="h-full bg-amber" />
        </div>
        <div className="flex justify-between text-[7px] text-text-muted mt-0.5 font-[family-name:var(--font-mono)]">
          <span>${bi.currentSpend.toFixed(3)} spent</span>
          <span>${bi.remaining.toFixed(3)} remaining after</span>
        </div>
      </div>

      <div className="flex gap-2">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => { setResponding(true); onRespond(approval.approvalId, true); }}
          disabled={responding}
          className="flex-1 h-9 rounded-lg bg-accent text-[#09090b] text-xs font-semibold disabled:opacity-50 transition-colors">
          {responding ? "Approving..." : "Approve Payment"}
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => { setResponding(true); onRespond(approval.approvalId, false); }}
          disabled={responding}
          className="flex-1 h-9 rounded-lg bg-red/10 text-red text-xs font-semibold border border-red/20 disabled:opacity-50 transition-colors">
          {responding ? "Denying..." : "Deny"}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ================================================================
// TRUTH BADGE (preserved from original)
// ================================================================

function TruthBadge({ label }: { label?: string }) {
  if (!label) return null;
  const styles: Record<string, string> = {
    REAL: "bg-accent/15 text-accent",
    TESTNET: "bg-blue/15 text-blue",
    SIM: "bg-text-muted/15 text-text-muted",
  };
  return <span className={`text-[7px] font-[family-name:var(--font-mono)] font-bold px-1.5 py-0.5 rounded ${styles[label] || styles.SIM}`}>{label}</span>;
}

// ================================================================
// SPEND RING (preserved from original)
// ================================================================

function SpendRing({ spent, limit, size = 44 }: { spent: number; limit: number; size?: number }) {
  const pct = Math.min(100, (spent / Math.max(limit, 0.01)) * 100);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct < 50 ? "#22c55e" : pct < 80 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth="3" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="text-[8px] font-[family-name:var(--font-mono)] font-bold" fill="#a1a1aa">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ================================================================
// TAB ICONS
// ================================================================

function ChatIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
