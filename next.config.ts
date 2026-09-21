import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `output: "standalone"` is removed for Netlify — the standalone build is for
  // self-hosting/Docker and conflicts with the Netlify Next.js plugin. Netlify
  // handles SSR/API routes via its own serverless function layer.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
