import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@open-wallet-standard/core", "ethers"],
  // Keep output as default (not standalone) so /tmp works across routes
  // in the same Vercel region
};

export default nextConfig;
