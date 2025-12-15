import type { Metadata } from "next";
import { Lexend, Geist_Mono, Instrument_Sans } from "next/font/google"; // [MODIFIED]
import "./globals.css";
import packageJson from "../../package.json";
import { ThemeProvider } from "@/components/theme-provider";
import Link from "next/link";
import { Github, Mail } from "lucide-react";
import { PlazenLogo } from "@/components/plazen-logo";
import { Button } from "@/app/components/ui/button";

const Mastodon = (props: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    fill="currentColor"
    className={`bi bi-mastodon ${props.className || ""}`}
    viewBox="0 0 16 16"
  >
    <path d="M11.19 12.195c2.016-.24 3.77-1.475 3.99-2.603.348-1.778.32-4.339.32-4.339 0-3.47-2.286-4.488-2.286-4.488C12.062.238 10.083.017 8.027 0h-.05C5.92.017 3.942.238 2.79.765c0 0-2.285 1.017-2.285 4.488l-.002.662c-.004.64-.007 1.35.011 2.091.083 3.394.626 6.74 3.78 7.57 1.454.383 2.703.463 3.709.408 1.823-.1 2.847-.647 2.847-.647l-.06-1.317s-1.303.41-2.767.36c-1.45-.05-2.98-.156-3.215-1.928a4 4 0 0 1-.033-.496s1.424.346 3.228.428c1.103.05 2.137-.064 3.188-.189zm1.613-2.47H11.13v-4.08c0-.859-.364-1.295-1.091-1.295-.804 0-1.207.517-1.207 1.541v2.233H7.168V5.89c0-1.024-.403-1.541-1.207-1.541-.727 0-1.091.436-1.091 1.296v4.079H3.197V5.522q0-1.288.66-2.046c.456-.505 1.052-.764 1.793-.764.856 0 1.504.328 1.933.983L8 4.39l.417-.695c.429-.655 1.077-.983 1.934-.983.74 0 1.336.259 1.791.764q.662.757.661 2.046z" />
  </svg>
);

const lexend = Lexend({
  variable: "--font-geist-sans", // We keep this variable name to match globals.css
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"], // Added weights to match your privacy page
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const appVersion = packageJson.version;

const SITE_BASE = "https://plazen.org";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_BASE),
  title: {
    default: "Plazen — Let your schedule build itself.",
    template: "%s | Plazen",
  },
  description:
    "Plazen is a modern, open-source task manager that intelligently plans your day for you.",
  keywords: [
    "Plazen",
    "task manager",
    "schedule",
    "planner",
    "to-do",
    "productivity",
    "time blocking",
  ],
  alternates: {
    canonical: "/",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  openGraph: {
    type: "website",
    url: SITE_BASE,
    siteName: "Plazen",
    title: "Plazen — Let your schedule build itself.",
    description:
      "Add flexible to-dos and Plazen automatically finds the best time in your day.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Plazen app preview",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plazen — Let your schedule build itself.",
    description:
      "Add flexible to-dos and Plazen automatically finds the best time in your day.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "https://avatars.githubusercontent.com/u/226096442?s=200&v=4" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <link rel="me" href="https://fosstodon.org/@plazen" />
      <body
        className={`${lexend.variable} ${geistMono.variable} ${instrumentSans.variable} antialiased`}
      >
        <ThemeProvider defaultTheme="dark" storageKey="plazen-theme">
          {children}

          <footer className="border-t border-border mt-12 py-10 text-muted-foreground">
            <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8 text-sm">
                <div>
                  <h3 className="font-semibold text-foreground mb-4">
                    Product
                  </h3>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        href="/documentation"
                        className="hover:text-primary transition-colors"
                      >
                        Documentation
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/release-notes"
                        className="hover:text-primary transition-colors"
                      >
                        Release Notes
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/support"
                        className="hover:text-primary transition-colors"
                      >
                        Support
                      </Link>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-4">Legal</h3>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        href="/privacy_policy"
                        className="hover:text-primary transition-colors"
                      >
                        Privacy Policy
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/tos"
                        className="hover:text-primary transition-colors"
                      >
                        Terms of Service
                      </Link>
                    </li>
                  </ul>
                </div>

                <div className="hidden md:block"></div>
                <div className="hidden md:block"></div>
              </div>

              <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
                <div className="flex items-center space-x-2 text-sm">
                  <PlazenLogo width={40} height={40} />
                  <span>&copy; {new Date().getFullYear()} Plazen</span>
                  <span
                    className="text-muted-foreground/60 text-xs"
                    style={{ fontFamily: "var(--font-instrument-sans)" }}
                  >
                    v{appVersion}.
                  </span>
                  <a
                    className="underline underline-offset-3 hover:text-primary"
                    href="/license"
                  >
                    MIT License
                  </a>
                </div>

                <div className="flex items-center space-x-1">
                  <Button variant="ghost" size="icon" asChild>
                    <a
                      href="https://github.com/plazen"
                      aria-label="GitHub"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="w-5 h-5" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a
                      href="https://fosstodon.org/@plazen"
                      aria-label="Mastodon"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Mastodon className="w-5 h-5" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a
                      href="mailto:support@plazen.org"
                      aria-label="Email support"
                    >
                      <Mail className="w-5 h-5" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
