import type { NextConfig } from "next";
import path from "node:path";
import { LISTING_IMAGE_REMOTE_PATTERNS } from "./src/lib/listing-images";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  images: {
    remotePatterns: LISTING_IMAGE_REMOTE_PATTERNS.map((pattern) => ({ ...pattern })),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3001"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
