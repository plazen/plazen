"use client";

import React, { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Slider } from "@/app/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { X, PlusIcon } from "lucide-react";

const durationSteps = [
  15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
];

const formatDuration = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = minutes / 60;
  return `${hours} hour${hours > 1 ? "s" : ""}`;
};

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: {
    title: string;
    isTimeSensitive: boolean;
    duration: number;
    scheduledTime: string;
  }) => void;
  isLoading: boolean;
  initialTime?: string;
}

export default function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  initialTime,
}: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [isTimeSensitive, setIsTimeSensitive] = useState(true);
  const [duration, setDuration] = useState(30);
  const [scheduledTime, setScheduledTime] = useState("");

  // Set initial time when modal opens with a time value
  React.useEffect(() => {
    if (isOpen && initialTime) {
      setScheduledTime(initialTime);
      setIsTimeSensitive(true);
    }
  }, [isOpen, initialTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSubmit({
      title,
      isTimeSensitive,
      duration,
      scheduledTime,
    });

    // Reset form
    setTitle("");
    setIsTimeSensitive(false);
    setDuration(30);
    setScheduledTime("");
  };

  const handleClose = () => {
    onClose();
    // Reset form when closing
    setTitle("");
    setIsTimeSensitive(false);
    setDuration(30);
    setScheduledTime("");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="bg-card rounded-xl shadow-2xl border border-border max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">
              Add New Task
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label
                htmlFor="task-title"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Task Title
              </label>
              <input
                type="text"
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl bg-input border border-border text-foreground px-3 py-2 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
                placeholder="e.g., Water the plants"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-foreground">
                  Time Sensitive?
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  Schedule at a specific time
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTimeSensitive(!isTimeSensitive)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  isTimeSensitive ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isTimeSensitive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <AnimatePresence>
              {isTimeSensitive && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <label
                    htmlFor="scheduled-time"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
                    Start Time
                  </label>
                  <input
                    type="time"
                    id="scheduled-time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full rounded-xl bg-input border border-border text-foreground px-3 py-2 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-foreground">
                  Duration
                </label>
                <span className="text-sm font-semibold text-primary bg-primary/10 px-2 py-1 rounded-xl">
                  {formatDuration(duration)}
                </span>
              </div>
              <Slider
                min={0}
                max={durationSteps.length - 1}
                step={1}
                value={[durationSteps.indexOf(duration)]}
                onValueChange={(value) => setDuration(durationSteps[value[0]])}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>15 min</span>
                <span>6 hours</span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading || !title.trim()}
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <motion.div
                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                      Adding...
                    </motion.div>
                  ) : (
                    <motion.div
                      key="add"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add Task
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
