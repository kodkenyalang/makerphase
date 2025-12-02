import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Check specifically for packages that use native Node modules (fs, path, etc.)
  serverExternalPackages: [
    "pdf-parse", 
    "@langchain/community",
    "@langchain/core", 
    "faiss-node" // good to add if you upgrade to vector store later
  ],
  webpack: (config) => {
    // This allows LangChain to work in Next.js environments
    config.externals = [...config.externals, { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
