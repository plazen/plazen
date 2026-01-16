"use client";

import { createBrowserClient } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FaApple, FaDiscord, FaGoogle } from "react-icons/fa";
import { Github, Mail } from "lucide-react";
import { PlazenLogo } from "@/components/plazen-logo";
import Link from "next/link";

const socialProviders = [
  {
    id: "github",
    icon: Github,
    bgColor: "bg-gray-900 hover:bg-gray-800",
    name: "GitHub",
  },
  {
    id: "google",
    icon: FaGoogle,
    bgColor: "bg-red-600 hover:bg-red-700",
    name: "Google",
  },
  {
    id: "discord",
    icon: FaDiscord,
    bgColor: "bg-indigo-600 hover:bg-indigo-700",
    name: "Discord",
  },
];

export default function LoginPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/schedule");
      }
      setSession(data.session);
    };
    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        if (session) {
          router.push("/");
        }
      },
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase.auth, router]);

  const handleSocialLogin = async (provider: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as "github" | "google" | "discord",
      });
      if (error) throw error;
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}`,
          },
        });
        if (error) throw error;
        alert("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (session) {
    return null; // Will redirect
  }

  return (
    <div className="font-lexend">
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto">
          <div className="flex justify-center mb-6">
            <PlazenLogo />
          </div>

          <div className="bg-card rounded-lg shadow-lg p-8 border border-border">
            <h1 className="text-2xl font-bold text-center mb-6 text-foreground">
              Welcome to Plazen
            </h1>

            {!showEmailForm ? (
              <>
                {/* Social Login Providers */}
                <div className="flex flex-row justify-center gap-10 mb-6">
                  {socialProviders.map((provider) => {
                    const Icon = provider.icon;
                    return (
                      <Button
                        key={provider.id}
                        variant="outline"
                        size="sm"
                        className={`h-12 w-12 p-0 ${provider.bgColor} border-0 text-white hover:text-white transition-all duration-200 hover:scale-105`}
                        onClick={() => handleSocialLogin(provider.id)}
                        disabled={loading}
                        title={`Sign in with ${provider.name}`}
                      >
                        <Icon className="h-5 w-5" />
                      </Button>
                    );
                  })}
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowEmailForm(true)}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Continue with Email
                </Button>
              </>
            ) : (
              <>
                {/* Email Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium mb-2"
                    >
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEmail(e.target.value)
                      }
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium"
                      >
                        Password
                      </label>
                      {!isSignUp && (
                        <Link
                          href="/forgot-password"
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Forgot password?
                        </Link>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setPassword(e.target.value)
                      }
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
                  </Button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setIsSignUp(!isSignUp)}
                  >
                    {isSignUp
                      ? "Already have an account? Sign in"
                      : "Don't have an account? Sign up"}
                  </button>
                </div>

                <div className="mt-4">
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowEmailForm(false)}
                  >
                    ← Back to social login
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
