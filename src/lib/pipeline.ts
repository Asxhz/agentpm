// ============================================================
// AgentPay Router - Execution Pipeline
// Orchestrates: Task Analysis → Provider Selection → Payment → Execution
// ============================================================

import {
  PipelineConfig,
  StreamEvent,
  ExecutionResult,
  PipelineResult,
  TaskStep,
  RoutingDecision,
} from "./types";
import { analyzeTask, evaluateProviders, selectProvider } from "./router";
import { initializeWallets, processPayment, getWalletState } from "./wallet";
import { executeX402Payment } from "./payment";

type EventEmitter = (event: StreamEvent) => void;

function emit(emitter: EventEmitter, type: StreamEvent["type"], data: unknown) {
  emitter({
    type,
    timestamp: new Date().toISOString(),
    data,
  });
}

// Simulate tool execution (returns mock but realistic output)
function simulateToolExecution(
  step: TaskStep,
  decision: RoutingDecision
): string {
  const provider = decision.selectedProvider;

  const outputs: Record<string, string[]> = {
    "image-generation": [
      `Generated 1024x1024 image via ${provider.name}. High-detail product shot with clean white background, professional lighting, and subtle shadow. Output format: PNG, 2.4MB. Prompt adherence score: 0.94.`,
      `Created hero banner image via ${provider.name}. Vibrant gradient background with centered product, modern typography overlay. 1920x1080, WebP format, 1.8MB.`,
    ],
    "text-generation": [
      `Generated 450-word marketing copy via ${provider.name}. Tone: professional yet approachable. Includes headline, 3 key benefit bullets, and compelling CTA. Flesch-Kincaid readability: Grade 8.`,
      `Produced executive summary via ${provider.name}. 3 paragraphs, data-driven, with actionable recommendations. Sentiment: positive-constructive.`,
    ],
    "code-analysis": [
      `Completed code review via ${provider.name}. Scanned 2,847 lines across 12 files. Found: 2 critical issues (SQL injection in auth.ts:47, XSS in render.tsx:112), 5 warnings, 8 suggestions. Security score: 7.2/10.`,
      `Static analysis complete via ${provider.name}. No critical vulnerabilities detected. 3 performance optimizations suggested. Code complexity: moderate (cyclomatic avg: 4.2).`,
    ],
    translation: [
      `Translated 1,200 words EN→ES via ${provider.name}. Quality score: 0.96 (BLEU). Preserved formatting, brand terms, and technical jargon. Review recommended for marketing claims.`,
      `Batch translation complete via ${provider.name}. 3 documents processed (EN→FR, EN→DE, EN→JA). Total: 4,500 words. Average quality: 0.93.`,
    ],
    "data-processing": [
      `Processed 50,000 rows via ${provider.name}. Generated: 3 summary tables, 2 trend charts, 1 anomaly report. Key insight: 23% MoM growth in Q1, driven by organic channel.`,
      `Data analysis complete via ${provider.name}. Correlation matrix computed for 12 variables. Top predictor: user_engagement (r=0.87). Regression model R²=0.76.`,
    ],
    "web-scraping": [
      `Scraped 45 product pages via ${provider.name}. Extracted: names, prices, ratings, descriptions. 98% success rate (1 page blocked). Data exported as structured JSON, 2.1MB.`,
      `Crawled competitor pricing data via ${provider.name}. 120 URLs processed, 89 unique products found. Price range: $12.99-$299.99. Average: $67.42.`,
    ],
    "audio-generation": [
      `Generated 2:30 audio narration via ${provider.name}. Voice: professional female, American English. Sample rate: 44.1kHz, format: MP3 320kbps. Natural prosody with 0.3s pauses between sections.`,
      `Text-to-speech complete via ${provider.name}. 850 words narrated in 4:12. Voice: warm male, British English. Emotional tone: confident and informative.`,
    ],
  };

  const categoryOutputs = outputs[step.category] || outputs["text-generation"];
  return categoryOutputs[Math.floor(Math.random() * categoryOutputs.length)];
}

