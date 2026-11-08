import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [
      // Public marketing and published articles are crawlable (search and AI).
      { userAgent: "*", allow: ["/", "/a/", "/articles", "/llms.txt"], disallow: ["/orders/", "/review/", "/desk", "/account", "/auth/", "/api/", "/signin"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
