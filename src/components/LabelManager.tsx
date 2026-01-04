"use client";

/**
 * LabelManager
 *
 * Small client-side UI used by admins/support staff to manage support labels.
 * Responsibilities:
 * - List existing labels fetched from `/api/support/labels`
 * - Create new labels (POST to `/api/support/labels`)
 * - Delete labels (DELETE to `/api/support/labels?id=...`)
 *
 * Notes on design:
 * - The component is intentionally minimal: it handles UI state and makes
 *   network requests to the server endpoints. All validation and persistence
 *   logic is delegated to the backend APIs.
 * - We keep optimistic UI updates minimal and always re-fetch after changes
 *   so the displayed list stays authoritative.
 */

import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Plus, Trash2, Tag } from "lucide-react";

/**
 * Label
 *
 * Minimal shape used by this component. Matches the server API contract
 * which returns an array of these label objects.
 */
type Label = {
  id: string;
  name: string;
  color: string;
};

/**
 * LabelManager component
 *
 * Renders a toggleable UI to manage support labels. The UI is hidden by default
 * and only fetches the label list on first open to reduce unnecessary network
 * requests.
 */
export function LabelManager() {
  // Local UI state ----------------------------------------------------------
  // List of labels returned by the server.
  const [labels, setLabels] = useState<Label[]>([]);
  // Inputs for creating a new label.
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#64748b");
  // Loading state used to disable inputs while requests are inflight.
  const [loading, setLoading] = useState(false);
  // Whether the label manager panel is visible.
  const [isOpen, setIsOpen] = useState(false);

  /**
   * fetchLabels
   *
   * Retrieve labels from the server and update local state. We keep this
   * simple: if the response is OK we parse JSON and set it; any failures are
   * left to higher-level error handling (server should return appropriate data).
   */
  const fetchLabels = async () => {
    const res = await fetch("/api/support/labels");
    if (res.ok) {
      const data = await res.json();
      setLabels(data);
    }
  };

  // Fetch labels lazily when the panel is opened.
  useEffect(() => {
    if (isOpen) fetchLabels();
  }, [isOpen]);

  /**
   * handleCreate
   *
   * Called when the create-label form is submitted:
   * - Prevent default form submission
   * - Validate input (non-empty name)
   * - POST the label to the server and refresh the list afterwards
   */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    setLoading(true);
    // Send label creation request. We send minimal payload expected by the API.
    await fetch("/api/support/labels", {
      method: "POST",
      body: JSON.stringify({ name: newLabel, color: newColor }),
    });
    // Clear input and refresh authoritative list from the server.
    setNewLabel("");
    await fetchLabels();
    setLoading(false);
  };

  /**
   * handleDelete
   *
   * Delete a label by id. This is a destructive action so show a confirmation
   * prompt to prevent accidental removals. After deletion, refresh the list.
   */
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This will remove this label from all tickets."))
      return;
    setLoading(true);
    await fetch(`/api/support/labels?id=${id}`, {
      method: "DELETE",
    });
    // Re-fetch to ensure UI is consistent with server state.
    await fetchLabels();
    setLoading(false);
  };

  // Render ------------------------------------------------------------------
  return (
    <div className="mb-8">
      {/* Toggle panel button: shows / hides the label manager UI */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="mb-4"
      >
        <Tag className="mr-2 h-4 w-4" />
        {isOpen ? "Hide Labels" : "Manage Labels"}
      </Button>

      {isOpen && (
        <div className="bg-card border rounded-lg p-4 max-w-md animate-in slide-in-from-top-2">
          <h3 className="font-semibold mb-4">Manage Support Labels</h3>

          {/* Create label form */}
          <form onSubmit={handleCreate} className="flex gap-2 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Label name (e.g., Bug)"
                value={newLabel}
                // Update local state while typing
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Color picker for label visual indicator */}
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-10 w-10 rounded cursor-pointer bg-transparent"
              title="Label Color"
            />
            <Button type="submit" disabled={loading || !newLabel.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {/* Label list */}
          <div className="space-y-2">
            {labels.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No labels created yet.
              </p>
            ) : (
              labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center justify-between p-2 bg-secondary/50 rounded-md group"
                >
                  <div className="flex items-center gap-3">
                    {/* Color preview dot for the label */}
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm font-medium">{label.name}</span>
                  </div>

                  {/* Delete button - hidden by default, appears on hover */}
                  <button
                    onClick={() => handleDelete(label.id)}
                    disabled={loading}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Delete label ${label.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
