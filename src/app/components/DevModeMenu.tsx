"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import { Wrench, X, Sparkles, Shield, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DevModeMenuProps {
  onRoutineTasksGenerated?: () => void;
}

interface DevSettings {
  isAdmin: boolean;
  isSubscribed: boolean;
}

export function DevModeMenu({ onRoutineTasksGenerated }: DevModeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<DevSettings>({
    isAdmin: true,
    isSubscribed: true,
  });
  const [loading, setLoading] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Fetch current dev settings on mount
  useEffect(() => {
    fetchDevSettings();
  }, []);

  const fetchDevSettings = async () => {
    try {
      const response = await fetch("/api/dev/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch dev settings:", error);
    }
  };

  const handleToggleAdmin = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dev/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !settings.isAdmin }),
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setMessage(`Admin status: ${data.isAdmin ? "enabled" : "disabled"}`);
      }
    } catch (error) {
      console.error("Failed to toggle admin:", error);
      setMessage("Failed to update admin status");
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const handleToggleSubscription = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dev/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSubscribed: !settings.isSubscribed }),
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setMessage(
          `Subscription: ${data.isSubscribed ? "Pro enabled" : "Free plan"}`,
        );
      }
    } catch (error) {
      console.error("Failed to toggle subscription:", error);
      setMessage("Failed to update subscription");
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const handleGenerateRoutineTasks = async () => {
    setGeneratingTasks(true);
    try {
      // First, get all routine tasks
      const routineResponse = await fetch("/api/routine-tasks");
      if (!routineResponse.ok) {
        throw new Error("Failed to fetch routine tasks");
      }
      const routineTasks = await routineResponse.json();

      if (routineTasks.length === 0) {
        setMessage("No routine tasks to generate");
        setGeneratingTasks(false);
        setTimeout(() => setMessage(null), 2000);
        return;
      }

      // Get active routine task IDs
      const activeTaskIds = routineTasks
        .filter((task: { is_active: boolean }) => task.is_active)
        .map((task: { id: string }) => task.id);

      if (activeTaskIds.length === 0) {
        setMessage("No active routine tasks to generate");
        setGeneratingTasks(false);
        setTimeout(() => setMessage(null), 2000);
        return;
      }

      // Generate routine tasks for today
      const today = new Date();
      const dateString = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const response = await fetch("/api/routine-tasks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateString,
          selectedRoutineTaskIds: activeTaskIds,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(result.message);
        onRoutineTasksGenerated?.();
      } else {
        const error = await response.json();
        setMessage(error.error || "Failed to generate tasks");
      }
    } catch (error) {
      console.error("Failed to generate routine tasks:", error);
      setMessage("Failed to generate routine tasks");
    } finally {
      setGeneratingTasks(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            className="bg-card border border-amber-500/30 rounded-2xl shadow-2xl p-6 max-w-md w-full my-auto max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Dev Mode</h3>
                  <p className="text-sm text-muted-foreground">
                    Development settings
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              {/* Admin Toggle */}
              <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Admin Status</p>
                    <p className="text-sm text-muted-foreground">
                      Access admin features
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.isAdmin}
                  onClick={handleToggleAdmin}
                  disabled={loading}
                />
              </div>

              {/* Subscription Toggle */}
              <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="font-medium">Pro Subscription</p>
                    <p className="text-sm text-muted-foreground">
                      Enable pro features
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.isSubscribed}
                  onClick={handleToggleSubscription}
                  disabled={loading}
                />
              </div>

              {/* Generate Routine Tasks */}
              <div className="p-4 bg-secondary/50 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Calendar className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium">Generate Routine Tasks</p>
                    <p className="text-sm text-muted-foreground">
                      Create tasks from active routines for today
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateRoutineTasks}
                  disabled={generatingTasks}
                  className="w-full"
                  variant="outline"
                >
                  {generatingTasks ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 mr-2" />
                      Generate for Today
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Status Message */}
            <AnimatePresence>
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-center"
                >
                  {message}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                DEV_MODE is enabled. Data is stored in memory.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* Dev Mode Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="h-9 w-9 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
        title="Dev Mode Menu"
      >
        <Wrench className="h-5 w-5" />
      </Button>

      {/* Render modal in portal to escape header stacking context */}
      {typeof window !== "undefined" &&
        createPortal(modalContent, document.body)}
    </>
  );
}
