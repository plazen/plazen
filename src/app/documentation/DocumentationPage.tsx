// src/app/documentation/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PlazenLogo } from "@/components/plazen-logo";
import Link from "next/link";
import LoadingSpinner from "@/app/components/LoadingSpinner";

type DocEntry = {
  id: string;
  topic: string;
  text: string;
  category: string | null;
  updated_at: string;
};

export default function DocumentationPage() {
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const res = await fetch("/api/documentation");
        if (res.ok) {
          const data = await res.json();
          setEntries(data);
        }
      } catch (error) {
        console.error("Failed to fetch documentation", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEntries();
  }, []);

  return (
    <div className="font-lexend">
      <style>
        {`
          /* Hover note heading uses the primary color variable */
          .note-item:hover h2 {
            color: var(--color-primary);
          }

          /* Helper classes that use CSS variables from globals.css */
          .doc-foreground {
            color: var(--color-foreground);
          }

          .doc-title {
            color: var(--color-foreground);
          }

          .doc-muted {
            color: var(--color-muted-foreground);
          }

          .doc-heading {
            color: var(--color-foreground);
            transition: color 0.2s ease;
          }

          /* Make the logo/title follow group hover using variables */
          .group:hover .doc-foreground {
            color: var(--color-primary);
          }

          /* Category chip uses secondary variables */
          .category-chip {
            background: var(--color-secondary);
            color: var(--color-secondary-foreground);
            background-clip: padding-box;
            opacity: 0.9;
          }

          /* Responsive, theme-aware headings for documentation pages */
          /* Ensure markdown-rendered <h1> inside .prose-custom is covered */
          .prose-custom h1,
          .doc-title {
            font-size: clamp(28px, 4.8vw, 44px);
            line-height: 1.08;
            margin-top: 0.25em;
            margin-bottom: 0.5em;
            color: var(--color-doc-text) !important;
            font-weight: 700;
          }

          /* h2 used by both prose and doc-heading elements */
          .prose-custom h2,
          .doc-heading {
            font-size: clamp(22px, 3.2vw, 30px);
            line-height: 1.12;
            margin-top: 0.9em;
            margin-bottom: 0.5em;
            color: var(--color-doc-text) !important;
            font-weight: 700;
          }

          /* h3 sizing and color */
          .prose-custom h3 {
            font-size: clamp(18px, 2.6vw, 20px);
            line-height: 1.18;
            margin-top: 0.8em;
            margin-bottom: 0.5em;
            color: var(--color-doc-text) !important;
            font-weight: 600;
          }

          /* Prose list text and markers use theme variables */
          .prose ul li,
          .prose ol li,
          .not-prose ul li,
          .not-prose ol li {
            color: var(--color-doc-text);
          }

          .prose ul li::marker,
          .prose ol li::marker,
          .not-prose ul li::marker,
          .not-prose ol li::marker,
          .notification-markdown li::marker {
            color: var(--color-doc-bullet);
          }

          /* Fallback: ensure prose base text follows doc variable */
          .prose,
          .prose h1,
          .prose h2,
          .prose h3,
          .prose p {
            color: var(--color-doc-text);
          }
        `}
      </style>
      <div className="bg-background min-h-screen p-8 md:p-12 lg:p-16">
        <div className="max-w-3xl mx-auto">
          <Link href="/schedule" className="flex items-center gap-3 mb-8 group">
            <PlazenLogo />
            <span className="text-xl font-semibold doc-foreground transition-colors">
              Plazen
            </span>
          </Link>

          <article className="prose prose-invert prose-lg max-w-none">
            <h1 className="text-4xl font-bold doc-title mb-6">Documentation</h1>
            <p className="doc-muted">
              Find guides and information on how to use Plazen.
            </p>

            {loading ? (
              <div className="py-20">
                <LoadingSpinner text="Loading documentation..." />
              </div>
            ) : (
              <section className="space-y-8 mt-12 not-prose">
                {entries.map((entry) => (
                  <Link
                    href={`/documentation/${entry.id}`}
                    key={entry.id}
                    className="block no-underline note-item group"
                  >
                    <div className="p-6 border border-border rounded-xl transition-all duration-200 hover:border-primary/50 hover:shadow-lg bg-card/50 hover:bg-card">
                      <div className="flex justify-between items-center mb-2">
                        <h2 className="text-2xl font-semibold doc-heading !m-0 !p-0 !border-0 transition-colors duration-200">
                          {entry.topic}
                        </h2>
                        {entry.category && (
                          <span className="text-sm font-medium px-3 py-1 category-chip rounded-full flex-shrink-0">
                            {entry.category}
                          </span>
                        )}
                      </div>
                      <p className="doc-muted !m-0">
                        Last updated{" "}
                        {new Date(entry.updated_at).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </section>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
