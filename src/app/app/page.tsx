"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { formatUnits, parseUnits } from "viem";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

// Hook: read real USDC balance from Base Sepolia
function useUsdcBalance() {
  const { address } = useAccount();
  const { data, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
  return { balance: data ? parseFloat(formatUnits(data, 6)) : 0, refetch };
}

// Hook: sign real x402 EIP-712 payment
function useSignX402() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const signPayment = useCallback(async (to: string, amountUSD: number) => {
    if (!address) throw new Error("Wallet not connected");
    const value = parseUnits(amountUSD.toFixed(6), 6);
    const nonce = ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const signature = await signTypedDataAsync({
      domain: { name: "USD Coin", version: "2", chainId: 84532, verifyingContract: USDC_ADDRESS },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: { from: address, to: to as `0x${string}`, value, validAfter: 0n, validBefore, nonce },
    });

    return { signature, from: address, to, value: value.toString(), validAfter: "0", validBefore: validBefore.toString(), nonce };
  }, [address, signTypedDataAsync]);

  return { signPayment, address };
}

// ================================================================
// TYPES
// ================================================================

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  stages?: StageResult[];
  summary?: Record<string, unknown>;
  timestamp: string;
  isStreaming?: boolean;
}

interface StageResult {
  stageId: string;
  stageName: string;
  stageDescription?: string;
  stageIndex: number;
  stageTotal: number;
  provider?: string;
  cost?: number;
  output?: string;
  txHash?: string;
  latencyMs?: number;
  status: "pending" | "running" | "done";
  // From evaluation
  providers?: { name: string; price: number; quality: number; latency: number; score: number }[];
  // From governance
  governancePassed?: boolean;
  // From payment
  paymentTxHash?: string;
  paymentAmount?: number;
  newBalance?: number;
}

interface WalletInfo { balance: number; address: string; totalSpent: number; txCount: number }

// ================================================================
// COUNTER
// ================================================================

// Counter removed - using real wallet balance from RainbowKit

// ================================================================
// MAIN
// ================================================================

