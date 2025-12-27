"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import {
  Check,
  Star,
  Zap,
  Infinity as InfinityIcon,
  Loader2,
} from "lucide-react";
import { PlazenLogo } from "@/components/plazen-logo";
import { createBrowserClient } from "@supabase/ssr";

export default function PricingPage() {
  const [subscription, setSubscription] = useState<{
    isPro: boolean;
    provider: string | null;
  } | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const checkSubscription = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (isMounted) {
            setHasSession(false);
            setSubscription({ isPro: false, provider: null });
          }
          return;
        }

        if (isMounted) {
          setHasSession(true);
        }

        const response = await fetch("/api/subscription", {
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 401) {
            if (isMounted) {
              setHasSession(false);
              setSubscription({ isPro: false, provider: null });
            }
            return;
          }

          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || "Unable to fetch subscription.");
        }

        const payload = await response.json();
        if (isMounted) {
          setSubscription({
            isPro: Boolean(payload.isPro),
            provider: payload.provider ?? null,
          });
        }
      } catch (error) {
        console.error("Failed to check subscription status:", error);
        if (isMounted) {
          setSubscription({ isPro: false, provider: null });
          setSubscriptionError(
            "We couldn't verify your subscription status. Showing standard pricing.",
          );
        }
      } finally {
        if (isMounted) {
          setCheckingSubscription(false);
        }
      }
    };

    checkSubscription();

    return () => {
      isMounted = false;
    };
  }, []);

  const isSubscribed = Boolean(subscription?.isPro);

  return (
    <div className="min-h-screen bg-background font-lexend">
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <PlazenLogo width={32} height={32} />
            <span className="font-bold text-xl">Plazen</span>
          </Link>
          {!checkingSubscription && !hasSession && (
            <nav className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-medium hover:text-primary"
              >
                Log in
              </Link>
              <Button asChild>
                <Link href="/login">Get Started</Link>
              </Button>
            </nav>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        {checkingSubscription ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p>Checking your subscription status...</p>
          </div>
        ) : isSubscribed ? (
          <div className="max-w-2xl mx-auto text-center">
            <div className="rounded-2xl border border-border bg-card p-10 shadow-lg">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
                <Star className="h-4 w-4" /> Pro supporter
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                You already have Plazen Pro ✨
              </h1>
              <p className="text-muted-foreground mb-6">
                Thank you for supporting Plazen! Your subscription keeps the
                project alive. If you ever need to change or cancel it, you can
                manage everything directly on Ko-fi.
              </p>
              <Button variant="outline" size="lg" asChild>
                <Link
                  href="https://ko-fi.com/plazen/tiers"
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage subscription on Ko-fi
                </Link>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Use the same email you signed up with on Ko-fi so we can keep
                things in sync.
              </p>
            </div>
          </div>
        ) : (
          <>
            {subscriptionError && (
              <div className="mx-auto mb-8 max-w-3xl rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {subscriptionError}
              </div>
            )}

            <div className="text-center max-w-3xl mx-auto mb-16">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                Simple pricing for <span className="text-primary">focused</span>{" "}
                people.
              </h1>
              <p className="text-xl text-muted-foreground">
                Plazen is free to use. Upgrade to support development and unlock
                power features.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="rounded-2xl border border-border bg-card p-8 flex flex-col">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-2">Basic</h3>
                  <p className="text-muted-foreground">
                    Perfect for getting organized.
                  </p>
                  <div className="mt-6 flex items-baseline">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground ml-2">
                      / forever
                    </span>
                  </div>
                </div>

                <ul className="space-y-4 flex-1 mb-8">
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>Smart auto-scheduling</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>1 routine tasks</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>Telegram Client</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary" />
                    <span>Basic statistics</span>
                  </li>
                </ul>

                <Button variant="outline" className="w-full" asChild>
                  <Link href="/login">Start for Free</Link>
                </Button>
              </div>

              <div className="rounded-2xl border-2 border-primary bg-card p-8 flex flex-col relative shadow-2xl shadow-primary/10">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  Most Popular
                </div>

                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                    Pro
                    <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  </h3>
                  <p className="text-muted-foreground">
                    For power users and supporters.
                  </p>
                  <div className="mt-6 flex items-baseline gap-3">
                    <span className="text-2xl font-semibold text-muted-foreground line-through">
                      $5
                    </span>
                    <span className="text-4xl font-bold text-primary">
                      $2.5
                    </span>
                    <span className="text-muted-foreground ml-2">/ month</span>
                  </div>
                  <div className="mt-2">
                    <span className="text-xs text-primary-dark font-medium bg-green-50 px-2 py-1 rounded">
                      50% off until January 31!
                    </span>
                  </div>
                </div>

                <ul className="space-y-4 flex-1 mb-8">
                  <li className="flex items-center gap-3">
                    <div className="bg-primary/10 p-1 rounded-full">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-medium">Everything in Basic</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="bg-primary/10 p-1 rounded-full">
                      <InfinityIcon className="w-4 h-4 text-primary" />
                    </div>
                    <span>Unlimited routine tasks</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="bg-primary/10 p-1 rounded-full">
                      <Star className="w-4 h-4 text-primary" />
                    </div>
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="bg-primary/10 p-1 rounded-full">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span>Early access to new features</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="bg-primary/10 p-1 rounded-full">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span>Support open source development ❤️</span>
                  </li>
                </ul>

                <Button
                  size="lg"
                  className="w-full bg-[#29abe0] hover:bg-[#29abe0]/90 text-white border-0"
                  asChild
                >
                  <Link href="https://ko-fi.com/plazen/tiers" target="_blank">
                    Subscribe on{" "}
                    <Image
                      src="https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png?_gl=1*jwum6k*_gcl_au*MTgyMzY1OTk3MS4xNzYyMjM5Mjcx*_ga*MjE0NDYzMzcxMi4xNzUzOTQ5NTU3*_ga_M13FZ7VQ2C*czE3NjQwOTU1MzEkbzYkZzEkdDE3NjQwOTkxMDgkajYwJGwwJGgw"
                      alt="Ko-fi logo"
                      width={20}
                      height={20}
                    />
                    Ko-fi
                  </Link>
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  *Please use your Plazen account email on Ko-fi
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
