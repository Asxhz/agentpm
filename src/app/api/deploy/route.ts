import { NextRequest } from "next/server";
import { generateLandingPage, deployToVercel, deployToLarpClick, getAllLarpClickSites } from "@/lib/agents/deploy";

export async function GET() {
  return Response.json({ sites: await getAllLarpClickSites() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action: string };

  switch (action) {
    case "generate": {
      const { projectName, headline, description, features, ctaText, brandColor } = body as {
        projectName: string; headline: string; description: string;
        features: string[]; ctaText: string; brandColor?: string;
      };
      const site = generateLandingPage(projectName, headline, description, features, ctaText, brandColor);
      return Response.json({ site, preview: site.files[0]?.content });
    }

    case "deploy-larp": {
      const { projectName, headline, description, features, ctaText, brandColor, subdomain } = body as {
        projectName: string; headline: string; description: string;
        features: string[]; ctaText: string; brandColor?: string; subdomain?: string;
      };
      const site = generateLandingPage(projectName, headline, description, features, ctaText, brandColor);
      const result = await deployToLarpClick(site, projectName, subdomain);
      return Response.json(result);
    }

    case "deploy-vercel": {
      const { projectName, headline, description, features, ctaText, brandColor, vercelToken } = body as {
        projectName: string; headline: string; description: string;
        features: string[]; ctaText: string; brandColor?: string; vercelToken?: string;
      };
      const site = generateLandingPage(projectName, headline, description, features, ctaText, brandColor);
      const result = await deployToVercel(site, projectName, vercelToken);
      return Response.json(result);
    }

    case "list": {
      return Response.json({ sites: await getAllLarpClickSites() });
    }

    default:
      return Response.json({ error: "Unknown action. Use: generate, deploy-larp, deploy-vercel, list" }, { status: 400 });
  }
}
