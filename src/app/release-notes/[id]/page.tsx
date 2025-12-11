import React from "react";
import { PlazenLogo } from "@/components/plazen-logo";
import { MoveLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

type ReleaseNote = {
  id: string;
  version: string | null;
  topic: string | null;
  text: string | null;
  date: Date | null;
};

const MarkdownStyles = () => (
  <style>
    {`
      .font-lexend {
        font-family: 'Lexend', sans-serif;
      }
      /* Make headings responsive and theme-aware */
      .prose-custom h1 {
        font-weight: 700;
        font-size: clamp(28px, 4.8vw, 44px);
        line-height: 1.08;
        color: var(--color-release-text) !important;
        margin-top: 0.25em;
        margin-bottom: 0.5em;
      }
      .prose-custom h2 {
        font-weight: 600;
        font-size: clamp(22px, 3.2vw, 30px);
        line-height: 1.12;
        color: var(--color-release-text) !important;
        margin-top: 0.9em;
        margin-bottom: 0.5em;
      }
      .prose-custom h3 {
        font-weight: 600;
        font-size: clamp(18px, 2.6vw, 20px);
        line-height: 1.18;
        color: var(--color-release-text) !important;
        margin-top: 0.8em;
        margin-bottom: 0.5em;
      }
      .prose-custom p {
        line-height: 1.7;
        margin-bottom: 1em;
        color: var(--color-release-text);
      }
      .prose-custom ul {
        line-height: 1.7;
        margin-left: 1.5rem;
        margin-bottom: 1em;
        list-style-type: disc;
      }
      /* Ensure list markers use theme variable */
      .prose-custom ul li::marker,
      .prose-custom ol li::marker {
        color: var(--color-release-bullet);
      }
      .prose-custom ol {
        line-height: 1.7;
        margin-left: 1.5rem;
        margin-bottom: 1em;
        list-style-type: decimal;
      }
      .prose-custom li {
        margin-bottom: 0.5em;
      }
      .prose-custom a {
        color: var(--color-primary);
        text-decoration: underline;
        text-decoration-offset: 2px;
      }
      /* High-specificity override for the back-link inside .prose-custom:
         remove underline, prevent hover background/outline square, and retain accessible focus outline.
         Use multiple selectors and !important to ensure these rules override other prose presets. */
      .prose-custom a.back-link,
      .prose.prose-custom a.back-link,
      article.prose .prose-custom a.back-link,
      .prose-custom a.back-link:link,
      .prose-custom a.back-link:visited,
      .prose-custom a.back-link:hover,
      .prose-custom a.back-link:active,
      .prose-custom a.back-link:focus {
        color: var(--color-primary) !important;
        text-decoration: none !important;
        background: transparent !important;
        box-shadow: none !important;
        -webkit-tap-highlight-color: transparent !important;
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      /* ensure icon pseudo-element remains visible and inherits color */
      .prose-custom a.back-link::before {
        display: none;
      }
      /* Hover: only change color to darker primary; do NOT add underline, outline or box-shadow */
      .prose-custom a.back-link:hover {
        color: var(--color-primary-dark) !important;
        text-decoration: none !important;
        background: transparent !important;
        box-shadow: none !important;
        outline: none !important;
      }
      /* Focus: clear for pointer/mouse interactions; use :focus-visible for keyboard focus ring */
      .prose-custom a.back-link:focus {
        /* No visual change on mouse click — prevents the filled rectangle */
        outline: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      /* Keyboard focus only: show an accessible, rounded ring using the theme variable */
      .prose-custom a.back-link:focus-visible {
        color: var(--color-primary-dark) !important;
        text-decoration: none !important;
        background: transparent !important;
        outline: none !important;
        border-radius: 8px !important;
        box-shadow: 0 0 0 4px var(--color-primary-dark) !important;
      }
      .prose-custom code {
        background-color: var(--color-input);
        padding: 0.2em 0.4em;
        border-radius: 6px;
        font-family: var(--font-geist-mono), monospace;
      }
      .prose-custom pre {
        background-color: var(--color-input);
        padding: 1em;
        border-radius: 8px;
        overflow-x: auto;
      }
      .prose-custom hr {
        border-color: var(--color-border);
        margin-top: 2em;
        margin-bottom: 2em;
      }
    `}
  </style>
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let note: ReleaseNote | null = null;
  try {
    note = await prisma.release_notes.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error("Failed to fetch release note for metadata", error);
  }

  if (!note) {
    return {
      title: "Release Note Not Found",
    };
  }

  return {
    title: `${note.topic} (${note.version})`,
    description: `Release notes for Plazen ${note.version}: ${note.topic}`,
    openGraph: {
      images: [
        {
          url: `https://plazen.org/api/og?type=release-note&id=${id}`,
          width: 1200,
          height: 630,
          alt: `${note.topic} — Plazen ${note.version}`,
        },
      ],
    },
    twitter: {
      images: [`https://plazen.org/api/og?type=release-note&id=${id}`],
    },
  };
}

export default async function SingleReleaseNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let note: ReleaseNote | null = null;
  try {
    note = await prisma.release_notes.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error("Failed to fetch release note", error);
  }

  if (!note) {
    notFound();
  }

  return (
    <div className="font-lexend">
      <MarkdownStyles />
      <div className="bg-background text-foreground min-h-screen p-8 md:p-12 lg:p-16">
        <div className="max-w-3xl mx-auto">
          <Link href="/schedule" className="flex items-center gap-3 mb-8 group">
            <PlazenLogo />
            <span className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
              Plazen
            </span>
          </Link>

          <article className="prose prose-invert prose-lg max-w-none prose-custom">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-4xl font-bold text-foreground !m-0">
                {note.topic}
              </h1>
              <span className="text-sm font-medium px-3 py-1 bg-primary/10 text-primary rounded-full flex-shrink-0">
                {note.version}
              </span>
            </div>
            <div className="flex justify-between items-center mb-0">
              <p className="text-muted-foreground !m-0">
                {note.date
                  ? new Date(note.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "No date"}
              </p>
              <Link href="/release-notes" className="back-link">
                <MoveLeft className="h-4 w-4" />
                Back to Release Notes
              </Link>
            </div>
            <hr />

            {/* This is where the markdown is rendered */}
            <ReactMarkdown>{note.text || ""}</ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}
