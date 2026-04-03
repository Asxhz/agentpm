// ============================================================
// AgentPay Router - Tool Marketplace
// Registry of available AI tool providers with pricing
// ============================================================

import { ToolProvider, ToolCategory_Info } from "./types";

export const TOOL_CATEGORIES: ToolCategory_Info[] = [
  {
    id: "image-generation",
    name: "Image Generation",
    description: "Generate images from text prompts",
    icon: "🎨",
  },
  {
    id: "text-generation",
    name: "Text Generation",
    description: "Generate and refine text content",
    icon: "✍️",
  },
  {
    id: "code-analysis",
    name: "Code Analysis",
    description: "Review, analyze, and improve code",
    icon: "🔍",
  },
  {
    id: "translation",
    name: "Translation",
    description: "Translate text between languages",
    icon: "🌐",
  },
  {
    id: "data-processing",
    name: "Data Processing",
    description: "Process, analyze, and transform data",
    icon: "📊",
  },
  {
    id: "web-scraping",
    name: "Web Scraping",
    description: "Extract data from websites",
    icon: "🕸️",
  },
  {
    id: "audio-generation",
    name: "Audio Generation",
    description: "Generate speech and audio content",
    icon: "🎵",
  },
  {
    id: "video-generation",
    name: "Video Generation",
    description: "Generate and edit video content",
    icon: "🎬",
  },
];

// Deterministic "random" addresses for demo
const addr = (n: number) =>
  `0x${n.toString(16).padStart(4, "0")}${"a]b1c2d3e4f5".repeat(4).slice(0, 36)}`;

