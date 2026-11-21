import type { MetadataRoute } from "next";

const base = () => (process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

/** The public website's pages, for search engines. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/features", "/pricing", "/about", "/contact", "/signup"];
  return pages.map((p) => ({ url: `${base()}${p}`, changeFrequency: "monthly", priority: p === "" ? 1 : 0.7 }));
}
