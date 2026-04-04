"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

interface ChatMessage { id: string; role: "user" | "assistant"; content: string; stages?: StageResult[]; summary?: Record<string, unknown>; timestamp: string; isStreaming?: boolean }
interface StageResult { stageId: string; stageName: string; stageDescription?: string; stageIndex: number; stageTotal: number; provider?: string; cost?: number; output?: string; txHash?: string; latencyMs?: number; status: "pending" | "running" | "done"; providers?: { name: string; price: number; quality: number; latency: number; score: number }[]; governancePassed?: boolean; governanceVerdict?: string; paymentTxHash?: string; paymentAmount?: number; newBalance?: number }
interface WalletInfo { balance: number; address: string; totalSpent: number; txCount: number }
interface TxInfo { toolName: string; amount: number; txHash: string; status: string }

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
    className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1 rounded hover:bg-surface-2 transition-all text-text-muted hover:text-text">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    {ok && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-accent">copied</span>}
  </button>;
}

export default function AppPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [liveStages, setLiveStages] = useState<StageResult[]>([]);
  const [budget, setBudget] = useState(5);
  const [priority, setPriority] = useState("balanced");
  const [sidebarTab, setSidebarTab] = useState<"wallet" | "txns" | "governance">("wallet");
  const [allTxns, setAllTxns] = useState<TxInfo[]>([]);
  const [deployedSites, setDeployedSites] = useState<{ subdomain: string; url: string; projectName: string }[]>([]);
  const [strictModeOn, setStrictModeOn] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ approvalId: string; stageName: string; provider: string; amount: number; reason: string; budgetImpact: { currentSpend: number; projectedSpend: number; sessionBudget: number; percentUsed: number; remaining: number }; riskScore: number } | null>(null);
  const [govTimeline, setGovTimeline] = useState<{ id: string; type: string; amount: number; provider: string; riskScore: number }[]>([]);
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

  const resetAll = useCallback(async () => {
    await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", balance: 50.0 }) });
    refreshWallet(); setMessages([]); setLiveStages([]); setAllTxns([]);
  }, [refreshWallet]);

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
                if (sd.budgetImpact) setGovTimeline(prev => [...prev, { id: Math.random().toString(36).slice(2), type: verdict, amount: (sd.budgetImpact as Record<string, number>).projectedSpend - (sd.budgetImpact as Record<string, number>).currentSpend, provider: "", riskScore: sd.riskScore as number || 0 }]);
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

  const budgetPct = wallet ? Math.min((wallet.totalSpent / (wallet.totalSpent + wallet.balance)) * 100, 100) : 0;

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* HEADER */}
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
        </div>
        <div className="flex items-center gap-4 text-[9px] font-[family-name:var(--font-mono)]">
          {isLoading && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-accent flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" />running</motion.span>}
          <span className="text-text-muted">x402 / base-sepolia</span>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
      </motion.header>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex border-b border-border">
            {(["wallet", "txns", "governance"] as const).map(t => (
              <button key={t} onClick={() => setSidebarTab(t)}
                className={`flex-1 py-2 text-[9px] font-medium uppercase tracking-wider transition-colors ${sidebarTab === t ? "text-text border-b border-text" : "text-text-muted hover:text-text-dim"}`}>
                {t === "wallet" ? "Wallet" : t === "txns" ? `Activity` : "Config"}
              </button>
            ))}
          </div>

          {sidebarTab === "wallet" && (
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

              {wallet && (
                <>
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Session Budget</span>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-lg font-semibold font-[family-name:var(--font-mono)] tabular-nums">${wallet.balance.toFixed(2)}</span>
                      <span className="text-[8px] text-text-muted">${wallet.totalSpent.toFixed(3)} used</span>
                    </div>
                    <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                      <motion.div className="h-full bg-accent rounded-full" animate={{ width: `${budgetPct}%` }} transition={{ duration: 0.4 }} />
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

                  <div className="flex gap-1.5">
                    <Link href="/hosting" className="flex-1 text-center py-1.5 rounded-lg text-[8px] text-text-muted hover:text-text bg-surface border border-border transition-colors">Hosting</Link>
                    <button onClick={resetAll} className="flex-1 py-1.5 rounded-lg text-[8px] text-text-muted hover:text-text bg-surface border border-border transition-colors">Reset</button>
                  </div>
                </>
              )}
            </div>
          )}

          {sidebarTab === "txns" && (
            <div className="flex-1 overflow-y-auto p-3">
              <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim">{allTxns.length} transactions</span>
              {allTxns.length === 0 ? <p className="text-[9px] text-text-muted mt-3">No activity</p> : (
                <div className="mt-2 space-y-1.5">
                  {allTxns.map((tx, i) => (
                    <motion.div key={tx.txHash + i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      className="bg-surface rounded-lg p-2 border border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-medium truncate mr-1">{tx.toolName}</span>
                        <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-red shrink-0">-${tx.amount.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`h-1 w-1 rounded-full ${tx.status === "confirmed" ? "bg-accent" : "bg-amber animate-pulse-dot"}`} />
                        <span className="font-[family-name:var(--font-mono)] text-[7px] text-text-muted truncate">{tx.txHash.slice(0, 24)}...</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {sidebarTab === "governance" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Strict Mode Toggle */}
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

              {/* Spend Ring */}
              <div className="bg-surface rounded-lg p-3 border border-border flex items-center gap-3">
                <SpendRing spent={wallet?.totalSpent || 0} limit={budget} />
                <div>
                  <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block">Budget Used</span>
                  <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums">${(wallet?.totalSpent || 0).toFixed(3)}</span>
                  <span className="text-[8px] text-text-muted"> / ${budget}</span>
                </div>
              </div>

              {/* Policy Limits */}
              <div className="bg-surface rounded-lg p-3 border border-border">
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Active Policies</span>
                <div className="space-y-1 text-[9px] font-[family-name:var(--font-mono)]">
                  <div className="flex justify-between"><span className="text-text-muted">per tx max</span><span>$2.00</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">daily max</span><span>$20.00</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">escalation at</span><span className="text-amber">$0.50</span></div>
                  <div className="flex justify-between"><span className="text-text-muted">network</span><span>base-sepolia</span></div>
                </div>
              </div>

              {/* Decision Timeline */}
              <div className="bg-surface rounded-lg p-3 border border-border">
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Decision Timeline</span>
                {govTimeline.length === 0 ? <p className="text-[8px] text-text-muted">No decisions yet</p> : (
                  <div className="space-y-1">
                    {govTimeline.slice(0, 10).map(e => (
                      <div key={e.id} className="flex items-center gap-1.5 text-[8px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          e.type === "APPROVED" ? "bg-accent" : e.type === "DENIED" ? "bg-red" : e.type === "ESCALATE" ? "bg-amber" : e.type === "DOWNGRADE" ? "bg-purple" : "bg-cyan"
                        }`} />
                        <span className="text-text-muted font-[family-name:var(--font-mono)]">{e.type}</span>
                        <span className="text-text-muted ml-auto tabular-nums font-[family-name:var(--font-mono)]">${e.amount.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                )}
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
          )}
        </aside>

        {/* CHAT */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
                    <h2 className="text-lg font-semibold tracking-tight mb-1">What are you building?</h2>
                    <p className="text-[12px] text-text-dim max-w-md mx-auto leading-relaxed">I plan projects, find the best tools, check spending policies, pay via x402, and deploy live sites. Real wallet, real payments, real deployments.</p>
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
                    const aId = (Date.now() + 1).toString();
                    setMessages(prev => [...prev, { id: aId, role: "assistant", content: "", timestamp: new Date().toISOString(), isStreaming: true }]);
                    while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; const raw = line.slice(6).trim(); if (raw === "[DONE]") continue; try { const ev = JSON.parse(raw); if (ev.type === "text_delta") { ac += ev.data.text; setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: ac } : m)); } } catch {} } }
                    setMessages(prev => prev.map(m => m.id === aId ? { ...m, isStreaming: false } : m));
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
                <span>{messages.filter(m => m.role === "user").length} messages / ${budget} budget / {priority}</span>
                <span>enter to send</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function SummaryCard({ data }: { data: Record<string, unknown> }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-accent/20 bg-surface p-4">
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { l: "Cost", v: `$${((data.totalCost as number) || 0).toFixed(4)}` },
          { l: "Stages", v: String((data.totalSteps as number) || 0) },
          { l: "Remaining", v: `$${((data.walletBalance as number) || 0).toFixed(4)}` },
          { l: "Payments", v: String(((data.transactions as unknown[]) || []).length) },
        ].map(s => (
          <div key={s.l}>
            <span className="text-[7px] font-medium uppercase tracking-widest text-text-dim block">{s.l}</span>
            <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums">{s.v}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ================================================================
// APPROVAL CARD - Interactive governance decision
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

      {/* Budget impact bar */}
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

      {/* Actions */}
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
// SPEND RING - SVG circular progress
// ================================================================

// TRUTH BADGE - shows what's real vs simulated
function TruthBadge({ label }: { label?: string }) {
  if (!label) return null;
  const styles: Record<string, string> = {
    REAL: "bg-accent/15 text-accent",
    TESTNET: "bg-blue/15 text-blue",
    SIM: "bg-text-muted/15 text-text-muted",
  };
  return <span className={`text-[7px] font-[family-name:var(--font-mono)] font-bold px-1.5 py-0.5 rounded ${styles[label] || styles.SIM}`}>{label}</span>;
}

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
