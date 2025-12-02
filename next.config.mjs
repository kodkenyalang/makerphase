/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    serverComponentsExternalPackages: [
      "@langchain/community",
      "@langchain/core",
      "faiss-node"
    ],
  },
  turbopack: {}, // Silence Turbopack warning, use Turbopack by default
  webpack: (config) => {
    // Required for LangChain to work in Next.js
    config.externals = [...config.externals, { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
