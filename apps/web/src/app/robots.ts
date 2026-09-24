import type { MetadataRoute } from "next";
import { CRAWLER_DISALLOWED_PATHS } from "../lib/crawler-policy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "*", disallow: CRAWLER_DISALLOWED_PATHS },
    ],
  };
}
