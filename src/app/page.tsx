"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { StreamEvent } from "@/lib/types";

// ============================================================
// MAIN PAGE - AgentPay Router Dashboard
// ============================================================

interface WalletState {
  id: string;
  name: string;
  address: string;
  balance: number;
  accounts: { chainId: string; address: string }[];
}

interface TransactionInfo {
  toolName: string;
  amount: number;
  txHash: string;
  status: string;
}

const EXAMPLE_TASKS = [
  {
    label: "Marketing Campaign",
    task: "Create a complete marketing campaign for a new SaaS product launch, including product copy, hero image, and Spanish translation",
    icon: "📣",
  },
  {
    label: "Code Security Audit",
    task: "Perform a comprehensive security audit on my Node.js REST API codebase",
    icon: "🔒",
  },
  {
    label: "Competitor Research",
    task: "Scrape competitor pricing data and generate a comparison analysis report",
    icon: "🕵️",
  },
  {
    label: "Product Image",
    task: "Generate a professional product image for my ecommerce store listing",
    icon: "🎨",
  },
  {
    label: "Podcast Episode",
    task: "Write a script for a 5-minute podcast episode about AI agents, then generate the audio narration",
    icon: "🎙️",
  },
  {
    label: "Data Analysis",
    task: "Analyze quarterly sales data, identify trends, and generate an executive summary with key insights",
    icon: "📊",
  },
];

type Priority = "cost" | "quality" | "speed" | "balanced";

