import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native package resolution used by the versioned calculation adapters.
  serverExternalPackages: ["@js-temporal/polyfill", "manseryeok"],
};

export default nextConfig;
