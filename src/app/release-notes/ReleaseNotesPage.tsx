"use client";

import React, { useState, useEffect } from "react";
import { PlazenLogo } from "@/components/plazen-logo";
import Link from "next/link";
import LoadingSpinner from "@/app/components/LoadingSpinner";

type ReleaseNote = {
  id: string;
  version: string;
  topic: string;
  text: string;
  date: string;
};

export default function ReleaseNotesPage() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const res = await fetch("/api/release-notes");
        if (res.ok) {
          const data = await res.json();
          setNotes(data);
        }
      } catch (error) {
        console.error("Failed to fetch release notes", error);
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, []);

  return (
    <div className="font-lexend">
      <style>
        {`
          /* Hover heading color (keeps existing behavior) */
          .note-item:hover h2 {
            color: var(--color-primary);
          }

          /* Note card hover: do not change background or elevation; only adjust border color using theme variable */
          .note-item:hover {
            background: transparent !important;
            box-shadow: none !important;
            border-color: var(--color-primary) !important;
          }

          /* Root for release notes so we can use CSS variables for text and list markers */
          .release-notes-root {
            background: var(--color-background);
            color: var(--color-foreground);
          }

          /* Typography inside the prose should use our color variables */
          .release-notes-root .prose h1,
          .release-notes-root .prose h2 {
            color: var(--color-foreground);
          }

          .release-notes-root .prose p,
          .release-notes-root .prose .text-muted,
          .release-notes-root .note-meta {
            color: var(--color-muted-foreground);
          }

          /* Lists: use foreground for text, and release-specific variable for the bullet/marker */
          .release-notes-root .prose ul,
          .release-notes-root .prose ol {
            color: var(--color-foreground);
          }

          /* Set the marker (bullet/number) color using the release variable */
          .release-notes-root .prose li::marker {
            color: var(--color-release-bullet);
          }

          /* If you prefer primary markers change above to var(--color-primary) */
        `}
      </style>
      <div className="bg-background text-foreground min-h-screen p-8 md:p-12 lg:p-16 release-notes-root">
        <div className="max-w-3xl mx-auto">
          <Link href="/schedule" className="flex items-center gap-3 mb-8 group">
            <PlazenLogo />
            <span className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
              Plazen
            </span>
          </Link>

          <article className="prose prose-invert prose-lg max-w-none">
            <h1 className="text-4xl font-bold text-foreground mb-6">
              Release Notes
            </h1>
            <p className="text-muted-foreground">
              See what&apos;s new, what&apos;s fixed, and what&apos;s improved
              in Plazen.
            </p>

            {loading ? (
              <div className="py-20">
                <LoadingSpinner text="Loading notes..." />
              </div>
            ) : (
              <section className="space-y-8 mt-12 not-prose">
                {notes.map((note) => (
                  <Link
                    href={`/release-notes/${note.id}`}
                    key={note.id}
                    className="block no-underline note-item group"
                  >
                    <div className="p-6 border border-border rounded-xl transition-colors duration-200 bg-card/50">
                      <div className="flex justify-between items-center mb-2">
                        <h2 className="text-2xl font-semibold text-foreground !m-0 !p-0 !border-0 transition-colors duration-200">
                          {note.topic}
                        </h2>
                        <span className="text-sm font-medium px-3 py-1 bg-primary/10 text-primary rounded-full flex-shrink-0">
                          {note.version}
                        </span>
                      </div>
                      <p className="text-gray-400 !m-0">
                        {new Date(note.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
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
