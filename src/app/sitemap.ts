import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://plazen.org";

  const routes = [
    // Public marketing + auth
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/login`, changeFrequency: "weekly", priority: 0.6 },

    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/license`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy_policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/tos`, changeFrequency: "yearly", priority: 0.3 },

    { url: `${base}/account`, changeFrequency: "weekly", priority: 0.6 },

    { url: `${base}/documentation`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/release-notes`, changeFrequency: "weekly", priority: 0.7 },

    { url: `${base}/support`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/support/new`, changeFrequency: "weekly", priority: 0.5 },
  ] as const;

  const lastModified = new Date();

  return routes.map((r) => ({
    url: r.url,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