export const TOOL_PROVIDERS: ToolProvider[] = [
  // --- Image Generation ---
  {
    id: "img-dalle3",
    name: "DALL·E 3",
    description: "OpenAI's latest image generation model. Photorealistic quality.",
    category: "image-generation",
    price: 0.04,
    qualityScore: 9,
    latencyMs: 8000,
    reliability: 0.97,
    walletAddress: "0x1a2B3c4D5e6F7890abCdEf1234567890aBcDeF01",
    network: "base-sepolia",
    features: ["photorealistic", "text-in-image", "1024x1024"],
    rateLimit: 50,
  },
  {
    id: "img-sdxl",
    name: "Stable Diffusion XL",
    description: "Open-source image generation. Fast and affordable.",
    category: "image-generation",
    price: 0.008,
    qualityScore: 7,
    latencyMs: 3000,
    reliability: 0.95,
    walletAddress: "0x2b3C4d5E6f7A8901BcDeF23456789aBcDeF0123a",
    network: "base-sepolia",
    features: ["fast", "customizable", "1024x1024"],
    rateLimit: 200,
  },
  {
    id: "img-midjourney",
    name: "Midjourney v6",
    description: "Best-in-class artistic image generation.",
    category: "image-generation",
    price: 0.10,
    qualityScore: 10,
    latencyMs: 12000,
    reliability: 0.93,
    walletAddress: "0x3c4D5e6F7a8B9012CdEf34567890AbCdEf01234b",
    network: "base-sepolia",
    features: ["artistic", "high-detail", "style-control"],
    rateLimit: 30,
  },
  {
    id: "img-flux",
    name: "Flux Pro",
    description: "Black Forest Labs' flagship model. Great text rendering.",
    category: "image-generation",
    price: 0.05,
    qualityScore: 9,
    latencyMs: 5000,
    reliability: 0.96,
    walletAddress: "0x4d5E6f7A8b9C0123DeF456789aBcDeF012345abc",
    network: "base-sepolia",
    features: ["text-rendering", "fast", "high-quality"],
    rateLimit: 100,
  },

  // --- Text Generation ---
  {
    id: "text-claude",
    name: "Claude Opus",
    description: "Anthropic's most capable model. Deep reasoning and analysis.",
    category: "text-generation",
    price: 0.015,
    qualityScore: 10,
    latencyMs: 2000,
    reliability: 0.99,
    walletAddress: "0x5e6F7a8B9c0D1234Ef567890AbCdEf0123456bcd",
    network: "base-sepolia",
    features: ["reasoning", "long-context", "safe"],
    rateLimit: 60,
  },
  {
    id: "text-gpt4",
    name: "GPT-4o",
    description: "OpenAI's versatile model. Great for general tasks.",
    category: "text-generation",
    price: 0.01,
    qualityScore: 9,
    latencyMs: 1500,
    reliability: 0.98,
    walletAddress: "0x6f7A8b9C0d1E2345F6789aBcDeF01234567cde01",
    network: "base-sepolia",
    features: ["multimodal", "function-calling", "fast"],
    rateLimit: 100,
  },
  {
    id: "text-gemini",
    name: "Gemini 2.5 Pro",
    description: "Google's model with large context window.",
    category: "text-generation",
    price: 0.007,
    qualityScore: 8,
    latencyMs: 1800,
    reliability: 0.96,
    walletAddress: "0x7a8B9c0D1e2F3456789AbCdEf012345678def012",
    network: "base-sepolia",
    features: ["large-context", "multimodal", "grounding"],
    rateLimit: 120,
  },
  {
    id: "text-llama",
    name: "Llama 4 Scout",
    description: "Meta's open model. Cheapest option, solid quality.",
    category: "text-generation",
    price: 0.002,
    qualityScore: 7,
    latencyMs: 800,
    reliability: 0.94,
    walletAddress: "0x8b9C0d1E2f3A456789aBcDeF0123456789ef0123",
    network: "base-sepolia",
    features: ["fast", "open-source", "efficient"],
    rateLimit: 300,
  },

  // --- Code Analysis ---
  {
    id: "code-review-pro",
    name: "CodeReview Pro",
    description: "Deep code review with security analysis and suggestions.",
    category: "code-analysis",
    price: 0.05,
    qualityScore: 9,
    latencyMs: 5000,
    reliability: 0.97,
    walletAddress: "0x9c0D1e2F3a4B56789aBcDeF01234567890f01234",
    network: "base-sepolia",
    features: ["security-scan", "suggestions", "multi-language"],
    rateLimit: 40,
  },
  {
    id: "code-security",
    name: "SecurityScan AI",
    description: "Specialized vulnerability detection. OWASP Top 10 coverage.",
    category: "code-analysis",
    price: 0.08,
    qualityScore: 10,
    latencyMs: 8000,
    reliability: 0.99,
    walletAddress: "0xa0D1e2F3a4B5C6789aBcDeF0123456789012345a",
    network: "base-sepolia",
    features: ["vulnerability-detection", "OWASP", "compliance"],
    rateLimit: 20,
  },
  {
    id: "code-style",
    name: "StyleCheck Lite",
    description: "Fast linting and style enforcement.",
    category: "code-analysis",
    price: 0.005,
    qualityScore: 6,
    latencyMs: 500,
    reliability: 0.99,
    walletAddress: "0xb1E2f3A4b5C6D789aBcDeF012345678901234567",
    network: "base-sepolia",
    features: ["fast", "configurable", "auto-fix"],
    rateLimit: 500,
  },

  // --- Translation ---
  {
    id: "trans-deepl",
    name: "DeepL Pro",
    description: "Premium neural translation. Best for European languages.",
    category: "translation",
    price: 0.02,
    qualityScore: 10,
    latencyMs: 800,
    reliability: 0.99,
    walletAddress: "0xc2F3a4B5c6D7E890aBcDeF0123456789012345ab",
    network: "base-sepolia",
    features: ["european-langs", "formal/informal", "glossary"],
    rateLimit: 100,
  },
  {
    id: "trans-google",
    name: "Google Translate AI",
    description: "Widest language coverage. 130+ languages.",
    category: "translation",
    price: 0.008,
    qualityScore: 7,
    latencyMs: 300,
    reliability: 0.98,
    walletAddress: "0xd3A4b5C6d7E8F901BcDeF01234567890123456bc",
    network: "base-sepolia",
    features: ["130-languages", "fast", "auto-detect"],
    rateLimit: 300,
  },
  {
    id: "trans-amazon",
    name: "Amazon Translate",
    description: "Solid translation with custom terminology.",
    category: "translation",
    price: 0.015,
    qualityScore: 8,
    latencyMs: 600,
    reliability: 0.97,
    walletAddress: "0xe4B5c6D7e8F9A012CdEf012345678901234567cd",
    network: "base-sepolia",
    features: ["custom-terminology", "batch", "real-time"],
    rateLimit: 150,
  },

  // --- Data Processing ---
  {
    id: "data-bigquery",
    name: "BigQuery AI",
    description: "Google's serverless data warehouse with ML integration.",
    category: "data-processing",
    price: 0.03,
    qualityScore: 9,
    latencyMs: 2000,
    reliability: 0.99,
    walletAddress: "0xf5C6d7E8f9A0B123DeF0123456789012345678de",
    network: "base-sepolia",
    features: ["SQL", "ML-integration", "petabyte-scale"],
    rateLimit: 50,
  },
  {
    id: "data-pandas-ai",
    name: "PandasAI Cloud",
    description: "Natural language data analysis. Ask questions about your data.",
    category: "data-processing",
    price: 0.01,
    qualityScore: 7,
    latencyMs: 3000,
    reliability: 0.93,
    walletAddress: "0xa6D7e8F9a0B1C234Ef01234567890123456789ef",
    network: "base-sepolia",
    features: ["natural-language", "visualization", "python"],
    rateLimit: 80,
  },

  // --- Web Scraping ---
  {
    id: "scrape-apify",
    name: "Apify",
    description: "Full-featured web scraping and automation platform.",
    category: "web-scraping",
    price: 0.025,
    qualityScore: 9,
    latencyMs: 10000,
    reliability: 0.95,
    walletAddress: "0xb7E8f9A0b1C2D345F012345678901234567890ab",
    network: "base-sepolia",
    features: ["javascript-rendering", "proxy-rotation", "scheduling"],
    rateLimit: 30,
  },
  {
    id: "scrape-brightdata",
    name: "Bright Data",
    description: "Enterprise web data collection. Massive proxy network.",
    category: "web-scraping",
    price: 0.05,
    qualityScore: 10,
    latencyMs: 6000,
    reliability: 0.98,
    walletAddress: "0xc8F9a0B1c2D3E456012345678901234567890bcd",
    network: "base-sepolia",
    features: ["enterprise", "residential-proxies", "unblocking"],
    rateLimit: 60,
  },
  {
    id: "scrape-firecrawl",
    name: "Firecrawl",
    description: "LLM-optimized web scraping. Clean markdown output.",
    category: "web-scraping",
    price: 0.01,
    qualityScore: 8,
    latencyMs: 4000,
    reliability: 0.94,
    walletAddress: "0xd9A0b1C2d3E4F567123456789012345678901cde",
    network: "base-sepolia",
    features: ["markdown-output", "LLM-ready", "fast"],
    rateLimit: 100,
  },

  // --- Audio Generation ---
  {
    id: "audio-elevenlabs",
    name: "ElevenLabs",
    description: "Ultra-realistic text-to-speech. Voice cloning.",
    category: "audio-generation",
    price: 0.03,
    qualityScore: 10,
    latencyMs: 2000,
    reliability: 0.97,
    walletAddress: "0xeA0b1C2d3E4F5678234567890123456789012def",
    network: "base-sepolia",
    features: ["voice-cloning", "29-languages", "emotional"],
    rateLimit: 60,
  },
  {
    id: "audio-openai-tts",
    name: "OpenAI TTS",
    description: "Solid text-to-speech. Multiple voices.",
    category: "audio-generation",
    price: 0.015,
    qualityScore: 8,
    latencyMs: 1500,
    reliability: 0.98,
    walletAddress: "0xfB1c2D3e4F5A6789345678901234567890123ef0",
    network: "base-sepolia",
    features: ["6-voices", "fast", "streaming"],
    rateLimit: 100,
  },
];

