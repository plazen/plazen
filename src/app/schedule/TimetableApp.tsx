"use client";

import React, { useState, useEffect, useCallback } from "react";
import Timetable from "@/app/components/Timetable";
import RescheduleModal from "@/app/components/RescheduleModal";
import SettingsModal from "@/app/components/SettingsModal";
import AddTaskModal from "@/app/components/AddTaskModal";
import LoadingSpinner from "@/app/components/LoadingSpinner";
import TimetableSkeleton from "@/app/components/TimetableSkeleton";
import { RoutineTasksManager } from "@/app/components/RoutineTasksManager";
import { Calendar } from "@/app/components/ui/calendar";
import { Button } from "@/app/components/ui/button";
import {
  PlusIcon,
  Settings,
  User2Icon,
  RefreshCw,
  AlertCircle,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { Theme } from "@/lib/theme";
import { PlazenLogo } from "@/components/plazen-logo";
import ReactMarkdown from "react-markdown";
import "../globals.css";

type Notification = {
  id: string;
  message: string | null;
  show: boolean;
};

const DISMISSED_NOTIFICATIONS_KEY = "plazen_dismissed_notifications";

export default function TimetableApp() {
  const [user, setUser] = useState<User | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const { setTheme } = useTheme();
  type Task = {
    id: string;
    title: string;
    is_time_sensitive: boolean;
    duration_minutes: number | null;
    scheduled_time: string | null;
    is_completed: boolean;
  };
  type Settings = {
    timetable_start: number;
    timetable_end: number;
    telegram_id: string | null;
    show_time_needle: boolean;
    theme: string;
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [reschedulingTask, setReschedulingTask] = useState<Task | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRoutineTasksOpen, setIsRoutineTasksOpen] = useState(false);

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [subscription, setSubscription] = useState<{
    isPro: boolean;
    endsAt: string | null;
    provider: string | null;
  } | null>(null);

  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<
    string[]
  >(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const stored = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Track the current date string to avoid updating tasks for stale dates
  const currentDateRef = React.useRef<string>("");

  // Simple sessionStorage-based cache for tasks per date (TTL: 5 minutes)
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const getCacheKey = (dateString: string) => `plazen_tasks_${dateString}`;

  const getCachedTasksForDate = (dateString: string) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(getCacheKey(dateString));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Date.now() - (parsed.ts || 0) > CACHE_TTL_MS) {
        // expired
        sessionStorage.removeItem(getCacheKey(dateString));
        return null;
      }
      return parsed.tasks ?? null;
    } catch (err) {
      // Corrupt data or unavailable - ignore cache
      return null;
    }
  };

  const setCachedTasksForDate = (dateString: string, tasksToCache: any[]) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        getCacheKey(dateString),
        JSON.stringify({ ts: Date.now(), tasks: tasksToCache }),
      );
    } catch (err) {
      // ignore storage errors
    }
  };

  const fetchTasks = useCallback(
    async (selectedDate: Date, skipSync = false) => {
      setTasksLoading(true);
      try {
        const year = selectedDate.getFullYear();
        const month = (selectedDate.getMonth() + 1).toString().padStart(2, "0");
        const day = selectedDate.getDate().toString().padStart(2, "0");
        const dateString = `${year}-${month}-${day}`;
        const timezoneOffset = new Date().getTimezoneOffset();

        // Update the ref to track the current date being fetched
        currentDateRef.current = dateString;

        // If we have a recent cached copy in sessionStorage, use it immediately
        const cached = getCachedTasksForDate(dateString);
        if (cached) {
          if (currentDateRef.current === dateString) {
            setTasks(cached);
          }
          setTasksLoading(false);

          // Fire a background refresh to keep cache up-to-date (non-blocking)
          (async () => {
            try {
              const response = await fetch(
                `/api/tasks?date=${dateString}&timezoneOffset=${timezoneOffset}`,
              );
              if (response.ok) {
                const fetchedTasks = await response.json();
                setCachedTasksForDate(dateString, fetchedTasks);
                if (currentDateRef.current === dateString) {
                  setTasks(fetchedTasks);
                }
              }
            } catch (err) {
              console.error("Failed background fetch tasks:", err);
            }
          })();

          // Still trigger calendar sync in the background if requested
          if (!skipSync) {
            fetch("/api/calendars/sync-all", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // Pass timezoneOffset so the server knows the exact local 24h window
              body: JSON.stringify({ date: dateString, timezoneOffset }),
            })
              .then((syncResponse) => {
                if (syncResponse.ok) {
                  return syncResponse.json();
                }
                return null;
              })
              .then((syncResult) => {
                // Only refetch if sync was successful and had calendar sources
                // AND the user is still viewing the same date
                if (
                  syncResult &&
                  syncResult.synced > 0 &&
                  currentDateRef.current === dateString
                ) {
                  // Refetch tasks to get updated external events (skip sync to avoid loop)
                  fetch(
                    `/api/tasks?date=${dateString}&timezoneOffset=${timezoneOffset}`,
                  )
                    .then((res) => (res.ok ? res.json() : null))
                    .then((updatedTasks) => {
                      // Double-check the date is still current before updating
                      if (
                        updatedTasks &&
                        currentDateRef.current === dateString
                      ) {
                        setTasks(updatedTasks);
                        setCachedTasksForDate(dateString, updatedTasks);
                      }
                    })
                    .catch((err) => {
                      console.error("Failed to refetch tasks after sync:", err);
                    });
                }
              })
              .catch((err) => {
                console.error("Failed to sync calendars:", err);
              });
          }

          return;
        }

        // No valid cache, fetch from server
        const response = await fetch(
          `/api/tasks?date=${dateString}&timezoneOffset=${timezoneOffset}`,
        );
        if (!response.ok) {
          throw new Error("Failed to fetch tasks");
        }
        const fetchedTasks = await response.json();

        // Cache the fresh result
        setCachedTasksForDate(dateString, fetchedTasks);

        // Only update if this is still the current date
        if (currentDateRef.current === dateString) {
          setTasks(fetchedTasks);
        }
        setTasksLoading(false);

        // Trigger background CalDAV/Google sync after displaying cached data
        if (!skipSync) {
          fetch("/api/calendars/sync-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Pass timezoneOffset so the server knows the exact local 24h window
            body: JSON.stringify({ date: dateString, timezoneOffset }),
          })
            .then((syncResponse) => {
              if (syncResponse.ok) {
                return syncResponse.json();
              }
              return null;
            })
            .then((syncResult) => {
              // Only refetch if sync was successful and had calendar sources
              // AND the user is still viewing the same date
              if (
                syncResult &&
                syncResult.synced > 0 &&
                currentDateRef.current === dateString
              ) {
                // Refetch tasks to get updated external events (skip sync to avoid loop)
                fetch(
                  `/api/tasks?date=${dateString}&timezoneOffset=${timezoneOffset}`,
                )
                  .then((res) => (res.ok ? res.json() : null))
                  .then((updatedTasks) => {
                    // Double-check the date is still current before updating
                    if (updatedTasks && currentDateRef.current === dateString) {
                      setTasks(updatedTasks);
                      setCachedTasksForDate(dateString, updatedTasks);
                    }
                  })
                  .catch((err) => {
                    console.error("Failed to refetch tasks after sync:", err);
                  });
              }
            })
            .catch((err) => {
              console.error("Failed to sync calendars:", err);
            });
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
        setTasksLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const checkUserAndFetch = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login";
        return;
      }
      setUser(session.user);

      try {
        const settingsResponse = await fetch("/api/settings");
        const subscriptionResponse = await fetch("/api/subscription");
        if (subscriptionResponse.ok) {
          const fetchedSubscription = await subscriptionResponse.json();
          setSubscription(fetchedSubscription);
        }
        if (!settingsResponse.ok) {
          throw new Error("Failed to fetch settings");
        }
        const fetchedSettings = await settingsResponse.json();
        setSettings(fetchedSettings);

        // Sync theme with the settings
        if (fetchedSettings.theme) {
          setTheme(fetchedSettings.theme as Theme);
        }
        try {
          const notificationsResponse = await fetch("/api/notifications");
          if (notificationsResponse.ok) {
            const fetchedNotifications = await notificationsResponse.json();
            setNotifications(fetchedNotifications);
          }
        } catch (err) {
          console.error("Failed to fetch notifications:", err);
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      }
      setLoading(false);
    };
    checkUserAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (date && user) {
      fetchTasks(date);
    }
  }, [date, fetchTasks, user]);

  useEffect(() => {
    localStorage.setItem(
      DISMISSED_NOTIFICATIONS_KEY,
      JSON.stringify(dismissedNotificationIds),
    );
  }, [dismissedNotificationIds]);

  const toLocalISOString = (dateToFormat: Date) => {
    const year = dateToFormat.getFullYear();
    const month = (dateToFormat.getMonth() + 1).toString().padStart(2, "0");
    const day = dateToFormat.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleAddTask = async (taskData: {
    title: string;
    isTimeSensitive: boolean;
    duration: number;
    scheduledTime: string;
  }) => {
    if (isAddingTask) return;
    setIsAddingTask(true);

    const isForToday = date
      ? new Date().toDateString() === date.toDateString()
      : true;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const localTimeString = `${now.getFullYear()}-${pad(
      now.getMonth() + 1,
    )}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(
      now.getMinutes(),
    )}:${pad(now.getSeconds())}`;
    let finalScheduledTime = null;
    if (taskData.isTimeSensitive && taskData.scheduledTime && date) {
      const [hours, minutes] = taskData.scheduledTime.split(":").map(Number);
      const combinedDate = new Date(date);
      combinedDate.setHours(hours, minutes, 0, 0);
      const year = combinedDate.getFullYear();
      const month = (combinedDate.getMonth() + 1).toString().padStart(2, "0");
      const day = combinedDate.getDate().toString().padStart(2, "0");
      const hour = combinedDate.getHours().toString().padStart(2, "0");
      const minute = combinedDate.getMinutes().toString().padStart(2, "0");
      const second = combinedDate.getSeconds().toString().padStart(2, "0");
      finalScheduledTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    }

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskData.title,
          is_time_sensitive: taskData.isTimeSensitive,
          duration_minutes: Number(taskData.duration),
          scheduled_time: finalScheduledTime,
          user_current_time: localTimeString,
          for_date: toLocalISOString(date || new Date()),
          is_for_today: isForToday,
          timezone_offset: new Date().getTimezoneOffset(),
        }),
      });
      if (!response.ok) throw new Error("Failed to add task");
      const addedTask = await response.json();

      // Update tasks state and cache atomically
      const cacheDate = toLocalISOString(date || new Date());
      setTasks((prev) => {
        const updated = [...prev, addedTask];
        setCachedTasksForDate(cacheDate, updated);
        return updated;
      });

      setIsAddTaskModalOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleToggleDone = async (taskId: string, currentStatus: boolean) => {
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, is_completed: !currentStatus }),
      });
      if (!response.ok) throw new Error("Failed to update task status");
      const updatedTask = await response.json();

      const cacheDate = toLocalISOString(date || new Date());
      setTasks((prev) => {
        const updated = prev.map((task) =>
          task.id === taskId ? updatedTask : task,
        );
        setCachedTasksForDate(cacheDate, updated);
        return updated;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const cacheDate = toLocalISOString(date || new Date());
    setTasks((prev) => {
      const updated = prev.filter((task) => task.id !== taskId);
      setCachedTasksForDate(cacheDate, updated);
      return updated;
    });
    try {
      const response = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId }),
      });
      if (!response.ok) throw new Error("Failed to delete task");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    }
  };

  const handleOpenRescheduleModal = (task: Task) => setReschedulingTask(task);
  const handleCloseRescheduleModal = () => setReschedulingTask(null);

  const handleUpdateTaskTime = async (
    taskId: string,
    newTime: string,
    newTitle?: string,
  ) => {
    try {
      const requestBody: {
        id: string;
        scheduled_time: string;
        title?: string;
      } = {
        id: taskId,
        scheduled_time: newTime,
      };

      if (newTitle) {
        requestBody.title = newTitle;
      }

      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error("Failed to reschedule task");

      if (date) {
        await fetchTasks(date);
      }

      handleCloseRescheduleModal();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    }
  };

  const handleSaveSettings = async (newSettings: Settings) => {
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      if (!response.ok) throw new Error("Failed to save settings");
      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      setIsSettingsOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    }
  };
  const handleDismissNotification = (id: string) => {
    setDismissedNotificationIds((prev) => [...prev, id]);
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        <LoadingSpinner
          size="lg"
          text="Loading your workspace..."
          variant="dots"
        />
      </div>
    );
  }
  const activeNotifications = notifications.filter(
    (n) => !dismissedNotificationIds.includes(n.id),
  );

  return (
    <div className="font-lexend">
      <div className="min-h-screen bg-background text-foreground font-lexend antialiased">
        <header className="border-b border-border backdrop-blur-sm bg-background/95 sticky top-0 z-40">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center space-x-3">
                <PlazenLogo theme={settings?.theme} />
                <span className="text-xl font-semibold hidden sm:block">
                  Plazen
                  {subscription?.isPro && subscription?.endsAt && (
                    <span className="ml-2 text-sm font-normal text-primary">
                      Pro
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {subscription?.isPro && subscription?.endsAt ? (
                    <>
                      <span className="text-xl font-semibold text-foreground sm:hidden">
                        Plazen
                        <span className="ml-2 text-sm font-normal text-primary">
                          Pro
                        </span>
                      </span>
                      <span className="hidden sm:inline">
                        {date?.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </>
                  ) : (
                    date?.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCalendarOpen(true)}
                  className="h-9 w-9 lg:hidden"
                  title="View Calendar"
                >
                  <CalendarIcon className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsRoutineTasksOpen(true)}
                  className="h-9 w-9"
                  title="Routine Tasks"
                >
                  <span>
                    <RefreshCw />
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSettingsOpen(true)}
                  className="h-9 w-9"
                >
                  <span>
                    <Settings />
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => (window.location.href = "/account")}
                  className="h-9 w-9"
                >
                  <span>
                    <User2Icon />
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AnimatePresence>
            {activeNotifications.map((notification) => (
              <motion.div
                key={notification.id}
                layout
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -20, height: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="bg-blue-500/10 border border-blue-400/30 text-foreground dark:text-foreground rounded-lg p-4 mb-6 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-foreground dark:text-foreground" />
                  <div className="text-sm max-w-none notification-markdown">
                    {" "}
                    <ReactMarkdown>{notification.message || ""}</ReactMarkdown>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 text-foreground dark:text-foreground hover:bg-blue-400/20 hover:text-white"
                  onClick={() => handleDismissNotification(notification.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-destructive/20 border border-destructive text-destructive-foreground rounded-lg p-4 mb-6"
            >
              {error}
            </motion.div>
          )}

          <div className="flex flex-col lg:flex-row gap-8">
            <motion.div
              className="lg:w-80 flex-shrink-0 hidden lg:block"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="bg-card rounded-xl shadow-lg border border-border overflow-hidden">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="p-4 w-full"
                />
              </div>
            </motion.div>

            <motion.div
              className="flex-1 min-w-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            >
              {tasksLoading ? (
                <TimetableSkeleton
                  startHour={settings.timetable_start}
                  endHour={settings.timetable_end}
                />
              ) : (
                <Timetable
                  tasks={tasks}
                  settings={settings}
                  date={date || new Date()}
                  onToggleDone={handleToggleDone}
                  onDeleteTask={handleDeleteTask}
                  onReschedule={handleOpenRescheduleModal}
                />
              )}
            </motion.div>
          </div>

          <motion.div
            className="fixed bottom-6 right-6 z-50"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.5 }}
          >
            <Button
              onClick={() => setIsAddTaskModalOpen(true)}
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow bg-primary hover:bg-primary/90"
            >
              <PlusIcon className="h-6 w-6" />
            </Button>
          </motion.div>
        </main>

        <AnimatePresence>
          {isCalendarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                onClick={() => setIsCalendarOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 40 }}
                className="fixed top-0 left-0 bottom-0 z-50 w-80 max-w-[calc(100vw-4rem)] bg-card border-r border-border shadow-2xl lg:hidden"
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Calendar</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCalendarOpen(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(newDate) => {
                    setDate(newDate);
                    setIsCalendarOpen(false);
                  }}
                  className="p-4 w-full"
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AddTaskModal
          isOpen={isAddTaskModalOpen}
          onClose={() => setIsAddTaskModalOpen(false)}
          onSubmit={handleAddTask}
          isLoading={isAddingTask}
        />

        {reschedulingTask && (
          <RescheduleModal
            task={reschedulingTask}
            onClose={handleCloseRescheduleModal}
            onSave={handleUpdateTaskTime}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            currentSettings={settings}
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleSaveSettings}
          />
        )}

        {isRoutineTasksOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-background rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Routine Tasks</h2>
                  <Button
                    variant="ghost"
                    onClick={() => setIsRoutineTasksOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </Button>
                </div>
                <RoutineTasksManager
                  isProPlan={subscription?.isPro !== false}
                  onClose={() => {
                    setIsRoutineTasksOpen(false);
                    // Refresh tasks when routine tasks are generated
                    if (date) {
                      fetchTasks(date);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
