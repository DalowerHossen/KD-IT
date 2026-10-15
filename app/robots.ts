// path: app/robots.ts
import type { MetadataRoute } from "next";

/** Baseline crawler rules; the sitemap arrives with the SEO owning step. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
  };
}
