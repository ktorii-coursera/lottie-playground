import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Allow importing TypeScript files from outside the web/ directory
    // (specifically lib/intent-token-converter.ts at the repo root)
    config.resolve.alias["@lib"] = path.resolve(__dirname, "..", "lib");
    return config;
  },
  // Transpile files from the shared lib directory
  transpilePackages: [],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
