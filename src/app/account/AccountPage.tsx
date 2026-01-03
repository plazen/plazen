"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User, UserIdentity } from "@supabase/supabase-js";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { motion } from "framer-motion";
import { PlazenLogo } from "@/components/plazen-logo";
import Link from "next/link";
import {
  User as UserIcon,
  Settings,
  Calendar,
  BarChart3,
  Clock,
  Target,
  LogOut,
  Mail,
  Shield,
  Bell,
  Download,
  Trash2,
  Edit,
  Check,
  X,
  CreditCard,
  Crown,
  Loader2,
  Key,
  Link as LinkIcon,
  Unlink,
  AlertTriangle,
} from "lucide-react";
import { FaApple, FaDiscord, FaGoogle, FaGithub } from "react-icons/fa";
import Image from "next/image";
import Tooltip from "@/app/components/ui/tooltip";

const socialProviders = [
  {
    id: "github",
    icon: FaGithub,
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

const AVATAR_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET ?? "avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const STORAGE_SEGMENT = "/storage/v1/object/";

function deriveAvatarPathFromUrl(sourceUrl: string): string | null {
  try {
    const parsed = new URL(sourceUrl);
    if (!parsed.hostname.endsWith("supabase.co")) return null;

    const markerIndex = parsed.pathname.indexOf(STORAGE_SEGMENT);
    if (markerIndex === -1) return null;

    const remainder = parsed.pathname.slice(
      markerIndex + STORAGE_SEGMENT.length,
    );
    const parts = remainder.split("/").filter(Boolean);

    if (parts.length < 3) return null;

    const visibility = parts.shift();
    const bucket = parts.shift();

    if (visibility !== "public") return null;
    if (bucket !== AVATAR_BUCKET) return null;

    return parts.join("/");
  } catch (error) {
    console.error("Failed to derive avatar path from URL:", {
      error,
      sourceUrl,
    });
    return null;
  }
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    dailyStreak: 0,
    avgTaskDuration: 0,
  });

  const [subscription, setSubscription] = useState<{
    isPro: boolean;
    endsAt?: string;
    provider?: string;
  } | null>(null);

  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [tempDisplayName, setTempDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [notifications, setNotifications] = useState({
    notifications: true,
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(
    null,
  );

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeMessage, setEmailChangeMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [connectedIdentities, setConnectedIdentities] = useState<
    UserIdentity[]
  >([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(
    null,
  );
  const [disconnectingProvider, setDisconnectingProvider] = useState<
    string | null
  >(null);
  const [connectionMessage, setConnectionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  // Calendar sources state
  const [calendarSources, setCalendarSources] = useState<
    { id: string; type: string; name?: string; url?: string }[]
  >([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Account page client-side cache helpers (sessionStorage, TTL 5 minutes)
  const ACCOUNT_CACHE_TTL_MS = 5 * 60 * 1000;
  const accountCacheKey = (name: string) => `plazen_account_${name}`;

  const readCache = (name: string) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(accountCacheKey(name));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Date.now() - (parsed.ts || 0) > ACCOUNT_CACHE_TTL_MS) {
        sessionStorage.removeItem(accountCacheKey(name));
        return null;
      }
      return parsed.value ?? null;
    } catch (err) {
      console.error("Account cache read error:", err);
      return null;
    }
  };

  const writeCache = (name: string, value: any) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        accountCacheKey(name),
        JSON.stringify({ ts: Date.now(), value }),
      );
    } catch (err) {
      console.error("Account cache write error:", err);
    }
  };

  const invalidateCache = (name: string) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(accountCacheKey(name));
    } catch (err) {
      console.error("Account cache invalidate error:", err);
    }
  };

  const fetchAvatarSignedUrl = useCallback(async (path: string) => {
    try {
      const response = await fetch(
        `/api/account/avatar/signed-url?path=${encodeURIComponent(path)}`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch signed avatar URL (${response.status}).`,
        );
      }

      const data = (await response.json()) as { url?: string };

      if (!data.url) {
        throw new Error("Signed avatar URL response missing 'url'.");
      }

      setAvatarUrl(data.url);
      return data.url;
    } catch (error) {
      console.error("Failed to retrieve signed avatar URL:", {
        error,
        path,
      });
      return null;
    }
  }, []);

  const fetchCalendarSources = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const res = await fetch("/api/calendars");
      if (!res.ok) {
        // treat as no sources, but log
        console.error("Failed to fetch calendar sources", res.status);
        setCalendarSources([]);
      } else {
        const data = await res.json();
        setCalendarSources(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch calendar sources:", err);
      setCalendarSources([]);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadAccountData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setUser(session.user);
        setDisplayName(
          session.user.user_metadata?.display_name ||
            session.user.email?.split("@")[0] ||
            "",
        );
        setTempDisplayName(
          session.user.user_metadata?.display_name ||
            session.user.email?.split("@")[0] ||
            "",
        );

        if (session.user.identities) {
          setConnectedIdentities(session.user.identities);
        }

        const metadata = session.user.user_metadata ?? {};
        const storedPath =
          typeof metadata.avatar_path === "string"
            ? metadata.avatar_path
            : null;

        if (storedPath) {
          await fetchAvatarSignedUrl(storedPath);
        } else {
          const fallbackUrl =
            typeof metadata.avatar_url === "string"
              ? metadata.avatar_url
              : null;

          if (!fallbackUrl) {
            setAvatarUrl(null);
          } else {
            const derivedPath = deriveAvatarPathFromUrl(fallbackUrl);

            if (derivedPath) {
              const signedUrl = await fetchAvatarSignedUrl(derivedPath);

              if (!signedUrl) {
                setAvatarUrl(fallbackUrl);
              } else {
                try {
                  const { error: persistError } =
                    await supabase.auth.updateUser({
                      data: { avatar_path: derivedPath },
                    });

                  if (persistError) {
                    throw persistError;
                  }

                  setUser((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      user_metadata: {
                        ...prev.user_metadata,
                        avatar_path: derivedPath,
                      },
                    } as User;
                  });
                } catch (error) {
                  console.error(
                    "Failed to persist derived avatar path to Supabase:",
                    error,
                  );
                }
              }
            } else {
              setAvatarUrl(fallbackUrl);
            }
          }
        }

        await Promise.all([
          fetchSettings(),
          fetchStats(),
          fetchSubscription(),
          fetchCalendarSources(),
        ]);
        // Try to read cached account data (non-blocking, show immediately if present)
        const cachedSettings = readCache("settings");
        const cachedStats = readCache("stats");
        const cachedSubscription = readCache("subscription");

        if (cachedSettings) {
          setNotifications({
            notifications: cachedSettings.notifications ?? true,
          });
        }
        if (cachedStats) {
          setStats(cachedStats);
        }
        if (cachedSubscription) {
          setSubscription(cachedSubscription);
        }

        // Background refresh to keep cache fresh. Each fetch returns its data which we persist.
        (async () => {
          try {
            const [freshSettings, freshStats, freshSubscription] =
              await Promise.all([
                fetchSettings(),
                fetchStats(),
                fetchSubscription(),
              ]);
            if (freshSettings) writeCache("settings", freshSettings);
            if (freshStats) writeCache("stats", freshStats);
            if (freshSubscription)
              writeCache("subscription", freshSubscription);
          } catch (err) {
            console.error("Failed background refresh of account data:", err);
          }
        })();
      } else {
        router.push("/login");
      }
      setLoading(false);
    };

    loadAccountData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAvatarSignedUrl, router, supabase.auth, fetchCalendarSources]);

  // Read URL query params to detect OAuth status from callback and show user-friendly messages.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const params = url.searchParams;
    const linked = params.get("google_linked");
    const linkError = params.get("google_link_error");

    if (linked) {
      setConnectionMessage({
        type: "success",
        text: "Google Calendar linked successfully. Initial sync has been started.",
      });
      // refresh calendar sources to reflect the new linked calendar
      fetchCalendarSources().catch(() => {});
    } else if (linkError) {
      const readable = decodeURIComponent(linkError);
      setConnectionMessage({
        type: "error",
        text: `Failed to link Google Calendar: ${readable}`,
      });
    }

    // Remove handled params from URL so message doesn't reappear on refresh.
    if (linked || linkError) {
      params.delete("google_linked");
      params.delete("google_link_error");
      const newSearch = params.toString();
      const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ""}${
        url.hash || ""
      }`;
      window.history.replaceState({}, "", newUrl);
      // ensure connectingCalendar resets if it was set (we're now on account page)
      setConnectingCalendar(false);
    }
    // intentionally not listing fetchCalendarSources in deps to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await fetch("/api/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
        return data;
      }
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
    }
    return null;
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const data = await response.json();
        setNotifications({ notifications: data.notifications ?? true });
        return data;
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
    return null;
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/tasks");
      if (response.ok) {
        const tasks = await response.json();
        const completed = tasks.filter(
          (t: { is_completed: boolean }) => t.is_completed,
        ).length;

        const avgDuration =
          tasks.length > 0
            ? Math.round(
                tasks.reduce(
                  (acc: number, t: { duration_minutes?: number }) =>
                    acc + (t.duration_minutes || 60),
                  0,
                ) / tasks.length,
              )
            : 60;

        const computedStats = {
          totalTasks: tasks.length,
          completedTasks: completed,
          dailyStreak: calculateDailyStreak(tasks),
          avgTaskDuration: avgDuration,
        };

        setStats(computedStats);
        return computedStats;
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
    return null;
  };

  const calculateDailyStreak = (
    tasks: { is_completed: boolean; scheduled_time: string | null }[],
  ) => {
    if (!tasks.length) return 0;

    const completedDays = new Set<string>();

    // Use the ISO date portion (YYYY-MM-DD) directly from the scheduled_time string
    // to avoid timezone shifts caused by Date parsing and local/UTC conversions.
    tasks.forEach((task) => {
      if (!task.is_completed || !task.scheduled_time) return;
      const iso = String(task.scheduled_time);
      const dayKey = iso.split("T")[0]; // safe even if scheduled_time already is a date string
      if (dayKey) completedDays.add(dayKey);
    });

    let streak = 0;

    const getLocalYYYYMMDD = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;

    // Start from today's local date (YYYY-MM-DD) to match how external events are adjusted
    // and how scheduled_time date parts are produced on the server.
    const todayKey = getLocalYYYYMMDD(new Date());
    let cursorKey = todayKey;

    while (true) {
      if (completedDays.has(cursorKey)) {
        streak++;
        // Move cursor one day back preserving local-date arithmetic
        const d = new Date(`${cursorKey}T00:00:00`);
        d.setDate(d.getDate() - 1);
        cursorKey = getLocalYYYYMMDD(d);
      } else {
        break;
      }
    }

    return streak;
  };

  const handleUpdateDisplayName = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: tempDisplayName },
      });
      if (!error) {
        setDisplayName(tempDisplayName);
        setEditingDisplayName(false);
      }
    } catch (error) {
      console.error("Failed to update display name:", error);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || newEmail === user?.email) {
      setEmailChangeMessage({
        type: "error",
        text: "Please enter a new email address.",
      });
      return;
    }

    setEmailChangeLoading(true);
    setEmailChangeMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) throw error;

      setEmailChangeMessage({
        type: "success",
        text: "A confirmation email has been sent to your new email address. Please check your inbox.",
      });
      setIsEditingEmail(false);
      setNewEmail("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update email.";
      setEmailChangeMessage({ type: "error", text: message });
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setPasswordChangeMessage({
        type: "error",
        text: "Please fill in all password fields.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordChangeMessage({
        type: "error",
        text: "New passwords do not match.",
      });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeMessage({
        type: "error",
        text: "Password must be at least 6 characters long.",
      });
      return;
    }

    setPasswordChangeLoading(true);
    setPasswordChangeMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordChangeMessage({
        type: "success",
        text: "Password updated successfully!",
      });
      setIsChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update password.";
      setPasswordChangeMessage({ type: "error", text: message });
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleConnectProvider = async (providerId: string) => {
    setConnectingProvider(providerId);
    setConnectionMessage(null);

    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: providerId as "github" | "google" | "discord",
        options: {
          redirectTo: `${window.location.origin}/account`,
        },
      });

      if (error) throw error;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect account.";
      setConnectionMessage({ type: "error", text: message });
      setConnectingProvider(null);
    }
  };

  const handleLinkGoogleCalendar = async () => {
    setConnectingCalendar(true);
    setConnectionMessage(null);

    try {
      const res = await fetch("/api/google/oauth/start");
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to start Google OAuth (${res.status}) ${text}`);
      }

      const data = await res.json();
      if (!data || !data.url) {
        throw new Error("Server did not return an OAuth URL.");
      }

      // Redirect user to Google's OAuth consent screen
      window.location.href = data.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start Google OAuth.";
      setConnectionMessage({ type: "error", text: message });
      setConnectingCalendar(false);
    }
  };

  const handleUnlinkCalendar = async (id: string) => {
    if (!id) return;
    setConnectionMessage(null);
    try {
      const res = await fetch(`/api/calendars/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          `Failed to remove calendar (${res.status}) ${txt || ""}`.trim(),
        );
      }
      setConnectionMessage({
        type: "success",
        text: "Calendar connection removed.",
      });
      await fetchCalendarSources();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to unlink calendar.";
      setConnectionMessage({ type: "error", text: message });
    }
  };

  const handleDisconnectProvider = async (identity: UserIdentity) => {
    const hasPasswordAuth = connectedIdentities.some(
      (id) => id.provider === "email",
    );
    if (connectedIdentities.length <= 1 && !hasPasswordAuth) {
      setConnectionMessage({
        type: "error",
        text: "You must have at least one login method. Add a password or connect another account first.",
      });
      return;
    }

    setDisconnectingProvider(identity.provider);
    setConnectionMessage(null);

    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);

      if (error) throw error;

      setConnectedIdentities((prev) =>
        prev.filter((id) => id.identity_id !== identity.identity_id),
      );
      setConnectionMessage({
        type: "success",
        text: `${identity.provider.charAt(0).toUpperCase() + identity.provider.slice(1)} account disconnected.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to disconnect account.";
      setConnectionMessage({ type: "error", text: message });
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleUpdateNotifications = async (
    key: "email_updates" | "notifications",
    value: boolean,
  ) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error("Failed to update settings");

      // Invalidate cached settings so next visit / background refresh will fetch fresh settings
      invalidateCache("settings");
    } catch (error) {
      console.error("Failed to save settings:", error);
      setNotifications((prev) => ({ ...prev, [key]: !value }));
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch("/api/tasks");
      if (response.ok) {
        const tasks = await response.json();
        const dataStr = JSON.stringify(tasks, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "plazen-export.json";
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to export data:", error);
    }
  };

  const handleAvatarFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (!user) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!AVATAR_BUCKET) {
      setAvatarUploadError("Avatar bucket is not configured.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarUploadError("Avatar must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadError(null);

    try {
      const fileExt = (file.name.split(".").pop() ?? "png").toLowerCase();

      const uploadUrlResponse = await fetch("/api/account/avatar/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileExt,
          contentType: file.type || undefined,
        }),
      });

      if (!uploadUrlResponse.ok) {
        const errorPayload = await uploadUrlResponse.json().catch(() => ({}));
        const fallbackMessage =
          typeof errorPayload.error === "string"
            ? errorPayload.error
            : "Failed to request upload URL.";
        throw new Error(fallbackMessage);
      }

      const uploadData = (await uploadUrlResponse.json()) as {
        filePath?: string;
        token?: string;
      };

      if (!uploadData.filePath || !uploadData.token) {
        throw new Error("Upload URL response was missing required data.");
      }

      const uploadOptions: {
        cacheControl: string;
        upsert: boolean;
        contentType?: string;
      } = {
        cacheControl: "3600",
        upsert: true,
      };

      if (file.type) {
        uploadOptions.contentType = file.type;
      }

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .uploadToSignedUrl(
          uploadData.filePath,
          uploadData.token,
          file,
          uploadOptions,
        );

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_path: uploadData.filePath },
      });

      if (updateError) throw updateError;

      await fetchAvatarSignedUrl(uploadData.filePath);
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          user_metadata: {
            ...prev.user_metadata,
            avatar_path: uploadData.filePath,
          },
        } as User;
      });
    } catch (error) {
      const baseMessage = "Failed to upload avatar.";
      let details = "";

      if (typeof error === "string") {
        details = error;
      } else if (error && typeof error === "object") {
        const maybeError = error as {
          message?: string;
          statusCode?: number;
          name?: string;
        };

        const parts = [] as string[];
        if (maybeError.statusCode)
          parts.push(`status ${maybeError.statusCode}`);
        if (maybeError.name) parts.push(maybeError.name);
        if (maybeError.message) parts.push(maybeError.message);
        details = parts.join(" • ");
      }

      const guidance =
        "Please try again in a moment or contact support if the problem continues.";
      const message = [baseMessage, details, guidance]
        .filter(Boolean)
        .join(" ");

      console.error("Avatar upload failed:", {
        error,
        bucket: AVATAR_BUCKET,
        userId: user?.id,
        fileName: file.name,
      });
      setAvatarUploadError(message);
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleDeleteAccount = () => {
    setDeleteError(null);
    setDeleteConfirmation("");
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteAccount = async () => {
    if (!user?.id || isDeletingAccount || deleteConfirmation !== "DELETE") {
      return;
    }

    setIsDeletingAccount(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to delete account");
      }

      setIsDeleteDialogOpen(false);
      setDeleteConfirmation("");
      await supabase.auth.signOut();
      router.push("/login");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Account deletion failed. Please try again.";
      console.error("Deletion failed:", error);
      setDeleteError(message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const completionRate =
    stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0;

  const googleSource = calendarSources.find((s) => s.type === "google");
  const isGoogleLinked = !!googleSource;

  return (
    <div className="min-h-screen bg-background text-foreground font-lexend">
      <header className="border-b border-border backdrop-blur-sm bg-background/95 sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => router.push("/schedule")}
          >
            <PlazenLogo />
            <span className="text-xl font-semibold">Plazen</span>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/schedule")}
            className="gap-2"
          >
            <Calendar className="w-4 h-4" />
            Back to Schedule
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="bg-card rounded-xl shadow-sm border border-border p-8 mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Avatar"
                      width={64}
                      height={64}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-16
 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center"
                    >
                      <UserIcon className="w-8 h-8 text-white" />
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border border-border"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    title="Upload new avatar"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Edit className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                <div>
                  <div className="flex items-center gap-2 h-8">
                    {editingDisplayName ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="text-xl font-bold bg-input border border-border rounded px-2 py-1 h-8 w-48"
                          value={tempDisplayName}
                          onChange={(e) => setTempDisplayName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleUpdateDisplayName()
                          }
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleUpdateDisplayName}
                          className="h-8 w-8 p-0"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingDisplayName(false)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h1 className="text-2xl font-bold">{displayName}</h1>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingDisplayName(true)}
                          className="h-8 w-8 p-0 opacity-50 hover:opacity-100"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4" /> {user.email}
                    </p>

                    {/* Copy ID button moved to Member Since area to avoid shrinking avatar on small screens */}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                  {avatarUploadError && (
                    <p className="mt-2 text-xs text-destructive">
                      {avatarUploadError}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-left md:text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Member Since
                </p>
                <p className="font-medium">
                  {new Date(user.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>

                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!user?.id) return;
                      try {
                        await navigator.clipboard.writeText(user.id);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      } catch (err) {
                        setCopiedId(false);
                      }
                    }}
                    className="h-7 px-2"
                  >
                    {copiedId ? (
                      <>
                        <Check className="w-4 h-4 mr-2" /> Copied!
                      </>
                    ) : (
                      <>
                        <UserIcon className="w-4 h-4 mr-2" /> Copy ID
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 mb-6 relative overflow-hidden">
            {subscription?.isPro && (
              <div className="absolute -top-6 -right-6 p-4 opacity-[0.03] pointer-events-none">
                <Crown className="w-48 h-48" />
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Subscription Plan
                </h3>
                <p className="text-muted-foreground mt-1">
                  {subscription?.isPro
                    ? "You are currently on the Pro plan. Thank you for supporting Plazen!"
                    : "You are currently on the Free plan."}
                </p>
                {subscription?.isPro && subscription?.endsAt && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Expires on{" "}
                    {new Date(subscription.endsAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button
                variant={subscription?.isPro ? "outline" : "default"}
                className={
                  subscription?.isPro
                    ? "border-primary/20 text-primary hover:bg-primary/5"
                    : ""
                }
                asChild
              >
                {subscription?.isPro ? (
                  <Link href="https://ko-fi.com/plazen">
                    Manage Subscription
                  </Link>
                ) : (
                  <Link href="/pricing">Upgrade to Pro</Link>
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Tasks"
              value={stats.totalTasks}
              icon={Target}
              color="text-blue-500"
            />
            <StatCard
              label="Completed"
              value={stats.completedTasks}
              icon={Check}
              color="text-green-500"
            />
            <StatCard
              label="Day Streak"
              value={stats.dailyStreak}
              icon={BarChart3}
              color="text-orange-500"
            />
            <StatCard
              label="Avg Duration"
              value={`${stats.avgTaskDuration}m`}
              icon={Clock}
              color="text-purple-500"
            />
          </div>

          <div className="bg-card rounded-xl border border-border p-6 mb-6">
            <div className="flex justify-between items-end mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Task Completion Rate
              </h3>
              <span className="text-xl font-bold">
                {completionRate.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completionRate}%` }}
                className="bg-gradient-to-r from-blue-500 to-primary h-full rounded-full"
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 mb-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Security & Account
            </h3>

            <div className="mb-6 pb-6 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email Address
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {user.email}
                  </p>
                </div>
                {!isEditingEmail && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingEmail(true);
                      setEmailChangeMessage(null);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" /> Change
                  </Button>
                )}
              </div>

              {isEditingEmail && (
                <div className="space-y-3 mt-4">
                  <Input
                    type="email"
                    placeholder="Enter new email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleUpdateEmail}
                      disabled={emailChangeLoading}
                      size="sm"
                    >
                      {emailChangeLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditingEmail(false);
                        setNewEmail("");
                        setEmailChangeMessage(null);
                      }}
                    >
                      <X className="w-4 h-4 mr-2" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {emailChangeMessage && (
                <div
                  className={`mt-3 text-sm p-3 rounded-md ${
                    emailChangeMessage.type === "success"
                      ? "bg-green-500/10 text-green-600 border border-green-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {emailChangeMessage.text}
                </div>
              )}
            </div>

            <div className="mb-6 pb-6 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium flex items-center gap-2">
                    <Key className="w-4 h-4" /> Password
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Update your password to keep your account secure
                  </p>
                </div>
                {!isChangingPassword && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsChangingPassword(true);
                      setPasswordChangeMessage(null);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" /> Change
                  </Button>
                )}
              </div>

              {isChangingPassword && (
                <div className="space-y-3 mt-4">
                  <Input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleChangePassword}
                      disabled={passwordChangeLoading}
                      size="sm"
                    >
                      {passwordChangeLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Update Password
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsChangingPassword(false);
                        setNewPassword("");
                        setConfirmPassword("");
                        setPasswordChangeMessage(null);
                      }}
                    >
                      <X className="w-4 h-4 mr-2" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {passwordChangeMessage && (
                <div
                  className={`mt-3 text-sm p-3 rounded-md ${
                    passwordChangeMessage.type === "success"
                      ? "bg-green-500/10 text-green-600 border border-green-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {passwordChangeMessage.text}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-medium flex items-center gap-2 mb-3">
                <LinkIcon className="w-4 h-4" /> Connected Accounts
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Connect additional accounts to sign in with different providers
              </p>

              <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> Google Calendar
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Link your Google Calendar to import events into Plazen.
                    </p>
                    {calendarLoading ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Checking calendar connection...
                      </p>
                    ) : isGoogleLinked ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Linked: {googleSource?.name ?? "Google Calendar"}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        Not linked
                      </p>
                    )}
                  </div>
                  <div>
                    {isGoogleLinked ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleUnlinkCalendar(googleSource!.id)}
                        >
                          <Unlink className="w-4 h-4 mr-2" /> Unlink
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleLinkGoogleCalendar}
                        disabled={connectingCalendar}
                      >
                        {connectingCalendar ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                            Connecting...
                          </>
                        ) : (
                          <>
                            <FaGoogle className="w-4 h-4 mr-2" /> Link Calendar
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {connectionMessage && (
                <div
                  className={`mb-4 text-sm p-3 rounded-md ${
                    connectionMessage.type === "success"
                      ? "bg-green-500/10 text-green-600 border border-green-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {connectionMessage.text}
                </div>
              )}

              <div className="space-y-3">
                {socialProviders.map((provider) => {
                  const Icon = provider.icon;
                  const connectedIdentity = connectedIdentities.find(
                    (id) => id.provider === provider.id,
                  );
                  const isConnected = !!connectedIdentity;
                  const isLoading =
                    connectingProvider === provider.id ||
                    disconnectingProvider === provider.id;

                  return (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${provider.bgColor} text-white`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          {isConnected &&
                            connectedIdentity.identity_data?.email && (
                              <p className="text-xs text-muted-foreground">
                                {
                                  connectedIdentity.identity_data
                                    .email as string
                                }
                              </p>
                            )}
                        </div>
                      </div>

                      {isConnected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleDisconnectProvider(connectedIdentity)
                          }
                          disabled={isLoading}
                          className="text-destructive hover:text-destructive"
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4 mr-2" />
                          )}
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnectProvider(provider.id)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <LinkIcon className="w-4 h-4 mr-2" />
                          )}
                          Connect
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5" /> Notifications
              </h3>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Task Reminders</label>
                <Switch
                  checked={notifications.notifications}
                  onCheckedChange={(val) =>
                    handleUpdateNotifications("notifications", val)
                  }
                />
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" /> Actions
              </h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={handleExportData}
                  className="w-full justify-start"
                >
                  <Download className="w-4 h-4 mr-2" /> Export My Data
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  className="w-full justify-start bg-red-700"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-destructive flex items-center gap-2">
                  <Shield className="w-5 h-5" /> Danger Zone
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete your account and all data.
                </p>
              </div>
              <Button variant="destructive" onClick={handleDeleteAccount}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Account
              </Button>
            </div>
          </div>
        </motion.div>
      </main>

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-destructive flex items-center gap-2">
              <Shield className="w-5 h-5" /> Confirm Account Deletion
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              This will permanently remove your tasks, routine templates,
              settings, subscriptions, and your account. This action cannot be
              undone.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Type <span className="font-semibold text-foreground">DELETE</span>{" "}
              below to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="Type DELETE to confirm"
              className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            {deleteError && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  if (!isDeletingAccount) {
                    setIsDeleteDialogOpen(false);
                    setDeleteConfirmation("");
                  }
                }}
                className="sm:min-w-[120px]"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeleteAccount}
                disabled={isDeletingAccount || deleteConfirmation !== "DELETE"}
                className="sm:min-w-[140px]"
              >
                {isDeletingAccount ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  "Delete Account"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col items-center text-center sm:items-start sm:text-left">
      <div
        className={`p-2 rounded-full bg-background border border-border mb-3 ${color}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide mt-1">
        {label}
      </span>
    </div>
  );
}

function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (c: boolean) => void;
}) {
  return (
    <button
      onClick={() => onCheckedChange(!checked)}
      aria-pressed={checked}
      className={`w-12 h-7 rounded-full p-1 transition-colors ${
        checked ? "bg-primary/80" : "bg-muted/60"
      }`}
    >
      <span
        className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
