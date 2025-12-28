import React from "react";
import Link from "next/link";
import { PlazenLogo } from "@/components/plazen-logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "License",
  description:
    "Plazen is open-source software released under the MIT License. View the full license text.",
  alternates: {
    canonical: "/license",
  },
};

const licenseText = `Copyright (c) ${new Date().getFullYear()} Plazen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.
`;

export default function App() {
  return (
    <div className="font-lexend">
      <>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wght@0,200..900;1,200..900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap');

            .font-lexend {
              font-family: 'Mona Sans', 'Montserrat', sans-serif;
            }
            .prose-custom h2, .prose-custom h3 {
                    font-weight: 600;
                    color: var(--color-doc-text);
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                  }
            .prose-custom p {
              line-height: 1.7;
              margin-bottom: 1em;
            }
            .prose-custom a {
              color: var(--color-primary);
              text-decoration: underline;
              text-decoration-offset: 2px;
            }
            .prose-custom a:hover {
              color: var(--color-primary-foreground);
              background: var(--color-primary);
            }
            .prose-custom pre {
              background-color: var(--color-input);
              border: 1px solid var(--color-border);
              border-radius: 0.5rem;
              padding: 1rem;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 0.9em;
              line-height: 1.6;
              color: var(--color-muted-foreground);
            }
          `}
        </style>
        <div className="bg-background text-foreground min-h-screen p-8 md:p-12 lg:p-16">
          <div className="max-w-3xl mx-auto">
            <Link
              href="/schedule"
              className="flex items-center gap-3 mb-8 group"
            >
              <PlazenLogo />
              <span className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                Plazen
              </span>
            </Link>
            <article className="prose prose-invert prose-lg max-w-none prose-custom">
              <h1 className="text-4xl font-bold text-foreground mb-4">
                MIT License
              </h1>
              <p className="text-muted-foreground">
                This applies to the Plazen open-source software.
              </p>

              <pre>{licenseText}</pre>
            </article>
          </div>
        </div>
      </>
    </div>
  );
}