// Main pipeline execution
export async function executePipeline(
  task: string,
  config: PipelineConfig,
  onEvent: EventEmitter
): Promise<PipelineResult> {
  const results: ExecutionResult[] = [];
  const wallet = initializeWallets(
    parseFloat(process.env.DEMO_WALLET_BALANCE || "10.00")
  );

  emit(onEvent, "system", {
    message: "AgentPay Router v1.0 initialized",
    walletId: wallet.id,
    walletAddress: wallet.address,
    balance: wallet.balance,
    network: "base-sepolia",
  });

  await delay(300);

  // Step 1: Analyze the task
  emit(onEvent, "thinking", {
    message: `Analyzing task: "${task}"`,
    phase: "task-analysis",
  });

  await delay(500);
  const analysis = await analyzeTask(task, config);

  emit(onEvent, "thinking", {
    message: `Task decomposed into ${analysis.steps.length} step(s)`,
    complexity: analysis.complexity,
    estimatedCost: analysis.estimatedTotalCost,
    steps: analysis.steps.map((s) => ({
      id: s.id,
      description: s.description,
      category: s.category,
    })),
  });

  await delay(400);

  let remainingBudget = config.budget;

  // Step 2: For each step, discover → evaluate → decide → pay → execute
  for (let i = 0; i < analysis.steps.length; i++) {
    const step = analysis.steps[i];

    // Discovery
    emit(onEvent, "discovery", {
      message: `Step ${i + 1}/${analysis.steps.length}: Discovering providers for ${step.category}`,
      stepId: step.id,
      category: step.category,
    });

    await delay(300);

    // Evaluate providers
    const evaluations = await evaluateProviders(step, config);

    emit(onEvent, "evaluation", {
      message: `Found ${evaluations.length} providers. Evaluating...`,
      stepId: step.id,
      providers: evaluations.map((e) => ({
        name: e.provider.name,
        price: e.provider.price,
        quality: e.provider.qualityScore,
        latency: e.provider.latencyMs,
        score: e.score,
        breakdown: e.breakdown,
      })),
      priority: config.priority,
    });

    await delay(400);

    // Select best provider
    let decision: RoutingDecision;
    try {
      decision = await selectProvider(step, evaluations, config, remainingBudget);
    } catch (err) {
      emit(onEvent, "error", {
        message: err instanceof Error ? err.message : "Provider selection failed",
        stepId: step.id,
      });
      continue;
    }

    emit(onEvent, "decision", {
      message: `Selected: ${decision.selectedProvider.name}`,
      stepId: step.id,
      provider: {
        name: decision.selectedProvider.name,
        price: decision.selectedProvider.price,
        quality: decision.selectedProvider.qualityScore,
        walletAddress: decision.selectedProvider.walletAddress,
      },
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      alternatives: decision.alternatives.slice(0, 2).map((a) => ({
        name: a.provider.name,
        price: a.provider.price,
        score: a.score,
      })),
    });

    await delay(300);

    // Execute x402 payment
    emit(onEvent, "payment", {
      message: `Initiating x402 payment: $${decision.selectedProvider.price.toFixed(4)} → ${decision.selectedProvider.name}`,
      phase: "signing",
      from: wallet.address,
      to: decision.selectedProvider.walletAddress,
      amount: decision.selectedProvider.price,
    });

    await delay(200);

    // Execute the full x402 flow
    const x402Result = executeX402Payment(
      wallet.address,
      decision.selectedProvider.walletAddress,
      decision.selectedProvider.price,
      `Payment for ${decision.selectedProvider.name}: ${step.description}`,
      decision.selectedProvider.network
    );

    // Process actual wallet deduction
    const paymentResult = processPayment(
      wallet.id,
      decision.selectedProvider.walletAddress,
      decision.selectedProvider.price,
      decision.selectedProvider.name,
      decision.selectedProvider.network
    );

    if (!paymentResult.success) {
      emit(onEvent, "error", {
        message: `Payment failed: ${paymentResult.error}`,
        stepId: step.id,
      });
      continue;
    }

    remainingBudget -= decision.selectedProvider.price;

    emit(onEvent, "payment", {
      message: `Payment confirmed on ${decision.selectedProvider.network}`,
      phase: "settled",
      txHash: x402Result.settlement.txHash,
      amount: decision.selectedProvider.price,
      newBalance: wallet.balance,
      network: decision.selectedProvider.network,
      verification: {
        isValid: x402Result.verification.isValid,
        payer: x402Result.verification.payer,
      },
    });

    await delay(200);

    // Execute the tool
    emit(onEvent, "execution", {
      message: `Executing ${decision.selectedProvider.name}...`,
      stepId: step.id,
      provider: decision.selectedProvider.name,
      estimatedLatency: decision.selectedProvider.latencyMs,
    });

    // Simulate execution time (scaled down for demo)
    await delay(Math.min(decision.selectedProvider.latencyMs / 4, 2000));

    const output = simulateToolExecution(step, decision);

    const executionResult: ExecutionResult = {
      stepId: step.id,
      provider: decision.selectedProvider,
      output,
      cost: decision.selectedProvider.price,
      latencyMs: decision.selectedProvider.latencyMs,
      payment: x402Result.settlement,
      success: true,
    };

    results.push(executionResult);

    emit(onEvent, "result", {
      message: `Step ${i + 1} complete`,
      stepId: step.id,
      provider: decision.selectedProvider.name,
      output,
      cost: decision.selectedProvider.price,
      latencyMs: decision.selectedProvider.latencyMs,
      txHash: x402Result.settlement.txHash,
    });

    await delay(200);
  }

  // Final summary
  const { wallet: finalWallet, transactions, totalSpent } = getWalletState();

  const pipelineResult: PipelineResult = {
    task,
    steps: results,
    totalCost: totalSpent,
    totalLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0),
    walletBalance: finalWallet?.balance ?? 0,
    transactions,
  };

  emit(onEvent, "complete", {
    message: "Pipeline complete",
    totalCost: pipelineResult.totalCost,
    totalSteps: results.length,
    walletBalance: pipelineResult.walletBalance,
    transactions: transactions.slice(0, 10).map((tx) => ({
      toolName: tx.toolName,
      amount: tx.amount,
      txHash: tx.txHash,
      status: tx.status,
    })),
  });

  return pipelineResult;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
