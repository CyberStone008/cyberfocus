import type { NextConfig } from "next";

// Use static export only when NEXT_EXPORT=1 (GitHub Pages CI builds).
// In development AND regular production builds, keep server mode so API routes work.
// (API routes with force-dynamic are incompatible with output:'export')
const isExport = process.env.NEXT_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export" } : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
