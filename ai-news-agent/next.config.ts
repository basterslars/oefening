import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In Docker bouwen we 'standalone' (klein image); lokaal werkt gewoon `npm start`.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
