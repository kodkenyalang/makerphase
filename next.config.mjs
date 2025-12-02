/** @type {import('next').NextConfig} */
const nextConfig = {
  
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "@langchain/community",
      "@langchain/core",
      "faiss-node"
    ],
  },
  webpack: (config) => {
    // Required for LangChain to work in Next.js
    config.externals = [...config.externals, { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
