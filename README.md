# AgentPay Router

**The operating system for AI agents that spend money.**

> Built for the [Open Wallet Standard Hackathon](https://hackathon.openwallet.sh/) — April 2026
>
> Covers **all 5 hackathon tracks** in a single unified platform.

---

## What is this?

AgentPay Router is infrastructure for the agent economy. When an AI agent needs to accomplish a task, it:

1. **Discovers** available tool providers in the marketplace (21 providers, 8 categories)
2. **Evaluates** each on price, quality, latency, and reliability
3. **Decides** which to use based on budget constraints and priorities
4. **Pays** via x402 protocol using an OWS wallet on Base Sepolia
5. **Executes** the tool and returns structured results

Every step is logged. Every payment is traceable. Every decision is explainable.

---

## Hackathon Tracks

### Track 1 — Agent Commerce & Autonomous Businesses
Full commerce loop: AI agent receives a task, decomposes it into steps, discovers tool providers, evaluates them, pays via x402, and executes. Multi-step tasks like "Create a marketing campaign" trigger 3+ payments across different providers.

### Track 2 — Spend Governance & Identity
Policy engine enforces spending limits, chain restrictions, rate limiting, and approval gates. Run the governance demo to see 6 payment scenarios evaluated against active policies — some approved, some denied, some flagged for human approval.

### Track 3 — Pay-Per-Call Services & API Monetization
Interactive visualization of the full x402 protocol flow: client request → 402 response → EIP-712 signing via OWS wallet → payment retry → on-chain settlement → API response. No API keys, no subscriptions — just a wallet.

### Track 4 — Multi-Agent Systems & Autonomous Economies
6 specialist agents (Orchestrator, Writer, Designer, Translator, Analyst, Auditor) with individual OWS wallets trade services. The orchestrator decomposes tasks and pays each specialist via x402. Watch money flow through the agent economy in real-time.

### Track 5 — Creative / Unhinged
Agent Stock Exchange concept: AI agents trade computational services like stocks, with dynamic pricing based on demand, agent IPOs, and flash auctions for limited compute slots.

---

## Tech Stack

- **Frontend**: Next.js 15 + Tailwind CSS v4
- **AI Engine**: Claude (Anthropic API) — task analysis and provider selection
- **Wallet**: Open Wallet Standard (OWS) — multi-chain agent wallets
- **Payments**: x402 protocol — HTTP-native micropayments
- **Network**: Base Sepolia (testnet USDC)

## Quick Start

```bash
git clone <repo-url>
cd agentpay-router
npm install

# Add your API key
cp .env.example .env.local
# Edit .env.local: ANTHROPIC_API_KEY=sk-ant-...

npm run dev
```

Open **http://localhost:3003**

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent` | POST | Main agent pipeline (SSE streaming) |
| `/api/multiagent` | POST | Multi-agent economy simulation (SSE) |
| `/api/governance` | GET/POST | Policy engine & audit logs |
| `/api/wallet` | GET/POST | Wallet state & reset |
| `/api/marketplace` | GET | Tool provider registry |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  AgentPay Router                  │
├──────────┬──────────┬──────────┬────────────────┤
│  Claude  │  OWS     │  x402    │  Marketplace   │
│  Engine  │  Wallet  │  Payment │  (21 tools)    │
├──────────┴──────────┴──────────┴────────────────┤
│            Governance / Policy Engine            │
├─────────────────────────────────────────────────┤
│         Multi-Agent Economy Simulation           │
└─────────────────────────────────────────────────┘
```

## Marketplace

21 tool providers across 8 categories:

| Category | Providers | Price Range |
|----------|-----------|-------------|
| Image Generation | DALL·E 3, SDXL, Midjourney v6, Flux Pro | $0.008 - $0.10 |
| Text Generation | Claude Opus, GPT-4o, Gemini 2.5, Llama 4 | $0.002 - $0.015 |
| Code Analysis | CodeReview Pro, SecurityScan AI, StyleCheck | $0.005 - $0.08 |
| Translation | DeepL Pro, Google Translate, Amazon Translate | $0.008 - $0.02 |
| Data Processing | BigQuery AI, PandasAI Cloud | $0.01 - $0.03 |
| Web Scraping | Apify, Bright Data, Firecrawl | $0.01 - $0.05 |
| Audio Generation | ElevenLabs, OpenAI TTS | $0.015 - $0.03 |

## License

MIT
