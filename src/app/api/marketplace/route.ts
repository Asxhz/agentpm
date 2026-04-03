// ============================================================
// GET /api/marketplace - Tool Provider Marketplace
// Returns all available tools and categories
// ============================================================

import { TOOL_PROVIDERS, TOOL_CATEGORIES } from "@/lib/marketplace";

export async function GET() {
  return Response.json({
    categories: TOOL_CATEGORIES,
    providers: TOOL_PROVIDERS,
    stats: {
      totalProviders: TOOL_PROVIDERS.length,
      totalCategories: TOOL_CATEGORIES.length,
      priceRange: {
        min: Math.min(...TOOL_PROVIDERS.map((p) => p.price)),
        max: Math.max(...TOOL_PROVIDERS.map((p) => p.price)),
        avg:
          TOOL_PROVIDERS.reduce((s, p) => s + p.price, 0) /
          TOOL_PROVIDERS.length,
      },
    },
  });
}
