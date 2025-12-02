/** @type {import('next').NextConfig} */
const nextConfig = {
  // In Next.js 15/16, this is a top-level property. 
  // If you are accidentally on Next.js 14, move this array to: 
  // experimental: { serverComponentsExternalPackages: [...] }
  serverExternalPackages: [
    "pdf-parse",
    "@langchain/community",
    "@langchain/core",
    "faiss-node"
  ],
  webpack: (config) => {
    // Required for LangChain to work in Next.js
    config.externals = [...config.externals, { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
```[[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQGLm9w6ahcwgAGFN4gYi-B9f6J_qDzN1zX2kH1nAKqon3D6ECNWbL7BcKB9r86acOYn_kTTZlb8F8KCnEjItGslGeEUItje7W4dn0cJLOSrjnVKtKSMkU9WOK_68jv0Kf-kbWWa55UwRELgsv99YFvBLZmzzIlO0aZiRg%3D%3D)]
