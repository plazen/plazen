import Link from "next/link";
import React from "react";
import { PlazenLogo } from "@/components/plazen-logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Plazen collects, uses, and protects your personal information. Read our privacy policy for details on data handling and your rights.",
  alternates: {
    canonical: "/privacy_policy",
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
            <article className="prose prose-invert prose-lg max-w-none">
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Privacy Policy
              </h1>
              <p className="text-muted-foreground">
                Effective Date: November 10, 2025
              </p>
              <h3>1. Introduction</h3>
              {/* FIX: Escaped double quotes */}
              <p>
                Welcome to Plazen. This Privacy Policy describes how Plazen
                (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
                collects, uses, and shares information in connection with your
                use of our website, plazen.org (the &ldquo;Website&rdquo;), and
                our associated Telegram Bot (the &ldquo;Bot&rdquo;).
              </p>
              <p>
                Your privacy is important to us. By using our Website or Bot,
                you agree to the collection and use of information in accordance
                with this policy.
              </p>

              <h3>2. Information We Collect</h3>
              <p>
                We collect information to provide and improve our services to
                you.
              </p>

              <p>
                <strong>A. Information You Provide:</strong>
              </p>
              <ul>
                <li>
                  <strong>Plazen Account Information:</strong> When you use the
                  Plazen service (on our main application), you provide us with
                  information, which may include your name, email address, and
                  your user-generated content, such as tasks, schedules, and
                  goals.
                </li>
                <li>
                  <strong>Telegram Bot Linking:</strong> To use the Telegram
                  Bot, you must link it to your Plazen account. To do this, you
                  provide your unique Telegram Chat ID to your Plazen account
                  settings. The Bot itself will show you this ID when you use
                  the <code>/start</code> command.
                </li>
              </ul>

              <p>
                <strong>B. Information Collected Automatically:</strong>
              </p>
              <ul>
                <li>
                  <strong>Website Usage Data:</strong> When you visit
                  plazen.org, we may automatically collect standard web log
                  information, such as your IP address, browser type, operating
                  system, pages visited, and the dates/times of your visits. We
                  may use cookies and similar technologies for analytics.
                </li>
                <li>
                  <strong>Bot Interaction Data:</strong> When you interact with
                  our Bot, we receive your Telegram Chat ID. We log requests
                  (such as <code>/schedule</code>) to fetch your data from our
                  backend and provide the service.
                </li>
              </ul>

              <h3>3. How We Use Your Information</h3>
              <p>
                We use the information we collect for the following purposes:
              </p>
              <ul>
                <li>
                  <strong>To Provide Our Service:</strong> To link your Telegram
                  account with your Plazen account and fetch your schedule data
                  when you request it via the Bot.
                </li>
                <li>
                  <strong>To Operate the Website:</strong> To provide, maintain,
                  and improve the user experience of plazen.org.
                </li>
                <li>
                  <strong>To Improve Our Services:</strong> To understand how
                  our users interact with the Bot and Website so we can debug,
                  analytics, and develop new features.
                </li>
                <li>
                  <strong>To Communicate With You:</strong> To respond to your
                  support requests or inquiries.
                </li>
              </ul>

              <h3>4. How We Share Your Information</h3>
              <p>
                We do not sell, rent, or trade your personal information to
                third parties for their marketing purposes. We may share
                information only in the following circumstances:
              </p>
              <ul>
                <li>
                  <strong>With Third-Party Service Providers:</strong> We use
                  third-party services to operate our infrastructure.
                  <ul>
                    <li>
                      <strong>Supabase:</strong> Our backend, including your
                      Plazen account data (tasks, settings), and the{" "}
                      <code>UserSettings</code> table that links your{" "}
                      <code>user_id</code> to your <code>telegram_id</code>, is
                      hosted and managed by Supabase.
                    </li>
                    <li>
                      <strong>Telegram:</strong> The Bot operates on the
                      Telegram platform. Your messages to the Bot are processed
                      by Telegram as part of their service.
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>For Legal Reasons:</strong> We may disclose your
                  information if we are required to do so by law or in response
                  to a valid legal process (such as a court order or subpoena).
                </li>
                <li>
                  <strong>To Protect Our Rights:</strong> We may disclose
                  information to protect and defend our rights, property, or the
                  safety of our users or the public.
                </li>
              </ul>

              <h3>5. Data Security</h3>
              <p>
                We use reasonable administrative and technical measures to
                protect your personal information. Our data is stored with
                Supabase, which provides robust security measures for its
                database services. However, please be aware that no method of
                transmission over the Internet or method of electronic storage
                is 100% secure.
              </p>

              <h3>6. Your Rights and Choices</h3>
              <p>You have control over your information.</p>
              <ul>
                <li>
                  <strong>Access and Update:</strong> You can access and update
                  your main Plazen account data (like your tasks) through the
                  primary Plazen application.
                </li>
                {/* FIX: Escaped single quote (apostrophe) */}
                <li>
                  <strong>Unlink the Bot:</strong> You can revoke the
                  Bot&rsquo;s access at any time by simply removing your
                  Telegram Chat ID from your Plazen account settings in the main
                  application. This will break the connection, and the Bot will
                  no longer be able to fetch your schedule.
                </li>
                <li>
                  <strong>Account Deletion:</strong> To delete all of your
                  Plazen data, including your linked Chat ID and all your tasks,
                  you must delete your Plazen account through our main
                  application.
                </li>
              </ul>

              {/* FIX: Escaped single quote (apostrophe) */}
              <h3>7. Children&rsquo;s Privacy</h3>
              <p>
                Our services are not directed to individuals under the age of
                13. We do not knowingly collect personal information from
                children under 13. If we become aware that we have collected
                such information, we will take steps to delete it.
              </p>

              <h3>8. Changes to This Privacy Policy</h3>
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of any significant changes by posting the new policy
                on our Website. We encourage you to review this policy
                periodically.
              </p>

              <h3>9. Contact Us</h3>
              <p>
                If you have any questions about this Privacy Policy, please
                contact us at: support@plazen.org
              </p>
            </article>
          </div>
        </div>
      </>
    </div>
  );
}
