import { NextRequest, NextResponse } from "next/server";

// Middleware to handle wildcard subdomain routing for larp.click
// Rewrites brewbox.larp.click -> /site/brewbox internally
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";

  // Check if this is a subdomain of larp.click
  const larpMatch = hostname.match(/^([a-z0-9-]+)\.larp\.click$/i);

  if (larpMatch) {
    const subdomain = larpMatch[1].toLowerCase();

    // Don't rewrite for the main app subdomain (agentpm.larp.click serves the app)
    if (subdomain === "agentpm" || subdomain === "www") {
      return NextResponse.next();
    }

    // Rewrite to the /site/[subdomain] route which serves the generated HTML
    const url = request.nextUrl.clone();
    url.pathname = `/site/${subdomain}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on non-API, non-static routes
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
