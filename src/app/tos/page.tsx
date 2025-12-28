import React from "react";
import Link from "next/link";
import { PlazenLogo } from "@/components/plazen-logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the Terms of Service for Plazen, the intelligent task scheduler that plans your day automatically.",
  alternates: {
    canonical: "/tos",
  },
};

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
            .prose-custom ul, .prose-custom ol {
              line-height: 1.7;
              margin-left: 1.5rem;
              margin-bottom: 1em;
            }
            .prose-custom li {
              margin-bottom: 0.5em;
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
                Terms of Service
              </h1>
              <p className="text-muted-foreground">
                Effective Date: November 12, 2025
              </p>

              <h3>1. Agreement to Terms</h3>
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your access to
                and use of the Plazen website (plazen.org, the
                &quot;Website&quot;), our associated Telegram Bot (the
                &quot;Bot&quot;), and any other services we provide
                (collectively, the &quot;Service&quot;). The Service is provided
                by Plazen (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
              </p>
              <p>
                By accessing or using the Service, you agree to be bound by
                these Terms and our{" "}
                <Link href="/privacy_policy">Privacy Policy</Link>. If you do
                not agree to these Terms, do not use the Service.
              </p>

              <h3>2. User Accounts</h3>
              <p>
                To use most features of the Service, you must create an account.
                You can do this directly or by linking a third-party account
                (such as Google, GitHub, Discord, or Apple). You agree to:
              </p>
              <ul>
                <li>Provide accurate and complete information.</li>
                <li>
                  Keep your password confidential and not share it with anyone.
                </li>
                <li>
                  Be responsible for all activities that occur under your
                  account.
                </li>
              </ul>
              <p>
                You must notify us immediately at support@plazen.org if you
                suspect any unauthorized use of your account.
              </p>

              <h3>3. User-Generated Content</h3>
              <p>
                The Service allows you to create, store, and manage content,
                including tasks, schedules, goals, and other related information
                (&ldquo;User Content&rdquo;).
              </p>
              <p>
                You retain full ownership of your User Content. By using the
                Service, you grant us a limited, worldwide, non-exclusive,
                royalty-free license to host, store, display, and use your User
                Content solely for the purpose of operating, providing, and
                improving the Service. We will not share your User Content with
                third parties except as described in our Privacy Policy.
              </p>

              <h3>4. Acceptable Use</h3>
              <p>
                You agree not to use the Service for any unlawful purpose or in
                any way that violates these Terms. You agree not to:
              </p>
              <ul>
                <li>Harass, abuse, or harm another person.</li>
                <li>
                  Use the Service to store or transmit any content that is
                  discriminatory, hateful, fraudulent, or illegal.
                </li>
                <li>
                  Attempt to reverse-engineer, disrupt, or gain unauthorized
                  access to the Service or its related systems.
                </li>
                <li>Use the Service to send spam or unsolicited messages.</li>
              </ul>

              <h3>5. Open-Source Software</h3>
              <p>
                Plazen is an open-source project. Your use of the Plazen
                *Service* is governed by these Terms of Service. The Plazen
                *software code* is made available separately under the terms of
                the MIT License, which can be found in our GitHub repository.
              </p>

              <h3>6. Termination</h3>
              <p>
                You can terminate these Terms at any time by deleting your
                account through the account settings page.
              </p>
              <p>
                We reserve the right to suspend or terminate your account and
                access to the Service, with or without notice, if you violate
                these Terms.
              </p>

              <h3>7. Disclaimers (Warranty)</h3>
              <p>
                The Service is provided &ldquo;as is.&rdquo; To the fullest
                extent permitted by law, we disclaim all warranties, either
                express or implied, regarding the Service.
              </p>
              <p>
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF
                ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
                WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE
                AND NONINFRINGEMENT.
              </p>

              <h3>8. Limitation of Liability</h3>
              <p>
                IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
                ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
                CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
                CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                SOFTWARE.
              </p>

              <h3>9. Changes to These Terms</h3>
              <p>
                We may update these Terms from time to time. If we make
                significant changes, we will provide notice through the Service
                or by email. Your continued use of the Service after such
                changes constitutes your acceptance of the new Terms.
              </p>

              <h3>10. Governing Law</h3>
              <p>
                These Terms shall be governed by and construed in accordance
                with the laws of Georgia (country), without regard to its
                conflict of law provisions.
              </p>

              <h3>11. Contact Us</h3>
              <p>
                If you have any questions about these Terms of Service, please
                contact us at: support@plazen.org.
              </p>
            </article>
          </div>
        </div>
      </>
    </div>
  );
}
