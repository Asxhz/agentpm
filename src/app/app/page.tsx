"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { Wallet, Activity, Settings, ChevronRight, Send, Copy, Check, ExternalLink, Globe, Zap, LayoutDashboard } from "lucide-react";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

interface ChatMessage { id: string; role: "user" | "assistant"; content: string; stages?: StageResult[]; summary?: Record<string, unknown>; timestamp: string; isStreaming?: boolean }
interface StageResult { stageId: string; stageName: string; stageDescription?: string; stageIndex: number; stageTotal: number; provider?: string; cost?: number; output?: string; txHash?: string; latencyMs?: number; status: "pending" | "running" | "done"; providers?: { name: string; price: number; quality: number; latency: number; score: number }[]; governancePassed?: boolean; paymentTxHash?: string; paymentAmount?: number; newBalance?: number }
interface WalletInfo { balance: number; address: string; totalSpent: number; txCount: number }
interface TxInfo { toolName: string; amount: number; txHash: string; status: string }

const PROMPTS = [
  { label: "Build a landing page", desc: "Generate and deploy a complete site", icon: Globe },
  { label: "Run a security audit", desc: "Analyze code for vulnerabilities", icon: Zap },
  { label: "Research competitors", desc: "Scrape and analyze market data", icon: Activity },
  { label: "Create marketing assets", desc: "Copy, visuals, and strategy", icon: LayoutDashboard },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/5">
      {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} className="text-text-muted" />}
    </button>
  );
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
  const [sidebarTab, setSidebarTab] = useState<"wallet" | "activity" | "config">("wallet");
  const [allTxns, setAllTxns] = useState<TxInfo[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
    await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", balance: 10.0 }) });
    refreshWallet(); setMessages([]); setLiveStages([]); setAllTxns([]);
  }, [refreshWallet]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: text, timestamp: new Date().toISOString() }]);
    setInput(""); setIsLoading(true); setLiveStages([]);

    const assistantId = (Date.now() + 1).toString();
    let assistantContent = "";
    let stages: StageResult[] = [];
    let summary: Record<string, unknown> | undefined;

    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date().toISOString(), isStreaming: true }]);

    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, sessionId, budget, priority }) });
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw) as { type: string; data: Record<string, unknown> };
            if (ev.type === "text_delta") {
              assistantContent += ev.data.text as string;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
            }
            if (ev.type === "stage_event") {
              const se = ev.data as Record<string, unknown>;
              const sd = se.data as Record<string, unknown>;
              if (se.type === "discovery") { stages = [...stages, { stageId: sd.stageId as string, stageName: sd.stageName as string, stageDescription: sd.stageDescription as string, stageIndex: sd.stageIndex as number, stageTotal: sd.stageTotal as number, status: "running" }]; setLiveStages([...stages]); }
              if (se.type === "evaluation") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, providers: sd.providers as StageResult["providers"] } : s); setLiveStages([...stages]); }
              if (se.type === "governance") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, governancePassed: sd.allowed as boolean } : s); setLiveStages([...stages]); }
              if (se.type === "payment" && sd.phase === "settled") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, paymentTxHash: sd.txHash as string, paymentAmount: sd.amount as number, newBalance: sd.newBalance as number } : s); setLiveStages([...stages]); setWallet(w => w ? { ...w, balance: sd.newBalance as number } : w); }
              if (se.type === "decision") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, provider: sd.provider as string, cost: sd.price as number } : s); setLiveStages([...stages]); }
              if (se.type === "result") { stages = stages.map(s => s.stageId === (sd.stageId as string) ? { ...s, status: "done" as const, output: sd.output as string, txHash: sd.txHash as string, latencyMs: sd.latencyMs as number, provider: sd.provider as string, cost: sd.cost as number } : s); setLiveStages([...stages]); }
            }
            if (ev.type === "execution_complete") { summary = ev.data; refreshWallet(); }
          } catch { /* skip */ }
        }
      }
    } catch (err) { assistantContent = `Error: ${err instanceof Error ? err.message : "Connection failed"}`; }

    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent.replace(/\[EXECUTE:[^\]]*\]/, "").trim(), stages: stages.length > 0 ? stages : undefined, summary, isStreaming: false } : m));
    setLiveStages([]); setIsLoading(false); refreshWallet(); inputRef.current?.focus();
  }, [input, isLoading, sessionId, budget, priority, refreshWallet]);

  const budgetUsed = wallet ? ((wallet.totalSpent / (wallet.totalSpent + wallet.balance)) * 100) : 0;

  return (
    <div className="h-screen flex overflow-hidden bg-bg">
      {/* SIDEBAR */}
      <motion.aside initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1, width: sidebarOpen ? 260 : 56 }}
        className="shrink-0 border-r border-border flex flex-col overflow-hidden transition-all duration-300">
        {/* Logo */}
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-border shrink-0">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple to-blue flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-white">PM</span>
            </div>
            {sidebarOpen && <span className="text-sm font-semibold tracking-tight">AgentPM</span>}
          </Link>
          {sidebarOpen && <button onClick={() => setSidebarOpen(false)} className="ml-auto text-text-muted hover:text-text p-1"><ChevronRight size={14} /></button>}
          {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="text-text-muted hover:text-text p-1"><ChevronRight size={14} className="rotate-180" /></button>}
        </div>

        {/* Nav tabs */}
        <div className="flex border-b border-border shrink-0">
          {([["wallet", Wallet], ["activity", Activity], ["config", Settings]] as const).map(([id, Icon]) => (
            <button key={id} onClick={() => setSidebarTab(id as typeof sidebarTab)}
              className={`flex-1 py-2.5 flex items-center justify-center transition-colors ${sidebarTab === id ? "text-text bg-white/[0.03]" : "text-text-muted hover:text-text-dim"}`}>
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto">
          {sidebarTab === "wallet" && sidebarOpen && (
            <div className="p-4 space-y-4 animate-fade-up">
              {/* Wallet Connect */}
              <div className="[&_button]:!rounded-lg [&_button]:!text-[10px] [&_button]:!h-8 [&_button]:!font-medium">
                <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
              </div>

              {isConnected && (
                <div className="rounded-xl glass p-3.5">
                  <div className="text-[9px] font-medium uppercase tracking-widest text-text-muted mb-1">On-Chain Balance</div>
                  <div className="text-2xl font-bold font-[family-name:var(--font-mono)] tabular-nums">${usdcBalance.toFixed(2)}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">USDC on Base Sepolia</div>
                  {usdcBalance === 0 && (
                    <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[9px] text-accent hover:underline"><ExternalLink size={9} />Get testnet USDC</a>
                  )}
                </div>
              )}

              {/* Session Budget */}
              {wallet && (
                <div className="space-y-3">
                  <div className="rounded-xl glass p-3.5">
                    <div className="text-[9px] font-medium uppercase tracking-widest text-text-muted mb-2">Session Budget</div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-lg font-bold font-[family-name:var(--font-mono)] tabular-nums">${wallet.balance.toFixed(2)}</span>
                      <span className="text-[9px] text-text-muted">${wallet.totalSpent.toFixed(3)} spent</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-blue" animate={{ width: `${budgetUsed}%` }} transition={{ duration: 0.5 }} />
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="rounded-xl glass p-3.5 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-medium uppercase tracking-widest text-text-muted">Max Budget</span>
                        <span className="text-[10px] font-[family-name:var(--font-mono)] tabular-nums">${budget}</span>
                      </div>
                      <input type="range" min="1" max="10" step="0.5" value={budget} onChange={e => setBudget(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/[0.04] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                    </div>
                    <div>
                      <span className="text-[9px] font-medium uppercase tracking-widest text-text-muted block mb-1.5">Priority</span>
                      <div className="grid grid-cols-4 gap-1">
                        {(["cost","quality","speed","balanced"] as const).map(p => (
                          <button key={p} onClick={() => setPriority(p)}
                            className={`text-[8px] py-1.5 rounded-lg font-medium transition-all capitalize ${
                              priority === p ? "bg-white/10 text-text shadow-[0_0_12px_rgba(255,255,255,0.05)]" : "text-text-muted hover:text-text-dim hover:bg-white/[0.02]"
                            }`}>{p}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link href="/hosting" className="flex-1 text-center py-2 rounded-lg text-[9px] font-medium text-text-muted hover:text-text bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-border">Hosting</Link>
                    <button onClick={resetAll} className="flex-1 py-2 rounded-lg text-[9px] font-medium text-text-muted hover:text-text bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-border">Reset</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {sidebarTab === "activity" && sidebarOpen && (
            <div className="p-4 animate-fade-up">
              <div className="text-[9px] font-medium uppercase tracking-widest text-text-muted mb-3">Transactions ({allTxns.length})</div>
              {allTxns.length === 0 ? <p className="text-[10px] text-text-muted">No transactions yet</p> : (
                <div className="space-y-1.5">
                  {allTxns.map((tx, i) => (
                    <motion.div key={tx.txHash + i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      className="rounded-lg glass p-2.5 group">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium truncate">{tx.toolName}</span>
                        <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-red">-${tx.amount.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${tx.status === "confirmed" ? "bg-accent" : "bg-amber animate-pulse-glow"}`} />
                        <span className="font-[family-name:var(--font-mono)] text-[7px] text-text-muted truncate">{tx.txHash.slice(0, 28)}...</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {sidebarTab === "config" && sidebarOpen && (
            <div className="p-4 space-y-3 animate-fade-up">
              <div className="rounded-xl glass p-3.5">
                <div className="text-[9px] font-medium uppercase tracking-widest text-text-muted mb-2">Policy Limits</div>
                <div className="space-y-2">
                  {[["Per Transaction", "$0.50"], ["Daily Max", "$5.00"], ["Network", "Base Sepolia"]].map(([l, v]) => (
                    <div key={l} className="flex justify-between items-center">
                      <span className="text-[10px] text-text-dim">{l}</span>
                      <span className="text-[9px] font-[family-name:var(--font-mono)] px-2 py-0.5 rounded-md bg-white/[0.04] text-text-secondary">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl glass p-3.5">
                <div className="text-[9px] font-medium uppercase tracking-widest text-text-muted mb-2">Network</div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
                  <span className="text-[10px] font-[family-name:var(--font-mono)]">base-sepolia / x402</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOP BAR */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-border shrink-0 glass">
          <div className="flex items-center gap-3 text-[10px] font-[family-name:var(--font-mono)] text-text-dim">
            <span className="px-2 py-0.5 rounded-md bg-white/[0.04]">session {sessionId.slice(0, 6)}</span>
            {isLoading && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="flex items-center gap-1.5 text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" />running</motion.span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-[10px] font-[family-name:var(--font-mono)] text-text-dim">live</span>
            </div>
          </div>
        </div>

        {/* CHAT */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-8">
            {/* EMPTY STATE */}
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="pt-12 pb-8 text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple/20 to-blue/20 border border-white/[0.06] flex items-center justify-center">
                  <span className="text-2xl font-bold bg-gradient-to-r from-purple to-cyan bg-clip-text text-transparent">$</span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight mb-2">What are you building?</h2>
                  <p className="text-[13px] text-text-dim max-w-md mx-auto leading-relaxed">Describe your project. I plan stages, find tools, check policies, pay via x402, and ship it live. Real deployments, real domain checks, real payments.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
                  {PROMPTS.map((p, i) => (
                    <motion.button key={p.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.06 }}
                      onClick={() => setInput(p.label.toLowerCase() + " for my startup")}
                      className="text-left p-3.5 rounded-xl border border-border hover:border-border-bright hover:bg-white/[0.02] transition-all group">
                      <div className="flex items-center gap-2 mb-1">
                        <p.icon size={13} className="text-text-muted group-hover:text-accent transition-colors" />
                        <span className="text-[11px] font-medium">{p.label}</span>
                      </div>
                      <span className="text-[10px] text-text-muted">{p.desc}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* MESSAGES */}
            <AnimatePresence>
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                  {msg.role === "user" && (
                    <div className="flex justify-end mb-5">
                      <div className="max-w-[80%] bg-gradient-to-r from-blue/10 to-purple/10 border border-white/[0.06] rounded-2xl rounded-br-md px-4 py-3 text-[13px] leading-relaxed">{msg.content}</div>
                    </div>
                  )}
                  {msg.role === "assistant" && (
                    <div className="flex gap-3 mb-6 group">
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-accent/20 to-cyan/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[8px] font-bold text-accent">PM</span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-4">
                        {msg.content && (
                          <div className="relative">
                            <div className="text-[13px] text-text-secondary leading-[1.75] [&_strong]:text-text [&_strong]:font-semibold [&_table]:w-full [&_table]:text-[10px] [&_table]:font-[family-name:var(--font-mono)] [&_table]:mt-2 [&_table]:mb-2 [&_th]:text-left [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:border-b [&_th]:border-border [&_th]:text-text-muted [&_th]:font-medium [&_th]:bg-white/[0.02] [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-white/[0.03] [&_ul]:space-y-1 [&_ul]:my-2 [&_ol]:space-y-1 [&_ol]:my-2 [&_li]:text-text-dim [&_code]:bg-white/[0.04] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-[11px] [&_code]:font-[family-name:var(--font-mono)] [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-xs [&_h4]:font-medium [&_h4]:mt-2 [&_h4]:mb-1 [&_p]:mb-2 [&_hr]:border-border [&_hr]:my-3">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                              {msg.isStreaming && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-accent">|</motion.span>}
                            </div>
                            <CopyBtn text={msg.content} />
                          </div>
                        )}
                        {msg.stages && msg.stages.length > 0 && (
                          <div className="space-y-2">{msg.stages.map((s, i) => <StageCard key={s.stageId} stage={s} index={i} />)}</div>
                        )}
                        {msg.summary && <SummaryCard data={msg.summary} />}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* LIVE STAGES */}
            {liveStages.length > 0 && (
              <div className="flex gap-3 mb-6">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-accent/20 to-cyan/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[8px] font-bold text-accent">PM</span>
                </div>
                <div className="flex-1 space-y-2">{liveStages.map((s, i) => <StageCard key={s.stageId} stage={s} index={i} live />)}</div>
              </div>
            )}

            {isLoading && liveStages.length === 0 && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3 mb-6">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-accent/20 to-cyan/20 flex items-center justify-center shrink-0">
                  <span className="text-[8px] font-bold text-accent">PM</span>
                </div>
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map(i => (
                    <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1.5 h-1.5 rounded-full bg-text-muted" />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* INPUT */}
        <div className="shrink-0 border-t border-border p-4 glass">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Describe your project, ask questions, or give feedback..."
                  disabled={isLoading} rows={1}
                  className="w-full bg-white/[0.03] border border-border rounded-xl px-4 py-3 pr-12 text-[13px] resize-none focus:outline-none focus:border-border-bright focus:shadow-[0_0_20px_rgba(255,255,255,0.03)] placeholder:text-text-muted transition-all min-h-[48px] max-h-[120px]" />
                <motion.button onClick={send} disabled={isLoading || !input.trim()}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="absolute right-2 bottom-2 h-8 w-8 rounded-lg bg-gradient-to-r from-accent to-blue flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-opacity">
                  <Send size={14} className="text-white" />
                </motion.button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 text-[9px] font-[family-name:var(--font-mono)] text-text-muted">
              <span>{messages.filter(m => m.role === "user").length} messages / ${budget} budget / {priority}</span>
              <span>Enter to send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// STAGE CARD
function StageCard({ stage, index, live }: { stage: StageResult; index: number; live?: boolean }) {
  const [open, setOpen] = useState(live || false);
  const isDone = stage.status === "done";
  const isRunning = stage.status === "running";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: live ? 0 : index * 0.05 }}
      className={`rounded-xl border transition-all ${isDone ? "glass" : isRunning ? "glass border-accent/20 shadow-[0_0_20px_rgba(34,197,94,0.05)]" : "glass opacity-50"}`}>
      <button onClick={() => setOpen(!open)} className="w-full p-3.5 flex items-center justify-between text-left">
        <div className="flex items-center gap-3">
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-[family-name:var(--font-mono)] font-bold ${isDone ? "bg-accent/15 text-accent" : isRunning ? "bg-white/10 text-white" : "bg-white/5 text-text-muted"}`}>{index + 1}</div>
          <div>
            <span className="text-[12px] font-medium block">{stage.stageName}</span>
            {stage.stageDescription && <span className="text-[10px] text-text-dim">{stage.stageDescription}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stage.provider && <span className="text-[9px] font-[family-name:var(--font-mono)] text-text-dim px-2 py-0.5 rounded-md bg-white/[0.04]">{stage.provider}</span>}
          {stage.cost !== undefined && <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-text-dim">-${stage.cost.toFixed(3)}</span>}
          {isDone && <span className="h-2 w-2 rounded-full bg-accent" />}
          {isRunning && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-2 w-2 rounded-full bg-amber" />}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3.5 pb-3.5 space-y-2">
              {stage.providers && stage.providers.length > 0 && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <table className="w-full text-[9px] font-[family-name:var(--font-mono)]">
                    <thead><tr className="bg-white/[0.02] text-text-muted"><th className="text-left px-2.5 py-1.5">Provider</th><th className="text-right px-2.5 py-1.5">Price</th><th className="text-right px-2.5 py-1.5">Quality</th><th className="text-right px-2.5 py-1.5">Score</th></tr></thead>
                    <tbody>{stage.providers.map((p, i) => (
                      <tr key={p.name} className={i === 0 ? "bg-accent/[0.03]" : ""}>
                        <td className="px-2.5 py-1.5">{i === 0 && <span className="text-accent mr-1">{">"}</span>}{p.name}</td>
                        <td className="text-right px-2.5 py-1.5 tabular-nums">${p.price.toFixed(3)}</td>
                        <td className="text-right px-2.5 py-1.5 tabular-nums">{p.quality}/10</td>
                        <td className="text-right px-2.5 py-1.5 tabular-nums text-accent">{p.score.toFixed(1)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {stage.governancePassed !== undefined && (
                  <span className={`px-2 py-0.5 rounded-md text-[8px] font-medium ${stage.governancePassed ? "bg-accent/10 text-accent" : "bg-red/10 text-red"}`}>policy {stage.governancePassed ? "passed" : "denied"}</span>
                )}
                {stage.paymentTxHash && <span className="px-2 py-0.5 rounded-md text-[8px] font-[family-name:var(--font-mono)] bg-white/[0.04] text-text-muted">{stage.paymentTxHash.slice(0, 18)}...</span>}
              </div>
              {stage.output && <div className="bg-white/[0.02] rounded-lg p-3 text-[11px] text-text-secondary leading-relaxed">{stage.output}</div>}
              {isRunning && !stage.output && (
                <div className="flex items-center gap-2 py-2">
                  {[0, 1, 2].map(i => (<motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-text-muted" />))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// SUMMARY
function SummaryCard({ data }: { data: Record<string, unknown> }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl glass border-accent/20 p-4 shadow-[0_0_30px_rgba(34,197,94,0.05)]">
      <div className="grid grid-cols-4 gap-4 text-center">
        {[
          { l: "Cost", v: `$${((data.totalCost as number) || 0).toFixed(4)}` },
          { l: "Stages", v: String((data.totalSteps as number) || 0) },
          { l: "Remaining", v: `$${((data.walletBalance as number) || 0).toFixed(4)}` },
          { l: "Payments", v: String(((data.transactions as unknown[]) || []).length) },
        ].map(s => (
          <div key={s.l}>
            <span className="text-[8px] font-medium uppercase tracking-widest text-text-muted block mb-0.5">{s.l}</span>
            <span className="text-sm font-bold font-[family-name:var(--font-mono)] tabular-nums">{s.v}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