export default function AppPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [liveStages, setLiveStages] = useState<StageResult[]>([]);
  const [budget, setBudget] = useState(5);
  const [priority, setPriority] = useState("balanced");
  const [sidebarTab, setSidebarTab] = useState<"wallet" | "txns" | "config">("wallet");
  const [allTxns, setAllTxns] = useState<{ toolName: string; amount: number; txHash: string; status: string; timestamp?: string }[]>([]);
  const [vercelToken, setVercelToken] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [deployedSites, setDeployedSites] = useState<{ subdomain: string; url: string; projectName: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // ================================================================
  // SEND MESSAGE
  // ================================================================

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setIsLoading(true); setLiveStages([]);

    // Create streaming assistant message
    const assistantId = (Date.now() + 1).toString();
    let assistantContent = "";
    let stages: StageResult[] = [];
    let summary: Record<string, unknown> | undefined;
    // Add initial streaming message
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date().toISOString(), isStreaming: true }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, budget, priority }),
      });
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

            // Streaming text
            if (ev.type === "text_delta") {
              assistantContent += ev.data.text as string;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
            }

            // Pipeline events
            if (ev.type === "stage_event") {
              const se = ev.data as Record<string, unknown>;
              const sd = se.data as Record<string, unknown>;

              if (se.type === "discovery") {
                const ns: StageResult = {
                  stageId: sd.stageId as string, stageName: sd.stageName as string,
                  stageDescription: sd.stageDescription as string,
                  stageIndex: sd.stageIndex as number, stageTotal: sd.stageTotal as number,
                  status: "running",
                };
                stages = [...stages, ns];
                setLiveStages([...stages]);
              }

              if (se.type === "evaluation") {
                stages = stages.map(s => s.stageId === (sd.stageId as string)
                  ? { ...s, providers: sd.providers as StageResult["providers"] } : s);
                setLiveStages([...stages]);
              }

              if (se.type === "governance") {
                const stageId = sd.stageId as string;
                stages = stages.map(s => s.stageId === stageId ? { ...s, governancePassed: sd.allowed as boolean } : s);
                setLiveStages([...stages]);
              }

              if (se.type === "payment" && sd.phase === "settled") {
                const stageId = sd.stageId as string;
                stages = stages.map(s => s.stageId === stageId
                  ? { ...s, paymentTxHash: sd.txHash as string, paymentAmount: sd.amount as number, newBalance: sd.newBalance as number } : s);
                setLiveStages([...stages]);
                setWallet(w => w ? { ...w, balance: sd.newBalance as number } : w);
              }

              if (se.type === "decision") {
                const stageId = sd.stageId as string;
                stages = stages.map(s => s.stageId === stageId ? { ...s, provider: sd.provider as string, cost: sd.price as number } : s);
                setLiveStages([...stages]);
              }

              if (se.type === "result") {
                stages = stages.map(s => s.stageId === (sd.stageId as string)
                  ? { ...s, status: "done" as const, output: sd.output as string, txHash: sd.txHash as string, latencyMs: sd.latencyMs as number, provider: sd.provider as string, cost: sd.cost as number } : s);
                setLiveStages([...stages]);
              }
            }

            if (ev.type === "execution_complete") {
              summary = ev.data;
              refreshWallet();
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      assistantContent = `Error: ${err instanceof Error ? err.message : "Connection failed"}`;
    }

    // Finalize message
    setMessages(prev => prev.map(m => m.id === assistantId
      ? { ...m, content: assistantContent.replace(/\[EXECUTE:[^\]]*\]/, "").trim(), stages: stages.length > 0 ? stages : undefined, summary, isStreaming: false }
      : m
    ));
    setLiveStages([]);
    setIsLoading(false);
    refreshWallet();
    inputRef.current?.focus();
  }, [input, isLoading, sessionId, budget, priority, refreshWallet]);

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* HEADER */}
      <header className="shrink-0 h-11 px-4 flex items-center justify-between border-b border-border bg-bg/80 backdrop-blur-lg z-50">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="h-5 w-5 rounded bg-white/10 flex items-center justify-center">
              <span className="text-[8px] font-bold font-[family-name:var(--font-mono)] text-white/60">PM</span>
            </div>
            <span className="text-xs font-semibold tracking-tight">AgentPM</span>
          </Link>
          <span className="text-[9px] text-text-muted font-[family-name:var(--font-mono)]">session {sessionId.slice(0, 6)}</span>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-[family-name:var(--font-mono)]">
          {isLoading && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-accent">running</motion.span>}
          <span className="text-text-muted">x402</span>
          <span className="text-text-muted">/</span>
          <span className="text-text-muted">base-sepolia</span>
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["wallet", "txns", "config"] as const).map(t => (
              <button key={t} onClick={() => setSidebarTab(t)}
                className={`flex-1 py-2 text-[9px] font-medium uppercase tracking-wider transition-colors ${sidebarTab === t ? "text-text border-b border-text" : "text-text-muted"}`}>
                {t === "wallet" ? "Wallet" : t === "txns" ? `Txns (${allTxns.length})` : "Config"}
              </button>
            ))}
          </div>

          {sidebarTab === "wallet" && (
            <WalletSidebar wallet={wallet} budget={budget} setBudget={setBudget} priority={priority} setPriority={setPriority} onReset={resetAll} />
          )}

          {sidebarTab === "txns" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {allTxns.length === 0 ? (
                <p className="text-[9px] text-text-muted mt-4 text-center">No transactions yet</p>
              ) : (
                allTxns.map((tx, i) => (
                  <motion.div key={tx.txHash + i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="bg-surface rounded p-2 border border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-medium truncate mr-1">{tx.toolName}</span>
                      <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-red shrink-0">-${tx.amount.toFixed(4)}</span>
                    </div>
                    <div className="font-[family-name:var(--font-mono)] text-[7px] text-text-muted mt-1 flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-accent" />
                      <span className="truncate">{tx.txHash}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {sidebarTab === "config" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Vercel Token</span>
                <input type="password" value={vercelToken} onChange={e => setVercelToken(e.target.value)}
                  placeholder="vercel_xxxx..."
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[9px] font-[family-name:var(--font-mono)] placeholder:text-text-muted focus:outline-none focus:border-border-bright" />
                <p className="text-[7px] text-text-muted mt-1">Optional. Get at vercel.com/account/tokens</p>
              </div>
              <div>
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Custom Domain</span>
                <input type="text" value={customDomain} onChange={e => setCustomDomain(e.target.value)}
                  placeholder="yourdomain.com"
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-[9px] font-[family-name:var(--font-mono)] placeholder:text-text-muted focus:outline-none focus:border-border-bright" />
                <p className="text-[7px] text-text-muted mt-1">Enter your domain to connect deployments</p>
              </div>
              <div>
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Free Hosting</span>
                <div className="bg-surface rounded p-2 border border-accent/20">
                  <span className="text-[9px] text-accent font-medium block">larp.click subdomains</span>
                  <p className="text-[8px] text-text-dim mt-0.5">All projects get free hosting at yourproject.larp.click. Tell the agent to deploy and it will create a live URL instantly.</p>
                </div>
              </div>
              <div>
                <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Deployed Sites</span>
                {deployedSites.length === 0 ? (
                  <p className="text-[8px] text-text-muted">No deployments yet</p>
                ) : (
                  <div className="space-y-1">
                    {deployedSites.map(s => (
                      <a key={s.subdomain} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="block bg-surface rounded p-2 border border-border hover:border-border-bright transition-colors">
                        <span className="text-[9px] font-medium block">{s.projectName}</span>
                        <span className="text-[8px] font-[family-name:var(--font-mono)] text-accent">{s.url}</span>
                      </a>
                    ))}
                  </div>
                )}
                <button onClick={() => fetch("/api/deploy").then(r => r.json()).then(d => setDeployedSites(d.sites || []))}
                  className="mt-2 text-[8px] text-text-muted hover:text-text-secondary transition-colors font-[family-name:var(--font-mono)]">
                  refresh
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* CHAT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-5 py-6 space-y-1">

              {/* EMPTY STATE */}
              {messages.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pt-16 pb-8 text-center space-y-5">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center">
                    <span className="text-lg font-bold text-text-muted font-[family-name:var(--font-mono)]">$</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight mb-1">What are you building?</h2>
                    <p className="text-[12px] text-text-dim max-w-md mx-auto leading-relaxed">
                      I will plan your project, recommend tools, show you the cost breakdown, and execute when you give the green light. I remember everything we discuss.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {[
                      "Plan a go-to-market campaign for my new dev tools SaaS",
                      "I need a full security audit for my Node.js API",
                      "Research the top 5 competitors in my space and build a comparison",
                      "Create all the assets for a product launch",
                    ].map(s => (
                      <button key={s} onClick={() => setInput(s)}
                        className="text-[10px] px-3 py-1.5 rounded-lg border border-border text-text-dim hover:text-text hover:border-border-bright hover:bg-surface transition-all text-left max-w-xs">
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* MESSAGES */}
              <AnimatePresence>
                {messages.map(msg => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}>

                    {msg.role === "user" && (
                      <div className="flex gap-3 py-4">
                        <div className="h-6 w-6 rounded bg-surface-2 border border-border flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[8px] font-[family-name:var(--font-mono)] text-text-dim font-bold">U</span>
                        </div>
                        <div className="text-[13px] text-text leading-relaxed pt-0.5">{msg.content}</div>
                      </div>
                    )}

                    {msg.role === "assistant" && (
                      <div className="flex gap-3 py-4 border-t border-border/30">
                        <div className="h-6 w-6 rounded bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[8px] font-[family-name:var(--font-mono)] text-accent font-bold">PM</span>
                        </div>
                        <div className="flex-1 min-w-0 space-y-4">
                          {msg.content && (
                            <div className="text-[13px] text-text-secondary leading-[1.7] prose-sm prose-invert max-w-none [&_strong]:text-text [&_strong]:font-semibold [&_table]:w-full [&_table]:text-[10px] [&_table]:font-[family-name:var(--font-mono)] [&_th]:text-left [&_th]:px-2 [&_th]:py-1 [&_th]:border-b [&_th]:border-border [&_th]:text-text-dim [&_th]:font-medium [&_td]:px-2 [&_td]:py-1 [&_td]:border-b [&_td]:border-border/50 [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:text-text-dim [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:rounded [&_code]:text-[11px] [&_code]:font-[family-name:var(--font-mono)] [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h4]:text-xs [&_h4]:font-medium [&_h4]:mt-2 [&_h4]:mb-1 [&_p]:mb-2 [&_hr]:border-border [&_hr]:my-3">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                              {msg.isStreaming && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="text-accent ml-0.5">|</motion.span>}
                            </div>
                          )}

                          {/* STAGE CARDS */}
                          {msg.stages && msg.stages.length > 0 && (
                            <div className="space-y-2">
                              {msg.stages.map((stage, i) => (
                                <StageCard key={stage.stageId} stage={stage} index={i} />
                              ))}
                            </div>
                          )}

                          {/* SUMMARY */}
                          {msg.summary && <SummaryCard data={msg.summary} />}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* LIVE STAGES */}
              {liveStages.length > 0 && (
                <div className="flex gap-3 py-4 border-t border-border/30">
                  <div className="h-6 w-6 rounded bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[8px] font-[family-name:var(--font-mono)] text-accent font-bold">PM</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    {liveStages.map((stage, i) => (
                      <StageCard key={stage.stageId} stage={stage} index={i} live />
                    ))}
                  </div>
                </div>
              )}

              {/* LOADING (before execution starts) */}
              {isLoading && liveStages.length === 0 && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3 py-4">
                  <div className="h-6 w-6 rounded bg-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-[family-name:var(--font-mono)] text-accent font-bold">PM</span>
                  </div>
                  <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-[13px] text-text-muted pt-0.5">thinking...</motion.span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* INPUT BAR */}
          <div className="shrink-0 border-t border-border bg-bg/80 backdrop-blur-lg">
            <div className="max-w-3xl mx-auto px-5 py-3">
              <div className="flex gap-2">
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={messages.length === 0 ? "Describe your project..." : "Follow up, give feedback, or ask for changes..."}
                  disabled={isLoading} rows={1}
                  className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-[13px] resize-none focus:outline-none focus:border-border-bright placeholder:text-text-muted transition-colors min-h-[40px] max-h-[100px]" />
                <motion.button onClick={send} disabled={isLoading || !input.trim()}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="h-10 px-5 rounded-xl bg-white text-[#09090b] text-xs font-semibold self-end disabled:opacity-15 disabled:cursor-not-allowed transition-colors shrink-0">
                  Send
                </motion.button>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[8px] font-[family-name:var(--font-mono)] text-text-muted">
                <span>{messages.filter(m => m.role === "user").length} messages / budget ${budget} / {priority}</span>
                <span>Enter to send</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// STAGE CARD
// ================================================================

function StageCard({ stage, index, live }: { stage: StageResult; index: number; live?: boolean }) {
  const [expanded, setExpanded] = useState(live || false);
  const isDone = stage.status === "done";
  const isRunning = stage.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: live ? 0 : index * 0.06, type: "spring", stiffness: 300, damping: 28 }}
      className={`rounded-xl border transition-colors ${isDone ? "bg-surface border-border" : isRunning ? "bg-surface border-accent/20" : "bg-surface border-border/50 opacity-60"}`}>

      {/* Header - always visible */}
      <button onClick={() => setExpanded(!expanded)} className="w-full p-3.5 flex items-center justify-between text-left">
        <div className="flex items-center gap-3">
          <div className={`h-6 w-6 rounded-lg flex items-center justify-center text-[9px] font-[family-name:var(--font-mono)] font-bold ${
            isDone ? "bg-accent/15 text-accent" : isRunning ? "bg-white/10 text-white" : "bg-surface-2 text-text-muted"
          }`}>{index + 1}</div>
          <div>
            <span className="text-[12px] font-medium block">{stage.stageName}</span>
            {stage.stageDescription && <span className="text-[10px] text-text-dim">{stage.stageDescription}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {stage.provider && <span className="text-[9px] font-[family-name:var(--font-mono)] text-text-dim">{stage.provider}</span>}
          {stage.cost !== undefined && <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums text-text-dim">-${stage.cost.toFixed(3)}</span>}
          {isDone && <span className="h-2 w-2 rounded-full bg-accent" />}
          {isRunning && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="h-2 w-2 rounded-full bg-amber" />}
          <span className="text-[10px] text-text-muted">{expanded ? "-" : "+"}</span>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3.5 pb-3.5 space-y-3">

              {/* Provider comparison */}
              {stage.providers && stage.providers.length > 0 && (
                <div>
                  <span className="text-[8px] font-medium uppercase tracking-wider text-text-dim block mb-1.5">Provider Comparison</span>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-[9px] font-[family-name:var(--font-mono)]">
                      <thead><tr className="bg-surface-2 text-text-muted"><th className="text-left px-2.5 py-1.5">Provider</th><th className="text-right px-2.5 py-1.5">Price</th><th className="text-right px-2.5 py-1.5">Quality</th><th className="text-right px-2.5 py-1.5">Latency</th><th className="text-right px-2.5 py-1.5">Score</th></tr></thead>
                      <tbody>{stage.providers.map((p, i) => (
                        <tr key={p.name} className={`border-t border-border/50 ${i === 0 ? "bg-accent/[0.03]" : ""}`}>
                          <td className="px-2.5 py-1.5">{i === 0 && <span className="text-accent mr-1">{">"}</span>}{p.name}</td>
                          <td className="text-right px-2.5 py-1.5 tabular-nums">${p.price.toFixed(3)}</td>
                          <td className="text-right px-2.5 py-1.5 tabular-nums">{p.quality}/10</td>
                          <td className="text-right px-2.5 py-1.5 tabular-nums text-text-muted">{p.latency}ms</td>
                          <td className="text-right px-2.5 py-1.5 tabular-nums text-accent font-medium">{p.score.toFixed(1)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Governance + Payment details */}
              <div className="flex items-center gap-3 text-[9px] font-[family-name:var(--font-mono)]">
                {stage.governancePassed !== undefined && (
                  <span className={`px-2 py-0.5 rounded ${stage.governancePassed ? "bg-accent/10 text-accent" : "bg-red/10 text-red"}`}>
                    policy {stage.governancePassed ? "passed" : "denied"}
                  </span>
                )}
                {stage.paymentTxHash && (
                  <span className="text-text-muted">tx {stage.paymentTxHash.slice(0, 20)}...</span>
                )}
                {stage.latencyMs && <span className="text-text-muted">{stage.latencyMs}ms</span>}
                {stage.newBalance !== undefined && (
                  <span className="text-text-muted ml-auto">bal ${stage.newBalance.toFixed(4)}</span>
                )}
              </div>

              {/* Output */}
              {stage.output && (
                <div className="bg-surface-2 rounded-lg p-3.5 text-[11px] text-text-secondary leading-relaxed">{stage.output}</div>
              )}

              {/* Running state */}
              {isRunning && !stage.output && (
                <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                  className="text-[10px] text-text-muted font-[family-name:var(--font-mono)]">
                  executing...
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ================================================================
// SUMMARY CARD
// ================================================================

function SummaryCard({ data }: { data: Record<string, unknown> }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-accent/20 bg-surface p-4">
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { l: "Cost", v: `$${((data.totalCost as number) || 0).toFixed(4)}` },
          { l: "Stages", v: String((data.totalSteps as number) || 0) },
          { l: "Remaining", v: `$${((data.walletBalance as number) || 0).toFixed(4)}` },
          { l: "Payments", v: String(((data.transactions as unknown[]) || []).length) },
        ].map(s => (
          <div key={s.l}>
            <span className="text-[7px] font-medium uppercase tracking-wider text-text-dim block">{s.l}</span>
            <span className="text-sm font-[family-name:var(--font-mono)] font-semibold tabular-nums">{s.v}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ================================================================
// WALLET SIDEBAR (Real wallet via RainbowKit)
// ================================================================

function WalletSidebar({ wallet, budget, setBudget, priority, setPriority, onReset }: {
  wallet: WalletInfo | null; budget: number; setBudget: (n: number) => void;
  priority: string; setPriority: (s: string) => void; onReset: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { balance: usdcBalance } = useUsdcBalance();

  return (
    <div className="p-3 space-y-4 flex-1 overflow-y-auto">
      <div>
        <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-2">Your Wallet</span>
        <div className="[&_button]:!rounded-lg [&_button]:!text-[10px] [&_button]:!h-8">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      {isConnected && address && (
        <>
          <div>
            <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1">On-Chain (Base Sepolia)</span>
            <span className="text-xl font-semibold font-[family-name:var(--font-mono)]">${usdcBalance.toFixed(4)}</span>
            <span className="text-[9px] text-text-muted ml-1">USDC</span>
            <a href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
              className="text-[8px] text-accent hover:underline block mt-1 font-[family-name:var(--font-mono)]">View on BaseScan</a>
          </div>
          {usdcBalance === 0 && (
            <div className="bg-surface rounded-lg p-2.5 border border-amber/20">
              <span className="text-[9px] text-amber font-medium block mb-1">Need testnet funds?</span>
              <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                className="text-[8px] text-accent hover:underline block font-[family-name:var(--font-mono)]">Get USDC (Circle Faucet)</a>
              <a href="https://portal.cdp.coinbase.com/products/faucet" target="_blank" rel="noopener noreferrer"
                className="text-[8px] text-accent hover:underline block font-[family-name:var(--font-mono)]">Get ETH (Coinbase Faucet)</a>
            </div>
          )}
        </>
      )}

      {wallet && (
        <div>
          <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1">Session</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface rounded p-2">
              <span className="text-[7px] uppercase tracking-wider text-text-dim block">Budget Left</span>
              <span className="text-xs font-[family-name:var(--font-mono)] font-semibold tabular-nums">${wallet.balance.toFixed(4)}</span>
            </div>
            <div className="bg-surface rounded p-2">
              <span className="text-[7px] uppercase tracking-wider text-text-dim block">Spent</span>
              <span className="text-xs font-[family-name:var(--font-mono)] font-semibold tabular-nums">${wallet.totalSpent.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Policy</span>
        <div className="space-y-1 text-[9px] font-[family-name:var(--font-mono)]">
          <div className="flex justify-between"><span className="text-text-muted">per tx</span><span>$0.50 max</span></div>
          <div className="flex justify-between"><span className="text-text-muted">daily</span><span>$5.00 max</span></div>
          <div className="flex justify-between"><span className="text-text-muted">network</span><span>base-sepolia</span></div>
        </div>
      </div>

      <div>
        <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Budget</span>
        <div className="flex items-center gap-2">
          <input type="range" min="1" max="10" step="0.5" value={budget} onChange={e => setBudget(parseFloat(e.target.value))}
            className="flex-1 h-px bg-border appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" />
          <span className="text-[9px] font-[family-name:var(--font-mono)] tabular-nums w-6 text-right">${budget}</span>
        </div>
      </div>
      <div>
        <span className="text-[8px] font-medium uppercase tracking-widest text-text-dim block mb-1.5">Priority</span>
        <div className="grid grid-cols-2 gap-1">
          {(["cost","quality","speed","balanced"] as const).map(p => (
            <button key={p} onClick={() => setPriority(p)}
              className={`text-[8px] py-1 rounded font-[family-name:var(--font-mono)] transition-all capitalize ${
                priority === p ? "bg-white/10 text-text" : "text-text-muted hover:text-text-dim bg-surface"
              }`}>{p}</button>
          ))}
        </div>
      </div>

      <button onClick={onReset} className="w-full py-1.5 rounded bg-surface text-[9px] text-text-muted hover:text-text-secondary transition-colors font-[family-name:var(--font-mono)]">Reset session</button>
    </div>
  );
}