export function getProvidersByCategory(category: string): ToolProvider[] {
  return TOOL_PROVIDERS.filter((p) => p.category === category);
}

export function getProviderById(id: string): ToolProvider | undefined {
  return TOOL_PROVIDERS.find((p) => p.id === id);
}

export function searchProviders(query: string): ToolProvider[] {
  const q = query.toLowerCase();
  return TOOL_PROVIDERS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.includes(q) ||
      p.features.some((f) => f.toLowerCase().includes(q))
  );
}

export function getCategoryForTask(task: string): string[] {
  const t = task.toLowerCase();
  const categories: string[] = [];

  if (t.match(/image|picture|photo|visual|illustration|logo|banner|thumbnail/))
    categories.push("image-generation");
  if (t.match(/write|text|content|blog|article|copy|description|email|summary/))
    categories.push("text-generation");
  if (t.match(/code|review|bug|security|lint|refactor|analyze.*code/))
    categories.push("code-analysis");
  if (t.match(/translat|localize|language|spanish|french|german|chinese|japanese/))
    categories.push("translation");
  if (t.match(/data|analy|chart|statistics|csv|spreadsheet|sql|query/))
    categories.push("data-processing");
  if (t.match(/scrape|crawl|extract|website|web.*data|competitor/))
    categories.push("web-scraping");
  if (t.match(/audio|speech|voice|tts|narrat|podcast/))
    categories.push("audio-generation");
  if (t.match(/video|animate|clip|footage/))
    categories.push("video-generation");

  // Default to text-generation if nothing matched
  if (categories.length === 0) categories.push("text-generation");

  return categories;
}
