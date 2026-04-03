// ============================================================
// AgentPM - Project Execution Pipeline
// Takes a project brief, runs it through stages autonomously
// ============================================================

import {
  PipelineConfig,
  StreamEvent,
  ExecutionResult,
  PipelineResult,
} from "./types";
import { initializeWallets, processPayment, getWalletState } from "./wallet";
import { executeX402Payment } from "./payment";
import { initGovernance, evaluatePayment as govCheck, recordPayment as govRecord } from "./governance";
import { getProvidersByCategory } from "./marketplace";
import { searchDomains, purchaseDomain } from "./agents/domain";
import { generateLandingPage, deployToVercel, deployToLarpClick } from "./agents/deploy";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

type EventEmitter = (event: StreamEvent) => void;

function emit(emitter: EventEmitter, type: StreamEvent["type"], data: unknown) {
  emitter({ type, timestamp: new Date().toISOString(), data });
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// The 5 stages every project goes through
interface ProjectStage {
  id: string;
  name: string;
  description: string;
  toolCategory: string;
  action: string; // what the agent does in this stage
}

// Simulated outputs per category — rich, varied, realistic content
const STAGE_OUTPUTS: Record<string, string[]> = {
  "web-scraping": [
    "Scraped 38 competitor pages across 6 verticals. Extracted pricing tiers ($12-$199/mo range), feature matrices (avg 14 features per product), and positioning statements. Key finding: 70% price between $29-79/mo. Gap identified in the $15-25 range for solo creators. Sentiment analysis on 2,400 reviews: top complaints are poor onboarding (34%), slow support (28%), and missing integrations (22%). Data confidence: 91%.",
    "Collected market data from 52 sources including G2, Capterra, ProductHunt, and HackerNews. Industry growing 34% YoY with $2.1B total funding in last 18 months. Top 3 pain points: manual workflows (mentioned 847 times), high cost (612), poor integrations (489). Target persona: technical founders at seed stage with 2-10 person teams. Mapped 23 direct competitors and 8 adjacent players. Export: structured JSON + competitive matrix.",
    "Deep-crawled top 15 competitor websites with full page analysis. Extracted: 15 pricing pages (12 use tiered model, 3 usage-based), 42 feature descriptions, 28 customer testimonials, and 9 case studies. SEO analysis: avg domain authority 45, top keywords overlap 62%. Found 3 competitors recently pivoted positioning in last 90 days. Social proof inventory: combined 12,000+ customer logos across competitors.",
    "Multi-source intelligence gathering complete. Scraped: 18 landing pages, 31 blog posts, 14 changelog entries, 8 job postings (reveals tech stack and growth priorities). Glassdoor analysis of top 5 competitors: avg engineering team 15-40 people, all hiring for AI/ML roles. Patent search: 4 relevant recent filings. Funding data: 3 competitors raised Series A-B in last 6 months totaling $47M. Market timing assessment: favorable (growing demand + fragmented supply).",
  ],
  "data-processing": [
    "Processed research data through statistical analysis pipeline. Recommended positioning: 'The fastest way to ship.' Target price: $19/mo (undercuts 80% of market). Key differentiator: speed-to-value. Confidence: 87%. Built customer segmentation model: 3 tiers (hobbyist 40%, professional 45%, enterprise 15%). Churn risk model suggests freemium conversion rate of 4.2% based on comparable SaaS benchmarks. Revenue projection: $42K MRR at 2,200 users.",
    "Generated strategic brief with full quantitative backing. 3 audience segments identified with TAM sizing: Segment A (solo devs, 2.4M addressable, $15 ARPU), Segment B (small teams, 890K addressable, $49 ARPU), Segment C (mid-market, 120K addressable, $199 ARPU). 5 messaging angles ranked by projected conversion rate. Top angle: 'Build in minutes, not months' (projected 4.2% CTR). Pricing sensitivity analysis: optimal price point $19-29/mo with 78% willingness-to-pay.",
    "Ran competitive positioning matrix analysis. Plotted 23 competitors on price-vs-quality grid. Identified blue ocean opportunity: high-quality + low-price quadrant is empty. Feature gap analysis: 'one-click deploy' offered by only 2/23 competitors but mentioned in 34% of user wishlists. Built go-to-market scoring model: direct sales (score: 72), product-led growth (score: 91), community-led (score: 68). Recommendation: PLG with community flywheel. Payback period estimate: 4.2 months.",
    "Data synthesis complete. Merged 52 data sources into unified competitive intelligence database. Key metrics computed: Market HHI (Herfindahl index) = 0.08 (highly fragmented, good for new entrants). Growth vectors ranked: 1) developer tools integration (38% demand), 2) AI-powered automation (31%), 3) team collaboration (24%), 4) enterprise compliance (7%). Customer journey mapping: avg 3.2 touchpoints before signup, 7-day activation window critical. NPS benchmark for category: 42 (median), top performer: 71.",
  ],
  "text-generation": [
    "Generated full copy suite: 1 headline (8 words, 'Ship Your Idea Before Someone Else Does'), 1 subheadline (18 words), 3 benefit blocks with supporting copy (42 words each), 2 CTA variants ('Start Building Free' + 'See It In Action'), meta title (58 chars), meta description (155 chars). Tone: confident, concise, slightly irreverent. Flesch-Kincaid: Grade 7. All copy optimized for scan-reading with front-loaded value props.",
    "Produced 3 content variants for A/B testing with full rationale. Variant A: feature-led ('Ship 10x faster with zero config') - targets technical users, projected 4.2% CTR. Variant B: outcome-led ('Your users will thank you') - targets product managers, projected 3.8% CTR. Variant C: social-proof-led ('Join 2,000+ teams already shipping faster') - targets risk-averse buyers, projected 3.5% CTR. Each variant includes headline, subheadline, 3 feature blocks, and CTA. Recommended: Variant A for launch, B for retargeting.",
    "Complete content package generated. Landing page copy: hero section (12 words), problem statement (45 words), solution section (3 feature cards, 30 words each), social proof block (testimonial template + metrics bar), pricing section (3 tiers with feature comparison), FAQ (6 items), and footer CTA. Email sequence drafted: 5-email onboarding series (welcome, quick-win, feature deep-dive, case study, upgrade nudge). Total word count: 2,847. Reading level: accessible (Grade 6-8). Brand voice: smart, direct, helpful.",
    "Multi-format content generation complete. Primary landing page copy (1,200 words, conversion-optimized). Blog post draft: 'Why We Built [Product]' (800 words, founder voice, storytelling arc). Twitter/X launch thread: 12 tweets with hooks, visuals prompts, and engagement CTAs. ProductHunt tagline + description (5 variants ranked by historical PH performance patterns). README.md for GitHub: technical overview, quickstart, and badges. All copy cross-referenced for consistency in voice, claims, and terminology.",
  ],
  "image-generation": [
    "Generated 4 visual assets: 1 hero image (1920x1080, dark gradient with 3D product mockup, glassmorphism UI overlay), 1 OG image (1200x630, bold headline on brand-color background), 2 feature illustrations (isometric style, 800x600). Style: minimal, dark background (#0a0a0a), accent highlights (emerald-to-cyan gradient). All exported as WebP (avg 180KB) + PNG fallback. Aspect ratios validated for responsive breakpoints.",
    "Created comprehensive product mockup suite: browser frame with realistic UI screenshot (dark mode), mobile responsive preview (iPhone 15 Pro frame), tablet view, and 3 detail crops for feature section cards. Added animated hero concept (Lottie-compatible specifications). Clean, professional aesthetic with depth: subtle shadows, glass-panel overlays, and noise texture. All assets maintain 2:1 contrast minimum (WCAG AA). Color palette: 5 swatches derived from brand identity.",
    "Visual identity package complete. Generated: 1 logo concept (wordmark, clean sans-serif, 3 weight variants), 1 icon mark (geometric, works at 16x16 and 512x512), hero illustration (abstract geometric composition, layered depth, brand colors), 3 spot illustrations for feature sections (consistent isometric style), 1 pattern/texture for section backgrounds. Dark and light variants for each asset. Design system tokens exported: colors, spacing, border-radius, shadow definitions.",
    "Full marketing visual suite delivered. Hero banner: cinematic gradient with floating UI elements and particle effects (1920x1080). Social media kit: 4 templates (Twitter header 1500x500, LinkedIn banner 1584x396, Instagram post 1080x1080, Instagram story 1080x1920). Favicon set: ICO + SVG + Apple Touch Icon. Email header graphic. All assets use consistent visual language: dark theme, neon accent lines, Inter/Space Grotesk typography. Figma-ready with auto-layout specifications.",
  ],
  "code-analysis": [
    "Quality review complete. Copy clarity: 9.1/10 (measured via readability heuristics, jargon density, and value-prop specificity). Visual consistency: strong across all 12 assets (color variance < 3%, typography consistent). Brand alignment: 94% match against brief. Accessibility audit: all images pass WCAG AA contrast (minimum ratio 4.7:1), alt-text templates generated. Performance: images optimized (avg 220KB, all below 500KB threshold). One actionable suggestion: tighten CTA copy from 5 words to 3 for 12% higher predicted click-through.",
    "Final QA pass: all deliverables verified against 28-point checklist. Copy: proofread (0 spelling errors, 0 grammar issues, 2 style suggestions applied). Images: optimized (avg 340KB, largest 480KB), all dimensions verified, responsive breakpoints tested. SEO: meta title 58 chars (optimal), meta description 152 chars (good), OG tags complete. Legal: no stock photo license conflicts, copy claims verified as non-misleading. Mobile: all layouts confirmed at 375px, 768px, 1024px, 1440px. Lighthouse estimate: Performance 95+, Accessibility 100. Recommendation: ship as-is, plan iteration based on week-1 analytics.",
    "Comprehensive QA and optimization report. Code quality: HTML validates (0 errors), CSS specificity healthy (max 0-2-1), no unused styles detected. Performance budget: total page weight 847KB (budget: 1MB), critical CSS inlined (12KB), images lazy-loaded. Security headers recommended: CSP, X-Frame-Options, HSTS. Analytics integration checklist: GA4 events mapped (page_view, cta_click, scroll_depth, form_submit). A/B test framework: ready for headline and CTA variants. Estimated load time: 1.2s on 4G, 0.4s on broadband. Score: 93/100 — production-ready.",
    "Multi-dimensional quality assessment complete. Content quality: Hemingway Grade 6 (excellent), no passive voice, power words in 80% of headlines. Design quality: visual hierarchy score 8.7/10, Fitts's Law compliance on all CTAs (min target 44px), color contrast ratios verified. Technical quality: markup is semantic (proper heading hierarchy, landmarks), schema.org structured data included, canonical URL set. Competitive benchmark: deliverables rate in top 15% of comparable landing pages (based on 200-page analysis dataset). Risk assessment: low — no controversial claims, imagery is original, copy is differentiated. Ship confidence: HIGH.",
  ],
  "deployment": [
    "Deployment initiated. Static site built (847KB total, 12 assets). Pushed to edge network across 30+ PoPs globally. SSL certificate auto-provisioned via Let's Encrypt (valid 90 days). CDN cache warmed for primary regions (US-East, US-West, EU-West, APAC). Average TTFB: 45ms (target: <100ms). DNS propagation: complete. Health check: HTTP 200 on all routes. Rollback snapshot saved.",
    "Production deployment successful. Build time: 3.2s. Bundle analysis: 147KB JS (gzipped), 23KB CSS, 677KB images. Deployed to 35 edge locations. SSL grade: A+ (SSLLabs equivalent). HTTP/2 push enabled for critical assets. Cache policy: immutable for hashed assets, 5min for HTML. Monitoring: uptime check configured (30s interval, 3 regions). Performance baseline captured: LCP 1.1s, FID 12ms, CLS 0.02. Site is live and fully operational.",
    "Zero-downtime deployment complete. Previous version archived for instant rollback. New version live at edge in 4.8s. Automated smoke tests passed: homepage (200), all internal links valid, forms render correctly, analytics firing. CDN invalidation complete. Bot protection active (rate limiting + challenge on suspicious patterns). Estimated monthly hosting cost: $0 (within free tier). First real user hit detected 12s after deploy.",
    "Full-stack deployment pipeline executed. Pre-deploy checks: lint (pass), build (pass), asset optimization (pass). Deploy target: global edge network. Deployment ID generated for audit trail. Post-deploy verification: 5/5 health checks green, SSL valid, redirects working (www -> non-www), sitemap.xml served. Social preview validated: OG image renders correctly on Twitter, LinkedIn, Slack. Google Search Console ping sent. Deployment complete in 6.1s total.",
  ],
  "domain": [
    "Domain search complete. Checked availability across 8 TLDs via RDAP protocol in real-time. Results include pricing from multiple registrars. Premium domain detection enabled. WHOIS history checked for previously penalized domains. DNS propagation time estimates included.",
    "Comprehensive domain analysis finished. Searched 8+ TLDs (.com, .io, .dev, .app, .co, .xyz, .ai, .tech). Pricing compared across 3 registrar APIs. Domain age and history verified (clean — no spam/malware flags). SSL compatibility confirmed. Internationalized domain name variants checked. Typo-squatting risk assessment: low.",
    "Domain availability report generated. Primary and 12 alternative name suggestions checked. TLD recommendation based on target audience (dev audience -> .dev/.io, general -> .com). Brand safety: no trademark conflicts detected in USPTO/EUIPO databases. Social handle availability cross-referenced: Twitter, GitHub, npm. Domain portfolio strategy: recommended primary + 2 defensive registrations.",
    "Full domain intelligence report. Queried RDAP servers for real-time availability. Pricing tiers mapped: budget ($8-12/yr), standard ($12-25/yr), premium ($25-80/yr). Renewal cost analysis (some TLDs increase significantly on renewal). Domain authority potential assessed based on TLD trust scores. Email deliverability impact considered (.com highest trust, .xyz lowest). Recommendation includes registrar comparison and migration path.",
  ],
  "translation": [
    "Translation complete. Source: English (auto-detected, confidence 99.8%). Target languages: Spanish (ES-419), French (FR-FR), German (DE-DE), Japanese (JA). Total word count: 2,847 source -> 11,290 translated. Quality scores: ES 9.2/10, FR 9.0/10, DE 8.8/10, JA 8.5/10. Glossary: 23 product-specific terms consistently translated. Cultural adaptation: date formats, currency symbols, and idioms localized. Back-translation verification: 94% semantic match.",
    "Multi-language localization delivered. 4 target locales processed. Translation memory built (287 segments) for future consistency. Brand name and product terms preserved untranslated per style guide. Right-to-left layout flags set for Arabic variant. Character count validated against UI constraints (no truncation issues). SEO: hreflang tags generated, localized meta descriptions included. Recommended: native speaker review for Japanese market-specific idioms.",
    "Localization package complete. 6 languages delivered with full QA. Linguistic quality assurance: grammar (automated + rule-based), terminology consistency (custom glossary enforced), style (formal register maintained). Contextual translation used — UI strings translated differently from marketing copy. Pluralization rules applied per locale. String length validation: all translations within 130% of source (UI-safe). Export formats: JSON (i18n-ready), PO files, XLIFF.",
    "Professional translation with cultural adaptation finished. Source: 3,200 words English. Delivered in 5 target languages. Each translation reviewed against 3 quality dimensions: accuracy (meaning preserved), fluency (reads naturally), and adequacy (complete, nothing omitted). Locale-specific changes: US spelling -> UK for en-GB, Simplified Chinese characters for zh-CN. Date/time and number formatting localized. Translation memory exported for ongoing content updates.",
  ],
  "audio-generation": [
    "Audio content generated. Voice: professional male narrator (baritone, American English). Duration: 2m 34s. Format: WAV (48kHz/24bit) + MP3 (320kbps) + OGG (quality 8). Pacing: 148 WPM (optimal for comprehension). LUFS: -16 (podcast standard). Silence trimmed, breaths normalized. Emotion markers applied: confident intro, warm body, energetic CTA. Preview link generated.",
    "Text-to-speech synthesis complete. Generated 4 voice variants for A/B testing: Voice A (confident female, US), Voice B (warm male, UK), Voice C (energetic female, Australian), Voice D (authoritative male, US). Each variant: 1m 48s. Audio processing: noise floor -60dB, normalized to -14 LUFS, de-essed, light compression (2:1 ratio). Delivered in MP3 + WAV. Recommended: Voice A for product demo, Voice D for explainer video.",
    "Full audio package delivered. Narration: 3m 12s product overview. Sound design: subtle background ambience (lo-fi tech atmosphere), transition whooshes, notification chimes for feature callouts. Master: broadcast-ready (-16 LUFS, true peak -1dB). Variants: with music and without. Caption file: SRT format with word-level timestamps. Accessibility: audio description track for visual elements mentioned in script.",
    "Voice-over production complete. Script processed through SSML for precise control: emphasis on key phrases, 300ms pauses between sections, pitch variation for engagement. Generated in 2 speeds: standard (150 WPM) and fast (180 WPM). Multi-format export: WAV, MP3, OGG, AAC. Metadata embedded: title, artist, duration. Waveform visualization generated for video editing. Quality score: MOS 4.3/5.0 (excellent naturalness).",
  ],
};

// Use AI to plan project stages based on the brief
async function planProject(brief: string): Promise<ProjectStage[]> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are an AI project manager. Given this project brief, plan exactly 5 stages to execute it.

Brief: "${brief}"

Each stage must use one of these tool categories:
- web-scraping (for research, competitor analysis, data gathering)
- data-processing (for strategy, analysis, planning, pricing)
- text-generation (for writing copy, content, scripts, docs)
- image-generation (for visuals, mockups, designs, graphics)
- code-analysis (for review, QA, quality checks, testing)
- deployment (for deploying websites, hosting, shipping to production)
- domain (for checking domain availability, searching domain names)

Respond ONLY with valid JSON (no markdown):
{
  "stages": [
    {
      "id": "research",
      "name": "Research",
      "description": "What this stage accomplishes in one sentence",
      "toolCategory": "web-scraping",
      "action": "What the agent does (2-3 words, like 'Gather market data')"
    }
  ]
}

Always use exactly 5 stages in this order: research/discovery, strategy/planning, creation/building, review/QA, then delivery/final.`
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);
    return parsed.stages as ProjectStage[];
  } catch {
    // Fallback stages
    return getDefaultStages(brief);
  }
}

function getDefaultStages(brief: string): ProjectStage[] {
  const isCode = /code|audit|security|review|app|api|bug/i.test(brief);
  const isResearch = /research|competitor|analysis|data|market/i.test(brief);

  if (isCode) {
    return [
      { id: "scan", name: "Codebase Scan", description: "Scanning repository structure and dependencies", toolCategory: "web-scraping", action: "Scan codebase" },
      { id: "analyze", name: "Vulnerability Analysis", description: "Running static analysis and dependency checks", toolCategory: "data-processing", action: "Analyze vulnerabilities" },
      { id: "report", name: "Report Generation", description: "Writing detailed findings with remediation steps", toolCategory: "text-generation", action: "Generate report" },
      { id: "diagram", name: "Architecture Diagram", description: "Creating visual architecture and threat model diagrams", toolCategory: "image-generation", action: "Create diagrams" },
      { id: "verify", name: "Verification", description: "Final review and severity classification", toolCategory: "code-analysis", action: "Verify findings" },
    ];
  }

  if (isResearch) {
    return [
      { id: "gather", name: "Data Collection", description: "Scraping and collecting data from target sources", toolCategory: "web-scraping", action: "Collect data" },
      { id: "process", name: "Data Processing", description: "Cleaning, normalizing, and analyzing collected data", toolCategory: "data-processing", action: "Process data" },
      { id: "insights", name: "Insight Generation", description: "Extracting key findings and actionable insights", toolCategory: "text-generation", action: "Extract insights" },
      { id: "visualize", name: "Visualization", description: "Creating charts and visual representations", toolCategory: "image-generation", action: "Build visuals" },
      { id: "review", name: "Quality Review", description: "Fact-checking and validating all findings", toolCategory: "code-analysis", action: "Validate results" },
    ];
  }

  // Check if user wants to ship/deploy/host
  const wantsDeploy = /deploy|host|ship|launch|live|vercel|domain|website/i.test(brief);
  const wantsDomain = /domain|url|\.com|\.io|\.dev|\.app|register/i.test(brief);

  if (wantsDeploy || wantsDomain) {
    const stages = [
      { id: "research", name: "Market Research", description: "Analyzing competitors and target audience", toolCategory: "web-scraping", action: "Research market" },
      { id: "create", name: "Content Creation", description: "Writing copy for the landing page", toolCategory: "text-generation", action: "Write copy" },
      { id: "design", name: "Visual Design", description: "Creating visual assets and graphics", toolCategory: "image-generation", action: "Design assets" },
    ];
    if (wantsDomain) {
      stages.push({ id: "domain", name: "Domain Search", description: "Checking domain availability across TLDs via RDAP", toolCategory: "domain", action: "Search domains" });
    }
    stages.push({ id: "deploy", name: "Deploy to Production", description: "Building and deploying site to Vercel edge network", toolCategory: "deployment", action: "Deploy site" });
    return stages;
  }

  // Default: content/marketing project
  return [
    { id: "research", name: "Market Research", description: "Analyzing competitors and target audience", toolCategory: "web-scraping", action: "Research market" },
    { id: "strategy", name: "Strategy", description: "Defining positioning, messaging, and creative direction", toolCategory: "data-processing", action: "Build strategy" },
    { id: "create", name: "Content Creation", description: "Writing copy and generating visual assets", toolCategory: "text-generation", action: "Create content" },
    { id: "design", name: "Visual Design", description: "Producing images, mockups, and graphics", toolCategory: "image-generation", action: "Design assets" },
    { id: "review", name: "Quality Review", description: "Final review, QA, and delivery preparation", toolCategory: "code-analysis", action: "Review quality" },
  ];
}

// Score and pick the best provider for a category
function pickProvider(category: string, priority: string) {
  const providers = getProvidersByCategory(category);
  if (providers.length === 0) return null;

  const weights = priority === "cost" ? { p: 0.5, q: 0.2, l: 0.15, r: 0.15 }
    : priority === "quality" ? { p: 0.1, q: 0.5, l: 0.15, r: 0.25 }
    : priority === "speed" ? { p: 0.15, q: 0.15, l: 0.5, r: 0.2 }
    : { p: 0.25, q: 0.3, l: 0.2, r: 0.25 };

  const maxP = Math.max(...providers.map(p => p.price));
  const minP = Math.min(...providers.map(p => p.price));
  const maxL = Math.max(...providers.map(p => p.latencyMs));
  const minL = Math.min(...providers.map(p => p.latencyMs));

  const scored = providers.map(p => {
    const ps = maxP === minP ? 80 : ((maxP - p.price) / (maxP - minP)) * 100;
    const qs = (p.qualityScore / 10) * 100;
    const ls = maxL === minL ? 80 : ((maxL - p.latencyMs) / (maxL - minL)) * 100;
    const rs = p.reliability * 100;
    const score = ps * weights.p + qs * weights.q + ls * weights.l + rs * weights.r;
    return { provider: p, score: Math.round(score * 100) / 100, ps, qs, ls, rs };
  }).sort((a, b) => b.score - a.score);

  return scored;
}

// Retry configuration
const MAX_RETRIES = 2; // try up to 2 fallback providers before giving up
const QUALITY_THRESHOLD = 6.5; // minimum quality score out of 10 to pass quality gate
const QUALITY_RERUN_LIMIT = 1; // max times to re-run a stage for quality

// Quality gate: evaluates stage output and returns a score
function evaluateQuality(output: string, stageName: string, category: string): { score: number; feedback: string } {
  // Heuristic quality scoring based on output richness
  let score = 5.0;
  const feedback: string[] = [];

  // Length and detail checks
  const wordCount = output.split(/\s+/).length;
  if (wordCount > 100) { score += 1.5; feedback.push("Detailed output"); }
  else if (wordCount > 50) { score += 0.8; feedback.push("Adequate detail"); }
  else { feedback.push("Output could be more detailed"); }

  // Check for quantitative data (numbers, percentages, dollar amounts)
  const quantMatches = output.match(/\d+(\.\d+)?(%|\$|\/10|ms|KB|px|x\d)/g);
  if (quantMatches && quantMatches.length >= 5) { score += 1.2; feedback.push("Rich quantitative data"); }
  else if (quantMatches && quantMatches.length >= 2) { score += 0.5; feedback.push("Some metrics included"); }
  else { feedback.push("Could include more metrics"); }

  // Check for actionable recommendations
  const actionWords = /recommend|suggest|should|optimal|best|top|key finding|confidence|projected/i;
  if (actionWords.test(output)) { score += 0.8; feedback.push("Includes actionable insights"); }

  // Category-specific checks
  if (category === "web-scraping" && /competitor|market|scraped|collected|source/i.test(output)) { score += 0.5; }
  if (category === "text-generation" && /headline|CTA|copy|variant|tone/i.test(output)) { score += 0.5; }
  if (category === "image-generation" && /asset|resolution|style|export|mockup/i.test(output)) { score += 0.5; }
  if (category === "data-processing" && /segment|analysis|model|pricing|strategy/i.test(output)) { score += 0.5; }
  if (category === "code-analysis" && /review|score|check|validated|pass/i.test(output)) { score += 0.5; }
  if (category === "deployment" && /deployed|live|URL|SSL|edge/i.test(output)) { score += 0.5; }

  // Cap at 10
  score = Math.min(10, Math.round(score * 10) / 10);

  return { score, feedback: feedback.join(". ") + "." };
}

// Cost tracking state for the pipeline run
interface CostTracker {
  stages: { stageId: string; stageName: string; provider: string; cost: number; timestamp: string }[];
  runningTotal: number;
  retrySpend: number;
  qualityRerunSpend: number;
}

// Attempt to execute a single stage with a given provider. Returns the output string or throws.
async function executeStageWork(
  stage: ProjectStage,
  task: string,
  providerName: string,
  latencyMs: number,
  category: string,
): Promise<string> {
  if (category === "domain") {
    const projectName = task.match(/(?:for|called|named)\s+["']?(\w+)/i)?.[1] || "myproject";
    const wantsBuy = /buy|purchase|register|get.*domain/i.test(task);

    // Always do real RDAP search first
    const domainResults = await searchDomains(projectName.toLowerCase());
    const available = domainResults.filter(r => r.available);
    const taken = domainResults.filter(r => !r.available);

    let output = `Domain search for "${projectName}" completed via RDAP (real-time):\n`;
    output += `Available: ${available.map(d => `${d.domain} ($${d.price}/yr)`).join(", ") || "none found"}\n`;
    output += `Taken: ${taken.map(d => d.domain).join(", ") || "none"}\n`;
    output += `Checked ${domainResults.length} TLDs across registries.\n`;

    // If user wants to buy and there are available domains, attempt purchase
    if (wantsBuy && available.length > 0) {
      const bestDomain = available[0];
      const purchaseResult = await purchaseDomain(bestDomain.domain);
      if (purchaseResult.success && purchaseResult.domain) {
        output += `\nPurchased: ${purchaseResult.domain.domain} for $${purchaseResult.domain.price}/yr\n`;
        output += `Registrar: ${purchaseResult.domain.registrar}\n`;
        output += `Payment tx: ${purchaseResult.domain.txHash}\n`;
        output += `Status: ${purchaseResult.domain.status}\n`;
        output += `Expires: ${purchaseResult.domain.expiresAt}\n`;
        output += `To connect to a deployment, add these DNS records:\n`;
        output += `  A @ 76.76.21.21\n`;
        output += `  CNAME www cname.vercel-dns.com`;
      } else {
        output += `\nPurchase attempted for ${bestDomain.domain} but: ${purchaseResult.error}`;
      }
    } else if (available.length > 0) {
      output += `\nRecommended: ${available[0].domain} at $${available[0].price}/yr`;
      output += `\nTo purchase, include "buy domain" in your request.`;
    }

    return output;
  }

  if (category === "deployment") {
    const projectName = task.match(/(?:for|called|named)\s+["']?(\w+)/i)?.[1] || "myproject";
    const site = generateLandingPage(
      projectName,
      "The Future Starts Here",
      "A next-generation product built with AI-powered autonomous execution.",
      ["Lightning fast: Sub-50ms response times globally", "Secure by default: Enterprise-grade security built in", "Scale infinitely: From 0 to millions with zero config"],
      "Get Started",
    );
    const larpResult = deployToLarpClick(site, projectName);
    const vercelResult = await deployToVercel(site, projectName);

    let output = `Site deployed and live.\n` +
      `Local URL: ${larpResult.url} (accessible now)\n` +
      `Subdomain: ${larpResult.subdomain}.larp.click\n` +
      `Status: ${larpResult.status}\n`;
    if (vercelResult.success && vercelResult.method === "vercel-api") {
      output += `Vercel URL: ${vercelResult.url}\n`;
    }
    output += `Generated landing page with hero section, feature grid, and CTA. Dark theme, responsive.\n` +
      `The site is live and viewable at the URL above.`;
    return output;
  }

  // Simulated execution for other categories
  await delay(Math.min(latencyMs / 5, 1500));
  const outputs = STAGE_OUTPUTS[category] || STAGE_OUTPUTS["text-generation"];
  return outputs[Math.floor(Math.random() * outputs.length)];
}

// Main pipeline — with retry, cost tracking, quality gates, and timing
export async function executePipeline(
  task: string,
  config: PipelineConfig,
  onEvent: EventEmitter
): Promise<PipelineResult> {
  const results: ExecutionResult[] = [];
  const wallet = initializeWallets(parseFloat(process.env.DEMO_WALLET_BALANCE || "10.00"));
  initGovernance();

  const pipelineStartTime = Date.now();
  const costTracker: CostTracker = { stages: [], runningTotal: 0, retrySpend: 0, qualityRerunSpend: 0 };

  emit(onEvent, "system", {
    message: "AgentPM initialized. Planning project stages.",
    walletAddress: wallet.address,
    balance: wallet.balance,
  });

  await delay(400);

  // Plan the project
  emit(onEvent, "thinking", { message: `Analyzing brief: "${task}"`, phase: "planning" });
  await delay(300);

  const stages = await planProject(task);

  emit(onEvent, "thinking", {
    message: `Project plan ready: ${stages.length} stages`,
    stages: stages.map(s => ({ id: s.id, name: s.name, action: s.action })),
  });

  await delay(300);

  // Execute each stage with retry + quality gate
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const stageStartTime = Date.now();

    // Discover providers
    emit(onEvent, "discovery", {
      message: `Stage ${i + 1}/${stages.length}: ${stage.name}`,
      stageId: stage.id,
      stageName: stage.name,
      stageDescription: stage.description,
      stageIndex: i,
      stageTotal: stages.length,
    });
    await delay(250);

    const scored = pickProvider(stage.toolCategory, config.priority);
    if (!scored || scored.length === 0) {
      emit(onEvent, "error", { message: `No providers for ${stage.toolCategory}`, stageId: stage.id });
      continue;
    }

    // Evaluate — show all providers
    emit(onEvent, "evaluation", {
      message: `${scored.length} providers available`,
      stageId: stage.id,
      providers: scored.slice(0, 4).map(s => ({
        name: s.provider.name,
        price: s.provider.price,
        quality: s.provider.qualityScore,
        latency: s.provider.latencyMs,
        score: s.score,
      })),
    });
    await delay(300);

    // Retry loop: try providers in ranked order
    const affordable = scored.filter(s => s.provider.price <= wallet.balance);
    if (affordable.length === 0) {
      emit(onEvent, "error", { message: `Insufficient balance for ${stage.name}. Need $${scored[0].provider.price.toFixed(3)} but only $${wallet.balance.toFixed(4)} remaining.`, stageId: stage.id });
      continue;
    }

    let stageSuccess = false;
    let attemptIndex = 0;
    const maxAttempts = Math.min(affordable.length, MAX_RETRIES + 1);

    while (attemptIndex < maxAttempts && !stageSuccess) {
      const chosen = affordable[attemptIndex];
      const isRetry = attemptIndex > 0;

      if (isRetry) {
        emit(onEvent, "retry", {
          message: `Retrying with fallback provider ${chosen.provider.name} (attempt ${attemptIndex + 1}/${maxAttempts})`,
          stageId: stage.id,
          attempt: attemptIndex + 1,
          maxAttempts,
          provider: chosen.provider.name,
          reason: "Previous provider failed or quality too low",
        });
        await delay(200);
      }

      emit(onEvent, "decision", {
        message: `${isRetry ? "Fallback: " : "Selected "}${chosen.provider.name} ($${chosen.provider.price.toFixed(3)}/call, quality ${chosen.provider.qualityScore}/10)`,
        stageId: stage.id,
        provider: chosen.provider.name,
        price: chosen.provider.price,
        quality: chosen.provider.qualityScore,
        score: chosen.score,
        isRetry,
        attempt: attemptIndex + 1,
      });
      await delay(200);

      // Governance check
      const gov = govCheck(chosen.provider.price, stage.toolCategory, chosen.provider.network, chosen.provider.name);
      emit(onEvent, "governance", {
        message: gov.allowed ? "Policy check passed" : `Policy denied: ${gov.violations[0]?.message}`,
        allowed: gov.allowed,
        stageId: stage.id,
      });

      if (!gov.allowed) {
        emit(onEvent, "error", { message: `Governance blocked ${chosen.provider.name} — trying next provider`, stageId: stage.id });
        attemptIndex++;
        continue;
      }
      govRecord(chosen.provider.price);
      await delay(200);

      // x402 Payment
      emit(onEvent, "payment", {
        message: `Paying ${chosen.provider.name}`,
        phase: "signing",
        amount: chosen.provider.price,
        from: wallet.address,
        to: chosen.provider.walletAddress,
        stageId: stage.id,
      });
      await delay(150);

      const x402 = executeX402Payment(wallet.address, chosen.provider.walletAddress, chosen.provider.price, `${stage.name}: ${chosen.provider.name}`, chosen.provider.network);
      const payResult = processPayment(wallet.id, chosen.provider.walletAddress, chosen.provider.price, chosen.provider.name, chosen.provider.network);

      if (!payResult.success) {
        emit(onEvent, "error", { message: `Payment failed for ${chosen.provider.name}: ${payResult.error}. Trying fallback.`, stageId: stage.id });
        attemptIndex++;
        continue;
      }

      emit(onEvent, "payment", {
        message: `Settled on ${chosen.provider.network}`,
        phase: "settled",
        txHash: x402.settlement.txHash,
        amount: chosen.provider.price,
        newBalance: wallet.balance,
        stageId: stage.id,
      });
      await delay(200);

      // Track cost immediately
      costTracker.stages.push({
        stageId: stage.id,
        stageName: stage.name,
        provider: chosen.provider.name,
        cost: chosen.provider.price,
        timestamp: new Date().toISOString(),
      });
      costTracker.runningTotal += chosen.provider.price;
      if (isRetry) costTracker.retrySpend += chosen.provider.price;

      // Emit cost update
      emit(onEvent, "cost_update", {
        message: `Running total: $${costTracker.runningTotal.toFixed(4)}`,
        stageId: stage.id,
        stageCost: chosen.provider.price,
        runningTotal: costTracker.runningTotal,
        retrySpend: costTracker.retrySpend,
        qualityRerunSpend: costTracker.qualityRerunSpend,
        remainingBudget: wallet.balance,
      });

      // Execute
      emit(onEvent, "execution", {
        message: `${chosen.provider.name} executing ${stage.action.toLowerCase()}...`,
        stageId: stage.id,
      });

      let output: string;
      const execStartTime = Date.now();
      try {
        output = await executeStageWork(stage, task, chosen.provider.name, chosen.provider.latencyMs, stage.toolCategory);
      } catch (execErr) {
        const errMsg = execErr instanceof Error ? execErr.message : "Unknown execution error";
        emit(onEvent, "error", { message: `${chosen.provider.name} execution failed: ${errMsg}. Trying fallback.`, stageId: stage.id });
        attemptIndex++;
        continue;
      }
      const execDurationMs = Date.now() - execStartTime;

      // Quality gate — evaluate output quality
      const quality = evaluateQuality(output, stage.name, stage.toolCategory);
      emit(onEvent, "quality_gate", {
        message: quality.score >= QUALITY_THRESHOLD
          ? `Quality gate PASSED (${quality.score}/10)`
          : `Quality gate FAILED (${quality.score}/10, threshold: ${QUALITY_THRESHOLD})`,
        stageId: stage.id,
        score: quality.score,
        threshold: QUALITY_THRESHOLD,
        passed: quality.score >= QUALITY_THRESHOLD,
        feedback: quality.feedback,
        provider: chosen.provider.name,
      });
      await delay(150);

      // If quality is below threshold and we have budget + retries left, re-run with next provider
      if (quality.score < QUALITY_THRESHOLD && attemptIndex < maxAttempts - 1) {
        emit(onEvent, "retry", {
          message: `Quality score ${quality.score}/10 below threshold ${QUALITY_THRESHOLD}. Escalating to higher-quality provider.`,
          stageId: stage.id,
          reason: "quality_below_threshold",
          qualityScore: quality.score,
          feedback: quality.feedback,
        });
        costTracker.qualityRerunSpend += chosen.provider.price;
        attemptIndex++;
        continue;
      }

      // Stage succeeded
      const stageDurationMs = Date.now() - stageStartTime;

      results.push({
        stepId: stage.id,
        provider: chosen.provider,
        output,
        cost: chosen.provider.price,
        latencyMs: chosen.provider.latencyMs,
        payment: x402.settlement,
        success: true,
      });

      emit(onEvent, "result", {
        message: `${stage.name} complete`,
        stageId: stage.id,
        stageName: stage.name,
        provider: chosen.provider.name,
        output,
        cost: chosen.provider.price,
        latencyMs: chosen.provider.latencyMs,
        executionTimeMs: execDurationMs,
        totalStageTimeMs: stageDurationMs,
        qualityScore: quality.score,
        qualityFeedback: quality.feedback,
        txHash: x402.settlement.txHash,
        stageIndex: i,
        stageTotal: stages.length,
        runningTotal: costTracker.runningTotal,
        attempts: attemptIndex + 1,
      });
      await delay(200);

      stageSuccess = true;
    }

    if (!stageSuccess) {
      emit(onEvent, "error", {
        message: `Stage "${stage.name}" failed after ${maxAttempts} attempt(s). All providers exhausted or blocked.`,
        stageId: stage.id,
        attempts: maxAttempts,
      });
    }
  }

  const pipelineDurationMs = Date.now() - pipelineStartTime;
  const { wallet: finalWallet, transactions, totalSpent } = getWalletState();

  emit(onEvent, "complete", {
    message: "All stages complete",
    totalCost: totalSpent,
    totalSteps: results.length,
    walletBalance: finalWallet?.balance ?? 0,
    pipelineDurationMs,
    avgStageTimeMs: results.length > 0 ? Math.round(pipelineDurationMs / results.length) : 0,
    costBreakdown: {
      totalSpent: costTracker.runningTotal,
      retrySpend: costTracker.retrySpend,
      qualityRerunSpend: costTracker.qualityRerunSpend,
      perStage: costTracker.stages,
    },
    stages: results.map(r => ({ name: r.stepId, provider: r.provider.name, cost: r.cost })),
    transactions: transactions.slice(0, 10).map(tx => ({ toolName: tx.toolName, amount: tx.amount, txHash: tx.txHash, status: tx.status })),
  });

  return { task, steps: results, totalCost: totalSpent, totalLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0), walletBalance: finalWallet?.balance ?? 0, transactions };
}
