"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

// Types
interface Msg { id: string; role: "user" | "assistant"; content: string; stages?: Stage[]; summary?: Record<string, unknown>; ts: string; streaming?: boolean }
interface Stage { stageId: string; stageName: string; stageDescription?: string; stageIndex: number; stageTotal: number; provider?: string; cost?: number; output?: string; txHash?: string; latencyMs?: number; status: "pending" | "running" | "done"; providers?: { name: string; price: number; quality: number; latency: number; score: number }[]; verdict?: string; paymentTxHash?: string; truthLabel?: string; newBalance?: number }
interface Wallet { balance: number; address: string; totalSpent: number; txCount: number }
interface Tx { toolName: string; amount: number; txHash: string; status: string }
interface GovEvent { id: string; type: string; amount: number; provider: string; riskScore: number; ts: string; stage?: string }
interface Approval { approvalId: string; stageName: string; provider: string; amount: number; reason: string; budgetImpact: { currentSpend: number; projectedSpend: number; sessionBudget: number; percentUsed: number; remaining: number }; riskScore: number }

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [sid] = useState(() => crypto.randomUUID().slice(0, 8));
  const [liveStages, setLiveStages] = useState<Stage[]>([]);
  const [budget, setBudget] = useState(5);
  const [priority, setPriority] = useState("balanced");
  const [txns, setTxns] = useState<Tx[]>([]);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [timeline, setTimeline] = useState<GovEvent[]>([]);
  const [strict, setStrict] = useState(false);
  const [tab, setTab] = useState<"chat" | "audit">("chat");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { address, isConnected } = useAccount();
  const { data: usdcRaw } = useReadContract({ address: USDC, abi: ABI, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 15000 } });
  const usdc = usdcRaw ? parseFloat(formatUnits(usdcRaw, 6)) : 0;

  const refresh = useCallback(() => {
    fetch("/api/wallet").then(r => r.json()).then(d => {
      if (d.wallet) setWallet({ balance: d.wallet.balance, address: d.wallet.address, totalSpent: d.totalSpent || 0, txCount: d.transactions?.length || 0 });
      if (d.transactions) setTxns(d.transactions);
    }).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, liveStages]);

  const reset = useCallback(async () => {
    await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", balance: 50.0 }) });
    refresh(); setMsgs([]); setLiveStages([]); setTxns([]); setTimeline([]);
  }, [refresh]);

  const send = useCallback(async () => {
    const text = input.trim(); if (!text || loading) return;
    setMsgs(p => [...p, { id: Date.now().toString(), role: "user", content: text, ts: new Date().toISOString() }]);
    setInput(""); setLoading(true); setLiveStages([]);
    const aId = (Date.now() + 1).toString();
    let ac = ""; let stages: Stage[] = []; let summary: Record<string, unknown> | undefined;
    setMsgs(p => [...p, { id: aId, role: "assistant", content: "", ts: new Date().toISOString(), streaming: true }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, sessionId: sid, budget, priority }) });
      const reader = res.body?.getReader(); if (!reader) return;
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue; const raw = line.slice(6).trim(); if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw) as { type: string; data: Record<string, unknown> };
            if (ev.type === "text_delta") { ac += ev.data.text as string; setMsgs(p => p.map(m => m.id === aId ? { ...m, content: ac } : m)); }
            if (ev.type === "stage_event") {
              const se = ev.data as Record<string, unknown>; const sd = se.data as Record<string, unknown>;
              if (se.type === "discovery") { stages = [...stages, { stageId: sd.stageId as string, stageName: sd.stageName as string, stageDescription: sd.stageDescription as string, stageIndex: sd.stageIndex as number, stageTotal: sd.stageTotal as number, status: "running" }]; setLiveStages([...stages]); }
              if (se.type === "evaluation") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, providers: sd.providers as Stage["providers"] } : s); setLiveStages([...stages]); }
              if (se.type === "governance") { const v = sd.verdict as string || "APPROVED"; stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, verdict: v } : s); setLiveStages([...stages]); setTimeline(p => [...p, { id: crypto.randomUUID().slice(0, 8), type: v, amount: (sd.budgetImpact as Record<string, number>)?.projectedSpend - (sd.budgetImpact as Record<string, number>)?.currentSpend || 0, provider: "", riskScore: sd.riskScore as number || 0, ts: new Date().toISOString(), stage: sd.stageId as string }]); }
              if (se.type === "approval_required") { setApproval(sd as unknown as Approval); }
              if (se.type === "payment" && sd.phase === "settled") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, paymentTxHash: sd.txHash as string, newBalance: sd.newBalance as number } : s); setLiveStages([...stages]); setWallet(w => w ? { ...w, balance: sd.newBalance as number } : w); }
              if (se.type === "decision") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, provider: sd.provider as string, cost: sd.price as number } : s); setLiveStages([...stages]); }
              if (se.type === "result") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, status: "done" as const, output: sd.output as string, txHash: sd.txHash as string, latencyMs: sd.latencyMs as number, provider: sd.provider as string, cost: sd.cost as number, truthLabel: sd.truthLabel as string } : s); setLiveStages([...stages]); }
            }
            if (ev.type === "execution_complete") { summary = ev.data; refresh(); }
          } catch { /* skip */ }
        }
      }
    } catch (err) { ac = `Error: ${err instanceof Error ? err.message : "Failed"}`; }
    setMsgs(p => p.map(m => m.id === aId ? { ...m, content: ac.replace(/\[EXECUTE:[^\]]*\]/, "").trim(), stages: stages.length > 0 ? stages : undefined, summary, streaming: false } : m));
    setLiveStages([]); setLoading(false); refresh(); inputRef.current?.focus();
  }, [input, loading, sid, budget, priority, refresh]);

  const handleApproval = useCallback(async (id: string, approved: boolean) => {
    setApproval(null); setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "", sessionId: sid, approvalResponse: { approvalId: id, approved } }) });
      const reader = res.body?.getReader(); if (!reader) return;
      const dec = new TextDecoder(); let buf = ""; let ac = "";
      const aId = (Date.now() + 1).toString();
      setMsgs(p => [...p, { id: aId, role: "assistant", content: "", ts: new Date().toISOString(), streaming: true }]);
      while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; const raw = line.slice(6).trim(); if (raw === "[DONE]") continue; try { const ev = JSON.parse(raw); if (ev.type === "text_delta") { ac += ev.data.text; setMsgs(p => p.map(m => m.id === aId ? { ...m, content: ac } : m)); } } catch {} } }
      setMsgs(p => p.map(m => m.id === aId ? { ...m, streaming: false } : m));
    } finally { setLoading(false); refresh(); }
  }, [sid, refresh]);

  const pct = wallet ? Math.min(100, (wallet.totalSpent / Math.max(budget, 0.01)) * 100) : 0;

  return (
    <div className="h-screen flex flex-col bg-black text-[#ededed]">
      {/* TOP BAR */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-[#1f1f1f] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <span className="text-[11px] font-semibold tracking-tight">AgentPM</span>
          </Link>
          <span className="text-[9px] text-[#444] font-[family-name:var(--font-mono)]">{sid}</span>
          <div className="flex gap-1 ml-2">
            {(["chat", "audit"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`text-[9px] px-2.5 py-1 rounded transition-colors font-medium capitalize ${tab === t ? "bg-[#1f1f1f] text-[#ededed]" : "text-[#666] hover:text-[#999]"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {loading && <span className="text-[9px] text-[#666] font-[family-name:var(--font-mono)] animate-pulse-subtle">running</span>}
          <span className="text-[9px] text-[#444] font-[family-name:var(--font-mono)]">x402 / base-sepolia</span>
          <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-[#f59e0b] animate-pulse-subtle" : "bg-[#22c55e]"}`} />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: GOVERNANCE PANEL */}
        <aside className="w-56 shrink-0 border-r border-[#1f1f1f] flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Wallet */}
            <div>
              <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Wallet</label>
              <div className="[&_button]:!rounded [&_button]:!text-[9px] [&_button]:!h-7 [&_button]:!border-[#1f1f1f]">
                <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
              </div>
              {isConnected && (
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-[9px]"><span className="text-[#666]">On-chain</span><span className="font-[family-name:var(--font-mono)] tabular-nums">${usdc.toFixed(2)} <span className="text-[8px] px-1 py-px bg-[#1f1f1f] rounded text-[#666]">TESTNET</span></span></div>
                  <a href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer" className="text-[8px] text-[#666] hover:text-[#999] font-[family-name:var(--font-mono)] transition-colors">BaseScan</a>
                </div>
              )}
            </div>

            {/* Budget */}
            {wallet && (
              <div>
                <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Session Budget</label>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-lg font-semibold font-[family-name:var(--font-mono)] tabular-nums">${wallet.balance.toFixed(2)}</span>
                  <span className="text-[8px] text-[#444] font-[family-name:var(--font-mono)]">${wallet.totalSpent.toFixed(3)} spent</span>
                </div>
                <div className="h-1 bg-[#1f1f1f] rounded-full overflow-hidden">
                  <motion.div className="h-full bg-[#ededed] rounded-full" animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
                </div>
                <div className="flex justify-between mt-2 items-center">
                  <span className="text-[8px] text-[#444]">Limit</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min="1" max="20" step="0.5" value={budget} onChange={e => setBudget(parseFloat(e.target.value))}
                      className="w-16 h-px bg-[#1f1f1f] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" />
                    <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums w-6 text-right">${budget}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Mode */}
            <div>
              <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Payment Mode</label>
              <div className="space-y-1">
                {[{ l: "Simulation", d: "In-memory accounting", badge: "SIM" }, { l: "Testnet", d: "Real signing, sim settlement", badge: "TESTNET" }].map(m => (
                  <div key={m.l} className="flex items-center justify-between py-1.5 px-2 rounded bg-[#0a0a0a] border border-[#1f1f1f]">
                    <span className="text-[9px]">{m.l}</span>
                    <span className="text-[7px] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#666]">{m.badge}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Priority</label>
              <div className="grid grid-cols-4 gap-1">
                {(["cost","quality","speed","balanced"] as const).map(p => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={`text-[7px] py-1.5 rounded border transition-all capitalize font-[family-name:var(--font-mono)] ${
                      priority === p ? "border-[#2e2e2e] bg-[#1f1f1f] text-[#ededed]" : "border-transparent text-[#444] hover:text-[#666]"
                    }`}>{p}</button>
                ))}
              </div>
            </div>

            {/* Governance */}
            <div>
              <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Governance</label>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-[#999]">Strict mode</span>
                  <button onClick={async () => {
                    const next = !strict; setStrict(next);
                    await fetch("/api/governance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: next ? "strict-on" : "strict-off" }) });
                  }} className={`w-7 h-3.5 rounded-full transition-colors flex items-center ${strict ? "bg-[#ededed]" : "bg-[#1f1f1f]"}`}>
                    <motion.div animate={{ x: strict ? 14 : 2 }} className={`w-2.5 h-2.5 rounded-full ${strict ? "bg-black" : "bg-[#444]"}`} />
                  </button>
                </div>
                <div className="text-[8px] text-[#444] font-[family-name:var(--font-mono)] space-y-0.5">
                  <div className="flex justify-between"><span>per tx</span><span>$2.00</span></div>
                  <div className="flex justify-between"><span>daily</span><span>$20.00</span></div>
                  <div className="flex justify-between"><span>escalate</span><span>{strict ? "all" : "$0.08"}</span></div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <Link href="/hosting" className="flex-1 text-center py-1.5 rounded text-[8px] text-[#444] hover:text-[#999] border border-[#1f1f1f] transition-colors">Hosting</Link>
              <button onClick={reset} className="flex-1 py-1.5 rounded text-[8px] text-[#444] hover:text-[#999] border border-[#1f1f1f] transition-colors">Reset</button>
            </div>
          </div>
        </aside>

        {/* CENTER */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {tab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-6 py-8">
                  {/* Empty state */}
                  {msgs.length === 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-24 text-center space-y-6">
                      <h2 className="text-xl font-medium tracking-tight">What should the agent build?</h2>
                      <p className="text-[13px] text-[#666] max-w-sm mx-auto leading-relaxed">Every action is policy-checked, budget-enforced, and auditable. Governance decisions are transparent.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {["Deploy a landing page under $1", "Security audit with strict governance", "Research competitors, budget $0.50"].map(s => (
                          <button key={s} onClick={() => setInput(s)} className="text-[10px] px-3 py-1.5 rounded border border-[#1f1f1f] text-[#666] hover:text-[#999] hover:border-[#2e2e2e] transition-all">{s}</button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Messages */}
                  <AnimatePresence>
                    {msgs.map(m => (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                        {m.role === "user" ? (
                          <div className="flex gap-3">
                            <div className="h-5 w-5 rounded bg-[#1f1f1f] flex items-center justify-center shrink-0 mt-0.5"><span className="text-[7px] font-[family-name:var(--font-mono)] text-[#666]">U</span></div>
                            <p className="text-[13px] leading-relaxed pt-0.5">{m.content}</p>
                          </div>
                        ) : (
                          <div className="flex gap-3 group relative">
                            <div className="h-5 w-5 rounded bg-[#1f1f1f] flex items-center justify-center shrink-0 mt-0.5"><span className="text-[7px] font-[family-name:var(--font-mono)] text-[#666]">PM</span></div>
                            <div className="flex-1 min-w-0 space-y-3">
                              {m.content && (
                                <div className="text-[13px] text-[#999] leading-[1.75] [&_strong]:text-[#ededed] [&_strong]:font-medium [&_table]:w-full [&_table]:text-[10px] [&_table]:font-[family-name:var(--font-mono)] [&_table]:my-3 [&_th]:text-left [&_th]:px-2 [&_th]:py-1.5 [&_th]:border-b [&_th]:border-[#1f1f1f] [&_th]:text-[#666] [&_th]:font-medium [&_td]:px-2 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-[#141414] [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:text-[#999] [&_code]:bg-[#141414] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px] [&_code]:font-[family-name:var(--font-mono)] [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-[#ededed] [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-[#ededed] [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                                  {m.streaming && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-[#666]">|</motion.span>}
                                </div>
                              )}
                              {m.stages && m.stages.length > 0 && <div className="space-y-1.5">{m.stages.map((s, i) => <StageRow key={s.stageId} stage={s} index={i} />)}</div>}
                              {m.summary && <Summary data={m.summary} />}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Live stages */}
                  {liveStages.length > 0 && (
                    <div className="flex gap-3 mb-6">
                      <div className="h-5 w-5 rounded bg-[#1f1f1f] flex items-center justify-center shrink-0 mt-0.5"><span className="text-[7px] font-[family-name:var(--font-mono)] text-[#666]">PM</span></div>
                      <div className="flex-1 space-y-1.5">{liveStages.map((s, i) => <StageRow key={s.stageId} stage={s} index={i} live />)}</div>
                    </div>
                  )}

                  {/* Approval card */}
                  {approval && <ApprovalCard data={approval} onRespond={handleApproval} />}

                  {/* Loading */}
                  {loading && liveStages.length === 0 && !approval && msgs[msgs.length - 1]?.role === "user" && (
                    <div className="flex gap-3 mb-6">
                      <div className="h-5 w-5 rounded bg-[#1f1f1f] flex items-center justify-center shrink-0"><span className="text-[7px] font-[family-name:var(--font-mono)] text-[#666]">PM</span></div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {[0,1,2].map(i => <motion.span key={i} animate={{ opacity: [0.15, 0.5, 0.15] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} className="w-1 h-1 rounded-full bg-[#444]" />)}
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-[#1f1f1f] p-4">
                <div className="max-w-2xl mx-auto flex gap-2 items-end">
                  <textarea ref={inputRef} value={input}
                    onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Describe a task..." disabled={loading} rows={1}
                    className="flex-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:border-[#2e2e2e] placeholder:text-[#333] transition-colors min-h-[40px] max-h-[100px]" />
                  <button onClick={send} disabled={loading || !input.trim()}
                    className="h-[40px] px-4 rounded-lg bg-[#ededed] text-black text-[11px] font-medium disabled:opacity-10 transition-opacity shrink-0 hover:bg-white">
                    Send
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "audit" && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-sm font-medium mb-4">Governance Decisions</h2>
                {timeline.length === 0 ? <p className="text-[11px] text-[#444]">No decisions recorded yet.</p> : (
                  <div className="space-y-1">
                    {timeline.map(e => (
                      <div key={e.id} className="flex items-center gap-3 py-2 px-3 rounded border border-[#1f1f1f] bg-[#0a0a0a] text-[10px] font-[family-name:var(--font-mono)]">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                          e.type === "APPROVED" ? "bg-[#141414] text-[#ededed]" :
                          e.type === "DENIED" ? "bg-[#1f1f1f] text-[#ef4444]" :
                          e.type === "ESCALATE" ? "bg-[#1f1f1f] text-[#f59e0b]" :
                          "bg-[#1f1f1f] text-[#666]"
                        }`}>{e.type}</span>
                        <span className="text-[#666] tabular-nums">${e.amount.toFixed(4)}</span>
                        <span className="text-[#444]">risk {e.riskScore}</span>
                        <span className="text-[#333] ml-auto">{new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}</span>
                      </div>
                    ))}
                  </div>
                )}
                {txns.length > 0 && (
                  <div className="mt-8">
                    <h2 className="text-sm font-medium mb-4">Transaction Log</h2>
                    <div className="space-y-1">
                      {txns.map((tx, i) => (
                        <div key={tx.txHash + i} className="flex items-center gap-3 py-2 px-3 rounded border border-[#1f1f1f] bg-[#0a0a0a] text-[10px] font-[family-name:var(--font-mono)]">
                          <span className="text-[#999]">{tx.toolName}</span>
                          <span className="text-[#666] tabular-nums ml-auto">-${tx.amount.toFixed(4)}</span>
                          <span className={`h-1.5 w-1.5 rounded-full ${tx.status === "confirmed" ? "bg-[#ededed]" : "bg-[#444]"}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT: LIVE PANEL */}
        <aside className="w-56 shrink-0 border-l border-[#1f1f1f] overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Spend visualization */}
            <div>
              <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Spend</label>
              <div className="flex items-center gap-3">
                <Ring pct={pct} />
                <div>
                  <span className="text-sm font-semibold font-[family-name:var(--font-mono)] tabular-nums block">{pct.toFixed(0)}%</span>
                  <span className="text-[8px] text-[#444]">of ${budget} limit</span>
                </div>
              </div>
            </div>

            {/* Decision Timeline */}
            <div>
              <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Decisions ({timeline.length})</label>
              {timeline.length === 0 ? <p className="text-[8px] text-[#333]">No activity</p> : (
                <div className="space-y-1">
                  {timeline.slice(-8).map(e => (
                    <div key={e.id} className="flex items-center gap-1.5 text-[8px] font-[family-name:var(--font-mono)]">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        e.type === "APPROVED" ? "bg-[#ededed]" : e.type === "DENIED" ? "bg-[#ef4444]" : e.type === "ESCALATE" ? "bg-[#f59e0b]" : "bg-[#666]"
                      }`} />
                      <span className="text-[#666]">{e.type}</span>
                      <span className="text-[#333] tabular-nums ml-auto">${e.amount.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Approval */}
            {approval && (
              <div className="p-2.5 rounded border border-[#f59e0b]/30 bg-[#f59e0b]/5">
                <span className="text-[8px] font-medium text-[#f59e0b] block mb-1">Pending Approval</span>
                <span className="text-[10px] font-[family-name:var(--font-mono)]">{approval.stageName}</span>
                <span className="text-[9px] text-[#666] block">${approval.amount.toFixed(4)}</span>
              </div>
            )}

            {/* Stats */}
            {wallet && wallet.txCount > 0 && (
              <div>
                <label className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#666] block mb-2">Session Stats</label>
                <div className="space-y-1 text-[8px] font-[family-name:var(--font-mono)]">
                  <div className="flex justify-between"><span className="text-[#444]">Payments</span><span>{wallet.txCount}</span></div>
                  <div className="flex justify-between"><span className="text-[#444]">Total spent</span><span>${wallet.totalSpent.toFixed(4)}</span></div>
                  <div className="flex justify-between"><span className="text-[#444]">Remaining</span><span>${wallet.balance.toFixed(2)}</span></div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ================================================================
// STAGE ROW
// ================================================================

function StageRow({ stage, index, live }: { stage: Stage; index: number; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const done = stage.status === "done";
  const running = stage.status === "running";

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: live ? 0 : index * 0.04 }}
      className={`rounded border transition-colors ${done ? "border-[#1f1f1f] bg-[#0a0a0a]" : running ? "border-[#2e2e2e] bg-[#0a0a0a]" : "border-[#141414] opacity-40"}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2.5 flex items-center justify-between text-left">
        <div className="flex items-center gap-2.5">
          <span className={`text-[9px] font-[family-name:var(--font-mono)] font-medium w-4 ${done ? "text-[#ededed]" : "text-[#444]"}`}>{index + 1}</span>
          <div>
            <span className="text-[11px] font-medium block">{stage.stageName}</span>
            {stage.provider && <span className="text-[9px] text-[#444] font-[family-name:var(--font-mono)]">{stage.provider}{stage.cost !== undefined ? ` / $${stage.cost.toFixed(3)}` : ""}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stage.verdict && <VerdictBadge v={stage.verdict} />}
          {stage.truthLabel && <span className="text-[7px] font-[family-name:var(--font-mono)] px-1 py-0.5 rounded bg-[#1f1f1f] text-[#444]">{stage.truthLabel}</span>}
          {done && <span className="h-1.5 w-1.5 rounded-full bg-[#ededed]" />}
          {running && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              {stage.providers && (
                <table className="w-full text-[9px] font-[family-name:var(--font-mono)]">
                  <thead><tr className="text-[#444]"><th className="text-left py-1">Provider</th><th className="text-right py-1">Cost</th><th className="text-right py-1">Quality</th><th className="text-right py-1">Score</th></tr></thead>
                  <tbody>{stage.providers.map((p, i) => (
                    <tr key={p.name} className={i === 0 ? "text-[#ededed]" : "text-[#666]"}>
                      <td className="py-1">{i === 0 ? "> " : "  "}{p.name}</td>
                      <td className="text-right py-1 tabular-nums">${p.price.toFixed(3)}</td>
                      <td className="text-right py-1">{p.quality}/10</td>
                      <td className="text-right py-1 tabular-nums">{p.score.toFixed(1)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {stage.output && <div className="text-[10px] text-[#666] leading-relaxed bg-[#0a0a0a] rounded p-2.5 border border-[#141414]">{stage.output}</div>}
              <div className="flex flex-wrap gap-1.5 text-[8px] font-[family-name:var(--font-mono)] text-[#333]">
                {stage.paymentTxHash && <span>{stage.paymentTxHash.slice(0, 18)}...</span>}
                {stage.latencyMs && <span>{stage.latencyMs}ms</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ================================================================
// APPROVAL CARD
// ================================================================

function ApprovalCard({ data, onRespond }: { data: Approval; onRespond: (id: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const bi = data.budgetImpact;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-[#f59e0b]/30 bg-[#0a0a0a] p-4 my-4 max-w-lg mx-auto">
      <div className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#f59e0b] mb-3">Approval Required</div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div><span className="text-[7px] text-[#444] block">Stage</span><span className="text-[11px] font-medium">{data.stageName}</span></div>
        <div><span className="text-[7px] text-[#444] block">Provider</span><span className="text-[11px] font-[family-name:var(--font-mono)]">{data.provider}</span></div>
        <div><span className="text-[7px] text-[#444] block">Amount</span><span className="text-[11px] font-[family-name:var(--font-mono)] tabular-nums">${data.amount.toFixed(4)}</span></div>
      </div>
      <div className="text-[9px] text-[#666] mb-3">{data.reason}</div>
      <div className="mb-3">
        <div className="flex justify-between text-[8px] text-[#444] mb-1"><span>Budget impact</span><span className="font-[family-name:var(--font-mono)] tabular-nums">${bi.projectedSpend.toFixed(3)} / ${bi.sessionBudget.toFixed(2)}</span></div>
        <div className="h-1.5 bg-[#1f1f1f] rounded-full overflow-hidden flex">
          <div className="h-full bg-[#ededed] rounded-l-full" style={{ width: `${(bi.currentSpend / bi.sessionBudget) * 100}%` }} />
          <motion.div initial={{ width: 0 }} animate={{ width: `${(data.amount / bi.sessionBudget) * 100}%` }} className="h-full bg-[#f59e0b]" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { setBusy(true); onRespond(data.approvalId, true); }} disabled={busy}
          className="flex-1 h-8 rounded bg-[#ededed] text-black text-[10px] font-medium disabled:opacity-30 transition-opacity hover:bg-white">Approve</button>
        <button onClick={() => { setBusy(true); onRespond(data.approvalId, false); }} disabled={busy}
          className="flex-1 h-8 rounded border border-[#1f1f1f] text-[#666] text-[10px] font-medium disabled:opacity-30 transition-opacity hover:text-[#999] hover:border-[#2e2e2e]">Deny</button>
      </div>
    </motion.div>
  );
}

// ================================================================
// VERDICT BADGE
// ================================================================

function VerdictBadge({ v }: { v: string }) {
  const styles: Record<string, string> = {
    APPROVED: "text-[#ededed] bg-[#1f1f1f]",
    DENIED: "text-[#ef4444] bg-[#1f1f1f]",
    ESCALATE: "text-[#f59e0b] bg-[#1f1f1f]",
    DOWNGRADE: "text-[#a855f7] bg-[#1f1f1f]",
    REROUTE: "text-[#06b6d4] bg-[#1f1f1f]",
  };
  return <span className={`text-[7px] font-[family-name:var(--font-mono)] font-medium px-1.5 py-0.5 rounded ${styles[v] || styles.APPROVED}`}>{v}</span>;
}

// ================================================================
// SUMMARY
// ================================================================

function Summary({ data }: { data: Record<string, unknown> }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="rounded border border-[#1f1f1f] bg-[#0a0a0a] p-3">
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { l: "Cost", v: `$${((data.totalCost as number) || 0).toFixed(4)}` },
          { l: "Stages", v: `${data.totalSteps || 0}${(data.deferredStages as string[])?.length ? ` (${(data.deferredStages as string[]).length} deferred)` : ""}` },
          { l: "Balance", v: `$${((data.walletBalance as number) || 0).toFixed(2)}` },
          { l: "Payments", v: String(((data.transactions as unknown[]) || []).length) },
        ].map(s => (
          <div key={s.l}>
            <span className="text-[7px] font-medium uppercase tracking-[0.1em] text-[#444] block">{s.l}</span>
            <span className="text-[11px] font-semibold font-[family-name:var(--font-mono)] tabular-nums">{s.v}</span>
          </div>
        ))}
      </div>
      {Boolean(data.partialCompletion) ? <div className="mt-2 text-[9px] text-[#f59e0b]">Partial: {(data.deferredStages as string[])?.join(", ")} deferred</div> : null}
      {data.auditTrace ? (
        <button onClick={() => {
          const blob = new Blob([JSON.stringify(data.auditTrace, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `audit-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
        }} className="mt-2 w-full py-1.5 rounded border border-[#1f1f1f] text-[8px] text-[#444] hover:text-[#666] transition-colors font-[family-name:var(--font-mono)]">
          Download Audit Trace
        </button>
      ) : null}
    </motion.div>
  );
}

// ================================================================
// SPEND RING
// ================================================================

function Ring({ pct }: { pct: number }) {
  const s = 40; const r = 16; const c = 2 * Math.PI * r; const o = c - (pct / 100) * c;
  return (
    <svg width={s} height={s} className="shrink-0">
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke="#1f1f1f" strokeWidth="2" />
      <motion.circle cx={s/2} cy={s/2} r={r} fill="none" stroke="#ededed" strokeWidth="2" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: o }}
        transition={{ duration: 0.6 }} transform={`rotate(-90 ${s/2} ${s/2})`} />
    </svg>
  );
}
