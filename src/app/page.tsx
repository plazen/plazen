"use client";

import React from "react";
import Link from "next/link";
import styles from "./marketing.module.css";
import Image from "next/image";
import { PlazenLogo } from "@/components/plazen-logo";
import { createBrowserClient } from "@/lib/supabaseClient"; // Import the client
import type { SupabaseClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";

const REDIRECT_PATH = "/schedule";

export default function Page() {
  return <Landing />;
}

const ClientRedirect = dynamic(
  () => {
    return Promise.resolve(function ClientRedirectComponent() {
      const [supabase, setSupabase] = React.useState<SupabaseClient | null>(
        null
      );

      React.useEffect(() => {
        // Create the client only on the browser
        const supabaseClient = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        setSupabase(supabaseClient);
      }, []);

      React.useEffect(() => {
        if (supabase) {
          const checkSession = async () => {
            // Use the official Supabase method to check the session
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session) {
              // Only redirect if there is a valid, active session
              window.location.href = REDIRECT_PATH;
            }
          };
          checkSession();
        }
      }, [supabase]);

      return null;
    });
  },
  { ssr: false }
);

function Landing() {
  return (
    <div className="font-lexend">
      <ClientRedirect />
      <main className={`${styles.page} ${styles.theme}`}>
        <header className={styles.header}>
          <div className={styles.container}>
            <div className={styles.topBar}>
              <div className={styles.brand}>
                <PlazenLogo width={32} height={32} />
                <span className={styles.brandText}>Plazen</span>
              </div>
              <nav className={styles.nav}>
                <a href="#features" className={styles.navLink}>
                  Features
                </a>
                <a href="#security" className={styles.navLink}>
                  Security
                </a>
                <Link
                  href="/login"
                  className={`${styles.navLink} ${styles.loginLink}`}
                >
                  Log in
                </Link>
              </nav>
            </div>
          </div>
        </header>
        <section className={styles.heroFullscreen}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Your day, planned for you.</h1>
            <p className={styles.heroSubtitle}>
              Plazen turns tasks into time. Add flexible to‑dos, pin hard
              appointments, and let Plazen place everything into a realistic
              daily schedule—no dragging blocks or micromanaging.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/login" className={styles.buttonPrimary}>
                Get started — Log in
              </Link>
              <a href="#features" className={styles.buttonSecondary}>
                See how it works
              </a>
            </div>
            <p className={styles.trustNote}>
              Built for people who value deep work: students, founders,
              creators, and focused teams.
            </p>
          </div>
          <div className={styles.scrollIndicator}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={styles.arrowIcon}
            >
              <path
                d="M7 10L12 15L17 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </section>

        <section id="features" className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>
              Built for focus, not fiddling
            </h2>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <div className={styles.featureIcon}>🎯</div>
                <span className={styles.featureName}>Focus mode</span>
                <span className={styles.featureDesc}>
                  One task at a time with gentle, timely handoffs.
                </span>
              </li>
              <li className={styles.featureItem}>
                <div className={styles.featureIcon}>⏱️</div>
                <span className={styles.featureName}>Smart planning</span>
                <span className={styles.featureDesc}>
                  Calculates perfect schedules based on your plans.
                </span>
              </li>
              <li className={styles.featureItem}>
                <div className={styles.featureIcon}>⚡</div>
                <span className={styles.featureName}>Energy‑aware</span>
                <span className={styles.featureDesc}>
                  Schedule deep work when you&apos;re sharp; save admin for
                  later.
                </span>
              </li>
              <li className={styles.featureItem}>
                <div className={styles.featureIcon}>📅</div>
                <span className={styles.featureName}>Calendar‑friendly</span>
                <span className={styles.featureDesc}>
                  Respects your events so plans reflect reality.
                </span>
              </li>
              <li className={styles.featureItem}>
                <div className={styles.featureIcon}>🛡️</div>
                <span className={styles.featureName}>Deadline protection</span>
                <span className={styles.featureDesc}>
                  Prioritizes time‑sensitive items so nothing slips.
                </span>
              </li>
              <li className={styles.featureItem}>
                <div className={styles.featureIcon}>🔧</div>
                <span className={styles.featureName}>Tweakable</span>
                <span className={styles.featureDesc}>
                  Nudge a task; Plazen rebalances the rest intelligently.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>What people say</h2>
            <div className={styles.testimonialGrid}>
              <figure className={styles.testimonial}>
                <blockquote className={styles.testimonialQuote}>
                  I stopped spending 30 minutes every morning deciding when to
                  do tasks. Plazen just handles it, so I actually start working.
                </blockquote>
                <figcaption className={styles.testimonialMeta}>
                  <Image
                    width={40}
                    height={40}
                    className={styles.testimonialAvatar}
                    src="https://avatars.githubusercontent.com/u/175145001?v=4"
                    alt="Drew S."
                  />
                  <div className={styles.testimonialIdentity}>
                    <span className={styles.testimonialName}>Drew S.</span>
                    <span className={styles.testimonialRole}>
                      Lead Developer
                    </span>
                  </div>
                </figcaption>
              </figure>

              <figure className={styles.testimonial}>
                <blockquote className={styles.testimonialQuote}>
                  My day used to be a mess of tasks and meetings. Now I just
                  focus on what&apos;s next.
                </blockquote>
                <figcaption className={styles.testimonialMeta}>
                  <Image
                    width={40}
                    height={40}
                    className={styles.testimonialAvatar}
                    src="https://i.pinimg.com/236x/b2/ea/a0/b2eaa0d4918d54021f9c7aa3fc3d3cf3.jpg"
                    alt="Preston P."
                  />
                  <div className={styles.testimonialIdentity}>
                    <span className={styles.testimonialName}>Preston P.</span>
                    <span className={styles.testimonialRole}>
                      Software Engineer
                    </span>
                  </div>
                </figcaption>
              </figure>

              <figure className={styles.testimonial}>
                <blockquote className={styles.testimonialQuote}>
                  It was hard for me to plan my day outside of classes. Now I
                  can focus on studying and let Plazen plan the rest.
                </blockquote>
                <figcaption className={styles.testimonialMeta}>
                  <Image
                    width={40}
                    height={40}
                    className={styles.testimonialAvatar}
                    src="https://i.pinimg.com/236x/06/f4/e2/06f4e292a4dbe804107c6bf6f6616bda.jpg"
                    alt="Priya"
                  />
                  <div className={styles.testimonialIdentity}>
                    <span className={styles.testimonialName}>Priya</span>
                    <span className={styles.testimonialRole}>
                      Medical Student
                    </span>
                  </div>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="security" className={styles.sectionAlt}>
          <div className={styles.container}>
            <div className={styles.securityContent}>
              <div className={styles.securityText}>
                <h2 className={styles.sectionTitle}>Your Data, Secured.</h2>
                <p className={styles.securitySubtitle}>
                  We take your privacy seriously. Your task data is yours alone,
                  protected with industry-leading encryption.
                </p>
                <ul className={styles.securityList}>
                  <li className={styles.securityListItem}>
                    <div className={styles.securityIcon}>🔒</div>
                    <div className={styles.securityItemText}>
                      <strong>AES-256-GCM Encryption</strong>
                      <p>
                        Your data is encrypted at rest using the same standard
                        trusted by banks and governments.
                      </p>
                    </div>
                  </li>
                  <li className={styles.securityListItem}>
                    <div className={styles.securityIcon}>🛡️</div>
                    <div className={styles.securityItemText}>
                      <strong>Authenticated Encryption</strong>
                      <p>
                        We use GCM, which not only encrypts your data but also
                        ensures it cannot be tampered with.
                      </p>
                    </div>
                  </li>
                  <li className={styles.securityListItem}>
                    <div className={styles.securityIcon}>🔑</div>
                    <div className={styles.securityItemText}>
                      <strong>Isolated & Private</strong>
                      <p>
                        Your data is encrypted with a key unique to your
                        environment, keeping it totally isolated.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className={styles.securityVisual}>
                <svg
                  className={styles.securitySvg}
                  width="200"
                  height="200"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M19 11H5C3.89543 11 3 11.8954 3 13V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V13C21 11.8954 20.1046 11 19 11Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 11V7C7 4.79086 8.79086 3 11 3H13C15.2091 3 17 4.79086 17 7V11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 16.5V16.51"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <h2 className={styles.ctaTitle}>Ready to reclaim your day?</h2>
            <p className={styles.ctaText}>
              Join people who plan less and accomplish more with Plazen.
            </p>
            <Link href="/login" className={styles.buttonPrimaryLarge}>
              Log in to start planning
            </Link>
            <p className={styles.smallNote}>No credit card required.</p>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={`${styles.container} ${styles.footerInner}`}>
            <div className={styles.brand}>
              <PlazenLogo width={28} height={28} />
              <span className={styles.brandText}>Plazen</span>
            </div>
            <p className={styles.copyright}>
              © {new Date().getFullYear()} Plazen
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
