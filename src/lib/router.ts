// ============================================================
// AgentPay Router - AI Decision Engine
// Uses Claude to analyze tasks and select optimal providers
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  ToolProvider,
  TaskAnalysis,
  TaskStep,
  ProviderEvaluation,
  RoutingDecision,
  PipelineConfig,
  ToolCategory,
} from "./types";
import {
  getProvidersByCategory,
  getCategoryForTask,
  TOOL_PROVIDERS,
} from "./marketplace";

const anthropic = new Anthropic();

// Analyze a user task and break it into steps
export async function analyzeTask(
  task: string,
  config: PipelineConfig
): Promise<TaskAnalysis> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an AI agent router. Analyze this task and break it into executable steps.

Task: "${task}"

Available tool categories:
- image-generation: Generate images from text prompts
- text-generation: Generate and refine text content
- code-analysis: Review, analyze, and improve code
- translation: Translate text between languages
- data-processing: Process, analyze, and transform data
- web-scraping: Extract data from websites
- audio-generation: Generate speech and audio content

User priority: ${config.priority}
Budget: $${config.budget.toFixed(2)}

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "steps": [
    {
      "id": "step-1",
      "description": "Brief description of what this step does",
      "category": "one-of-the-categories-above",
      "requirements": ["specific requirement 1", "requirement 2"],
      "dependsOn": []
    }
  ],
  "complexity": "simple" | "moderate" | "complex",
  "estimatedTotalCost": 0.05,
  "estimatedTotalTime": 5000
}

Keep it to 1-4 steps. Be practical. Use only categories listed above.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    return {
      originalTask: task,
      steps: parsed.steps as TaskStep[],
      estimatedTotalCost: parsed.estimatedTotalCost,
      estimatedTotalTime: parsed.estimatedTotalTime,
      complexity: parsed.complexity,
    };
  } catch {
    // Fallback: deterministic analysis without AI
    return analyzeTaskFallback(task, config);
  }
}

// Evaluate providers for a given step
export async function evaluateProviders(
  step: TaskStep,
  config: PipelineConfig
): Promise<ProviderEvaluation[]> {
  const providers = getProvidersByCategory(step.category);
  if (providers.length === 0) return [];

  // Score each provider based on user priorities
  const weights = getWeights(config.priority);

  return providers
    .map((provider) => {
      const priceScore = scorePricePer(provider, providers);
      const qualityScore = (provider.qualityScore / 10) * 100;
      const latencyScore = scoreLatency(provider, providers);
      const reliabilityScore = provider.reliability * 100;

      const score =
        priceScore * weights.price +
        qualityScore * weights.quality +
        latencyScore * weights.latency +
        reliabilityScore * weights.reliability;

      return {
        provider,
        score: Math.round(score * 100) / 100,
        breakdown: {
          priceScore: Math.round(priceScore),
          qualityScore: Math.round(qualityScore),
          latencyScore: Math.round(latencyScore),
          reliabilityScore: Math.round(reliabilityScore),
        },
        reasoning: generateReasoning(provider, config, {
          priceScore,
          qualityScore,
          latencyScore,
          reliabilityScore,
        }),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// Select the best provider using AI reasoning
export async function selectProvider(
  step: TaskStep,
  evaluations: ProviderEvaluation[],
  config: PipelineConfig,
  remainingBudget: number
): Promise<RoutingDecision> {
  // Filter out providers that exceed remaining budget
  const affordable = evaluations.filter(
    (e) => e.provider.price <= remainingBudget
  );

  if (affordable.length === 0) {
    throw new Error(
      `No affordable providers for ${step.category}. Need at least $${evaluations[0]?.provider.price.toFixed(4)} but only $${remainingBudget.toFixed(4)} remaining.`
    );
  }

  const selected = affordable[0]; // Best scored affordable provider

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `You're an AI agent deciding which tool to pay for.

Task step: "${step.description}"
Priority: ${config.priority}
Remaining budget: $${remainingBudget.toFixed(4)}

Top option: ${selected.provider.name} ($${selected.provider.price}/call, quality: ${selected.provider.qualityScore}/10, latency: ${selected.provider.latencyMs}ms)
Score: ${selected.score}/100

In 1-2 sentences, explain why this is the best choice. Be specific about the tradeoff. Start with "Selected because..."`,
        },
      ],
    });

    const reasoning =
      response.content[0].type === "text"
        ? response.content[0].text
        : selected.reasoning;

    return {
      stepId: step.id,
      selectedProvider: selected.provider,
      alternatives: affordable.slice(1),
      reasoning,
      estimatedCost: selected.provider.price,
      confidence: selected.score / 100,
    };
  } catch {
    return {
      stepId: step.id,
      selectedProvider: selected.provider,
      alternatives: affordable.slice(1),
      reasoning: selected.reasoning,
      estimatedCost: selected.provider.price,
      confidence: selected.score / 100,
    };
  }
}

