import type { MetadataRoute } from "next";

const base = () => (process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Search engines may read the public website, never the app, admin or API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/c/", "/admin", "/api/", "/companies", "/onboarding", "/invite/"] }],
    sitemap: `${base()}/sitemap.xml`,
  };
}