export default function Home() {
  const [task, setTask] = useState("");
  const [budget, setBudget] = useState(5.0);
  const [priority, setPriority] = useState<Priority>("balanced");
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [transactions, setTransactions] = useState<TransactionInfo[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Initialize wallet
  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((data) => {
        if (data.wallet) setWallet(data.wallet);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const resetWallet = useCallback(async () => {
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", balance: 10.0 }),
    });
    const data = await res.json();
    if (data.wallet) setWallet(data.wallet);
    setTransactions([]);
    setEvents([]);
  }, []);

  const runAgent = useCallback(async () => {
    if (!task.trim() || isRunning) return;

    setIsRunning(true);
    setEvents([]);
    setTransactions([]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, budget, priority }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const event: StreamEvent = JSON.parse(data);
              setEvents((prev) => [...prev, event]);

              // Update wallet balance from events
              const eventData = event.data as Record<string, unknown>;
              if (eventData?.newBalance !== undefined) {
                setWallet((w) =>
                  w ? { ...w, balance: eventData.newBalance as number } : w
                );
              }
              if (eventData?.balance !== undefined && event.type === "system") {
                setWallet((w) =>
                  w ? { ...w, balance: eventData.balance as number } : w
                );
              }

              // Collect transactions from complete event
              if (
                event.type === "complete" &&
                eventData?.transactions
              ) {
                setTransactions(
                  eventData.transactions as TransactionInfo[]
                );
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setEvents((prev) => [
        ...prev,
        {
          type: "error" as const,
          timestamp: new Date().toISOString(),
          data: {
            message:
              err instanceof Error ? err.message : "Connection failed",
          },
        },
      ]);
    } finally {
      setIsRunning(false);
      // Refresh wallet
      fetch("/api/wallet")
        .then((r) => r.json())
        .then((data) => {
          if (data.wallet) setWallet(data.wallet);
          if (data.transactions) {
            setTransactions(
              data.transactions.map(
                (tx: { toolName: string; amount: number; txHash: string; status: string }) => ({
                  toolName: tx.toolName,
                  amount: tx.amount,
                  txHash: tx.txHash,
                  status: tx.status,
                })
              )
            );
          }
        })
        .catch(() => {});
    }
  }, [task, budget, priority, isRunning]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between bg-surface/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <span className="text-accent font-bold font-[family-name:var(--font-mono)] text-sm">
              AP
            </span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              AgentPay Router
            </h1>
            <p className="text-xs text-text-muted">
              AI Agent Commerce OS — Open Wallet Standard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-[family-name:var(--font-mono)]">
          <span className="text-text-muted">
            network:{" "}
            <span className="text-cyan">base-sepolia</span>
          </span>
          <span className="text-text-muted">
            protocol: <span className="text-blue">x402</span>
          </span>
          <span className="text-text-muted">
            wallet: <span className="text-accent">OWS</span>
          </span>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Left Sidebar - Wallet & Marketplace */}
        <aside className="w-80 border-r border-border bg-surface/30 flex flex-col overflow-hidden shrink-0">
          {/* Wallet Panel */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-dim">
                Agent Wallet
              </h2>
              <button
                onClick={resetWallet}
                className="text-[10px] text-text-muted hover:text-text px-2 py-0.5 rounded border border-border hover:border-border-bright transition-colors"
              >
                Reset
              </button>
            </div>
            {wallet ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-accent">
                    ${wallet.balance.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-text-muted">USDC</span>
                </div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] text-text-muted bg-surface-2 rounded px-2 py-1.5 break-all">
                  {wallet.address}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {wallet.accounts?.map((acc) => (
                    <span
                      key={acc.chainId}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted border border-border"
                    >
                      {acc.chainId.split(":")[0]}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-muted">Loading wallet...</div>
            )}
          </div>

          {/* Transaction History */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-dim mb-3">
              Transactions
            </h2>
            {transactions.length === 0 ? (
              <p className="text-xs text-text-muted italic">
                No transactions yet
              </p>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx, i) => (
                  <div
                    key={i}
                    className="bg-surface-2 rounded-lg p-2.5 border border-border animate-slide-in"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate mr-2">
                        {tx.toolName}
                      </span>
                      <span className="text-xs font-[family-name:var(--font-mono)] text-red shrink-0">
                        -${tx.amount.toFixed(4)}
                      </span>
                    </div>
                    <div className="font-[family-name:var(--font-mono)] text-[9px] text-text-muted truncate">
                      {tx.txHash}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tx.status === "confirmed"
                            ? "bg-accent"
                            : tx.status === "pending"
                              ? "bg-amber animate-pulse-dot"
                              : "bg-red"
                        }`}
                      />
                      <span className="text-[9px] text-text-muted">
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Task Input */}
          <div className="p-4 border-b border-border bg-surface/30">
            {/* Example tasks */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {EXAMPLE_TASKS.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => setTask(ex.task)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-accent/50 hover:bg-accent/5 text-text-dim hover:text-text transition-all"
                >
                  {ex.icon} {ex.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      runAgent();
                    }
                  }}
                  placeholder="Describe a task for the agent to execute..."
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm resize-none h-[72px] focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 placeholder:text-text-muted font-[family-name:var(--font-mono)]"
                  disabled={isRunning}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={runAgent}
                  disabled={isRunning || !task.trim()}
                  className="px-5 py-2 rounded-lg bg-accent text-black font-semibold text-sm hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all glow-green"
                >
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Running
                    </span>
                  ) : (
                    "Run Agent"
                  )}
                </button>
                <div className="flex gap-1">
                  {(
                    ["cost", "quality", "speed", "balanced"] as Priority[]
                  ).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-all capitalize ${
                        priority === p
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-text-muted hover:border-border-bright"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Budget slider */}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] text-text-muted w-12">
                Budget:
              </span>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-surface-3 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs font-[family-name:var(--font-mono)] text-accent w-16 text-right">
                ${budget.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Agent Log */}
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-4 font-[family-name:var(--font-mono)] text-xs space-y-1"
          >
            {events.length === 0 && !isRunning && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div className="text-4xl mb-4 opacity-20">⚡</div>
                  <h3 className="text-lg font-semibold text-text-dim mb-2 font-[family-name:var(--font-sans)]">
                    The Agent Commerce OS
                  </h3>
                  <p className="text-text-muted text-xs leading-relaxed font-[family-name:var(--font-sans)]">
                    Submit a task above. The AI agent will discover tools,
                    evaluate providers, negotiate prices, and execute
                    payments — all autonomously via the Open Wallet
                    Standard and x402 protocol.
                  </p>
                </div>
              </div>
            )}

            {events.map((event, i) => (
              <EventLine key={i} event={event} index={i} />
            ))}

            {isRunning && (
              <div className="flex items-center gap-2 text-text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                <span className="cursor-blink">Processing</span>
              </div>
            )}
          </div>
        </main>

        {/* Right Panel - Results */}
        <aside className="w-96 border-l border-border bg-surface/30 flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-dim">
              Execution Results
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ResultsPanel events={events} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============================================================
// EVENT LINE COMPONENT
// ============================================================

function EventLine({ event, index }: { event: StreamEvent; index: number }) {
  const data = event.data as Record<string, unknown>;
  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const typeColors: Record<string, string> = {
    system: "text-blue",
    thinking: "text-purple",
    discovery: "text-cyan",
    evaluation: "text-amber",
    decision: "text-accent",
    payment: "text-amber",
    execution: "text-blue",
    result: "text-accent",
    error: "text-red",
    complete: "text-accent",
  };

  const typeIcons: Record<string, string> = {
    system: "SYS",
    thinking: "THK",
    discovery: "DSC",
    evaluation: "EVL",
    decision: "DEC",
    payment: "PAY",
    execution: "EXE",
    result: "RES",
    error: "ERR",
    complete: "DON",
  };

  return (
    <div
      className="animate-slide-in flex gap-2 py-0.5 hover:bg-surface-2/50 px-1 rounded"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <span className="text-text-muted shrink-0 w-16">{time}</span>
      <span
        className={`shrink-0 w-8 font-bold ${typeColors[event.type] || "text-text-dim"}`}
      >
        {typeIcons[event.type] || "???"}
      </span>
      <span className="flex-1 break-words">
        <span className="text-text-dim">
          {(data?.message as string) || ""}
        </span>
        {event.type === "evaluation" && data?.providers && (
          <ProviderTable
            providers={
              data.providers as {
                name: string;
                price: number;
                quality: number;
                latency: number;
                score: number;
              }[]
            }
          />
        )}
        {event.type === "decision" && data?.reasoning && (
          <div className="mt-1 text-accent/80 italic">
            {data.reasoning as string}
          </div>
        )}
        {event.type === "payment" &&
          (data?.phase as string) === "settled" && (
            <div className="mt-1">
              <span className="text-accent">✓ Settled</span>{" "}
              <span className="text-text-muted">
                tx:{" "}
                {(data.txHash as string)?.slice(0, 18)}...
              </span>
            </div>
          )}
        {event.type === "complete" && (
          <div className="mt-1 p-2 bg-accent/5 border border-accent/20 rounded">
            <span className="text-accent font-bold">Pipeline Complete</span>
            {" — "}
            <span>
              {data.totalSteps as number} steps, $
              {(data.totalCost as number)?.toFixed(4)} spent
            </span>
            {" — "}
            <span>
              Balance: $
              {(data.walletBalance as number)?.toFixed(4)}
            </span>
          </div>
        )}
      </span>
    </div>
  );
}

// ============================================================
// PROVIDER TABLE
// ============================================================

function ProviderTable({
  providers,
}: {
  providers: {
    name: string;
    price: number;
    quality: number;
    latency: number;
    score: number;
  }[];
}) {
  return (
    <div className="mt-1.5 mb-1 bg-surface-2 rounded border border-border overflow-hidden">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th className="text-left px-2 py-1">Provider</th>
            <th className="text-right px-2 py-1">Price</th>
            <th className="text-right px-2 py-1">Quality</th>
            <th className="text-right px-2 py-1">Latency</th>
            <th className="text-right px-2 py-1">Score</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p, i) => (
            <tr
              key={p.name}
              className={`border-b border-border/50 ${i === 0 ? "bg-accent/5" : ""}`}
            >
              <td className="px-2 py-1 text-text">
                {i === 0 && (
                  <span className="text-accent mr-1">▸</span>
                )}
                {p.name}
              </td>
              <td className="text-right px-2 py-1 text-amber">
                ${p.price.toFixed(3)}
              </td>
              <td className="text-right px-2 py-1">
                {p.quality}/10
              </td>
              <td className="text-right px-2 py-1 text-text-dim">
                {p.latency}ms
              </td>
              <td className="text-right px-2 py-1 font-bold text-accent">
                {p.score.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// RESULTS PANEL
// ============================================================

function ResultsPanel({ events }: { events: StreamEvent[] }) {
  const results = events.filter((e) => e.type === "result");
  const complete = events.find((e) => e.type === "complete");
  const decisions = events.filter((e) => e.type === "decision");
  const payments = events.filter(
    (e) =>
      e.type === "payment" &&
      (e.data as Record<string, unknown>)?.phase === "settled"
  );

  if (results.length === 0 && !complete) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-text-muted italic text-center">
          Results will appear here after the agent executes tasks.
        </p>
      </div>
    );
  }

  const completeData = complete?.data as Record<string, unknown>;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {complete && (
        <div className="bg-surface-2 rounded-lg border border-accent/30 p-4 glow-green">
          <h3 className="text-sm font-semibold text-accent mb-3">
            Execution Summary
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-text-muted uppercase">
                Total Cost
              </p>
              <p className="text-lg font-[family-name:var(--font-mono)] font-bold text-amber">
                ${(completeData?.totalCost as number)?.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">
                Steps
              </p>
              <p className="text-lg font-[family-name:var(--font-mono)] font-bold">
                {completeData?.totalSteps as number}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">
                Remaining
              </p>
              <p className="text-lg font-[family-name:var(--font-mono)] font-bold text-accent">
                ${(completeData?.walletBalance as number)?.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase">
                Payments
              </p>
              <p className="text-lg font-[family-name:var(--font-mono)] font-bold text-blue">
                {payments.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step Results */}
      {results.map((event, i) => {
        const data = event.data as Record<string, unknown>;
        const decision = decisions[i]?.data as Record<string, unknown>;
        return (
          <div
            key={i}
            className="bg-surface-2 rounded-lg border border-border p-3 animate-slide-in"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">
                  {data?.provider as string}
                </span>
              </div>
              <span className="text-xs font-[family-name:var(--font-mono)] text-amber">
                -${(data?.cost as number)?.toFixed(4)}
              </span>
            </div>

            {decision?.reasoning && (
              <p className="text-[11px] text-purple italic mb-2">
                {decision.reasoning as string}
              </p>
            )}

            <div className="bg-surface-3 rounded p-2.5 text-[11px] text-text-dim leading-relaxed">
              {data?.output as string}
            </div>

            <div className="flex items-center justify-between mt-2 text-[9px] text-text-muted font-[family-name:var(--font-mono)]">
              <span>
                latency: {data?.latencyMs as number}ms
              </span>
              <span className="truncate max-w-[200px]">
                tx: {(data?.txHash as string)?.slice(0, 22)}...
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