// --- Fallback (no API key) ---

function analyzeTaskFallback(
  task: string,
  config: PipelineConfig
): TaskAnalysis {
  const categories = getCategoryForTask(task);
  const steps: TaskStep[] = categories.map((cat, i) => ({
    id: `step-${i + 1}`,
    description: `Execute ${cat.replace("-", " ")} for: ${task}`,
    category: cat as ToolCategory,
    requirements: ["high-quality output"],
    dependsOn: i > 0 ? [`step-${i}`] : [],
  }));

  const providers = steps.flatMap((s) => getProvidersByCategory(s.category));
  const avgCost =
    providers.reduce((sum, p) => sum + p.price, 0) / (providers.length || 1);
  const avgTime =
    providers.reduce((sum, p) => sum + p.latencyMs, 0) /
    (providers.length || 1);

  return {
    originalTask: task,
    steps,
    estimatedTotalCost: avgCost * steps.length,
    estimatedTotalTime: avgTime * steps.length,
    complexity:
      steps.length <= 1 ? "simple" : steps.length <= 3 ? "moderate" : "complex",
  };
}

// --- Scoring Helpers ---

function getWeights(priority: string) {
  switch (priority) {
    case "cost":
      return { price: 0.5, quality: 0.2, latency: 0.15, reliability: 0.15 };
    case "quality":
      return { price: 0.1, quality: 0.5, latency: 0.15, reliability: 0.25 };
    case "speed":
      return { price: 0.15, quality: 0.15, latency: 0.5, reliability: 0.2 };
    default:
      return { price: 0.25, quality: 0.3, latency: 0.2, reliability: 0.25 };
  }
}

function scorePricePer(
  provider: ToolProvider,
  all: ToolProvider[]
): number {
  const maxPrice = Math.max(...all.map((p) => p.price));
  const minPrice = Math.min(...all.map((p) => p.price));
  if (maxPrice === minPrice) return 80;
  return ((maxPrice - provider.price) / (maxPrice - minPrice)) * 100;
}

function scoreLatency(
  provider: ToolProvider,
  all: ToolProvider[]
): number {
  const maxLat = Math.max(...all.map((p) => p.latencyMs));
  const minLat = Math.min(...all.map((p) => p.latencyMs));
  if (maxLat === minLat) return 80;
  return ((maxLat - provider.latencyMs) / (maxLat - minLat)) * 100;
}

function generateReasoning(
  provider: ToolProvider,
  config: PipelineConfig,
  scores: Record<string, number>
): string {
  const strengths: string[] = [];
  if (scores.priceScore > 70) strengths.push("cost-effective");
  if (scores.qualityScore > 80) strengths.push("high-quality");
  if (scores.latencyScore > 70) strengths.push("fast");
  if (scores.reliabilityScore > 95) strengths.push("highly reliable");

  return `${provider.name} is ${strengths.join(", ")}. At $${provider.price}/call with quality ${provider.qualityScore}/10, it ${config.priority === "cost" ? "offers the best value" : config.priority === "quality" ? "delivers top-tier results" : config.priority === "speed" ? "provides the fastest response" : "balances cost and quality well"}.`;
}
