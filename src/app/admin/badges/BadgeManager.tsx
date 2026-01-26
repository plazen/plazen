"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Trash2,
  Edit,
  Plus,
  X,
  Award,
  UserPlus,
  UserMinus,
  Search,
} from "lucide-react";
import { BadgeDisplay } from "@/app/components/BadgeDisplay";

type Badge = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  user_count?: number;
};

type UserBadge = {
  id: string;
  user_id: string;
  badge_id: string;
  granted_at: string;
  settings?: {
    user_id: string;
    username: string | null;
  };
};

const ICON_OPTIONS = [
  "Award",
  "Star",
  "Trophy",
  "Medal",
  "Zap",
  "Target",
  "Crown",
  "Heart",
  "Flame",
  "Sparkles",
];

const COLOR_OPTIONS = [
  "#3b82f6", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

export function BadgeManager() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("Award");
  const [color, setColor] = useState("#3b82f6");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Grant badge state
  const [grantingBadgeId, setGrantingBadgeId] = useState<string | null>(null);
  const [userIdToGrant, setUserIdToGrant] = useState("");

  // View badge details
  const [viewingBadge, setViewingBadge] = useState<
    (Badge & { user_badges?: UserBadge[] }) | null
  >(null);

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/badges");
      if (response.ok) {
        const data = await response.json();
        setBadges(data);
      } else {
        setError("Failed to fetch badges");
      }
    } catch {
      setError("Failed to fetch badges");
    } finally {
      setIsLoading(false);
    }
  };

  const clearForm = () => {
    setName("");
    setDescription("");
    setIcon("Award");
    setColor("#3b82f6");
    setEditingId(null);
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    clearMessages();

    const url = editingId
      ? `/api/admin/badges/${editingId}`
      : "/api/admin/badges";
    const method = editingId ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, icon, color }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save badge");
      }

      const updatedBadge = await res.json();

      if (editingId) {
        setBadges(badges.map((b) => (b.id === editingId ? updatedBadge : b)));
        setSuccessMessage("Badge updated successfully");
      } else {
        setBadges([updatedBadge, ...badges]);
        setSuccessMessage("Badge created successfully");
      }
      clearForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save badge");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (badge: Badge) => {
    setEditingId(badge.id);
    setName(badge.name);
    setDescription(badge.description || "");
    setIcon(badge.icon || "Award");
    setColor(badge.color || "#3b82f6");
    clearMessages();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this badge?")) return;

    setIsLoading(true);
    clearMessages();
    try {
      const res = await fetch(`/api/admin/badges/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete badge");
      }
      setBadges(badges.filter((b) => b.id !== id));
      setSuccessMessage("Badge deleted successfully");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete badge");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewBadge = async (badge: Badge) => {
    setIsLoading(true);
    clearMessages();
    try {
      const res = await fetch(`/api/admin/badges/${badge.id}`);
      if (!res.ok) throw new Error("Failed to fetch badge details");
      const data = await res.json();
      setViewingBadge(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch badge details",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantBadge = async () => {
    if (!grantingBadgeId || !userIdToGrant.trim()) return;

    setIsLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/badges/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userIdToGrant.trim(),
          badge_id: grantingBadgeId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to grant badge");
      }
      setSuccessMessage("Badge granted successfully");
      setUserIdToGrant("");
      setGrantingBadgeId(null);
      fetchBadges();
      if (viewingBadge && viewingBadge.id === grantingBadgeId) {
        handleViewBadge(viewingBadge);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to grant badge");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeBadge = async (userId: string, badgeId: string) => {
    if (!confirm("Are you sure you want to revoke this badge?")) return;

    setIsLoading(true);
    clearMessages();
    try {
      const res = await fetch("/api/admin/badges/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, badge_id: badgeId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to revoke badge");
      }
      setSuccessMessage("Badge revoked successfully");
      fetchBadges();
      if (viewingBadge) {
        handleViewBadge(viewingBadge);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke badge");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Admin: Badge Management</h1>

      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-500/10 text-green-600 p-3 rounded-md mb-4">
          {successMessage}
        </div>
      )}

      {/* Create/Edit Form Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-card p-6 rounded-xl border border-border mb-8 space-y-4"
      >
        <h2 className="text-xl font-semibold">
          {editingId ? "Edit Badge" : "Create New Badge"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input
              placeholder="Badge name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Icon</label>
            <select
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ICON_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            placeholder="Badge description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={500}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  color === c ? "scale-110 border-white" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div>
          <label className="block text-sm font-medium mb-2">Preview</label>
          <div className="flex items-center gap-3">
            <BadgeDisplay
              badge={{
                name: name || "Badge",
                description,
                icon,
                color,
              }}
              size="lg"
            />
            <div>
              <p className="font-medium">{name || "Badge Name"}</p>
              <p className="text-sm text-muted-foreground">
                {description || "Badge description"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          {editingId && (
            <Button
              type="button"
              variant="outline"
              onClick={clearForm}
              disabled={isLoading}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel Edit
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            <Plus className="w-4 h-4 mr-2" />
            {editingId ? "Update Badge" : "Create Badge"}
          </Button>
        </div>
      </form>

      {/* Grant Badge Section */}
      {grantingBadgeId && (
        <div className="bg-card p-6 rounded-xl border border-border mb-8 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Grant Badge:{" "}
            {badges.find((b) => b.id === grantingBadgeId)?.name}
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="User ID (UUID)..."
              value={userIdToGrant}
              onChange={(e) => setUserIdToGrant(e.target.value)}
            />
            <Button onClick={handleGrantBadge} disabled={isLoading}>
              Grant
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setGrantingBadgeId(null);
                setUserIdToGrant("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* View Badge Details Modal */}
      {viewingBadge && (
        <div className="bg-card p-6 rounded-xl border border-border mb-8 space-y-4">
          <div className="flex justify-between items-start">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Award className="w-5 h-5" />
              Badge: {viewingBadge.name}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewingBadge(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <BadgeDisplay badge={viewingBadge} size="lg" />
            <div>
              <p className="text-muted-foreground">
                {viewingBadge.description || "No description"}
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">
              Users with this badge ({viewingBadge.user_badges?.length || 0})
            </h3>
            {viewingBadge.user_badges && viewingBadge.user_badges.length > 0 ? (
              <div className="space-y-2">
                {viewingBadge.user_badges.map((ub) => (
                  <div
                    key={ub.id}
                    className="flex justify-between items-center p-2 bg-muted/50 rounded"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {ub.settings?.username
                          ? `@${ub.settings.username}`
                          : "No username"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {ub.user_id.slice(0, 8)}...
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        handleRevokeBadge(ub.user_id, viewingBadge.id)
                      }
                      disabled={isLoading}
                    >
                      <UserMinus className="w-4 h-4 mr-1" />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No users have this badge yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* List of Badges */}
      <h2 className="text-xl font-semibold mb-4">All Badges</h2>
      <div className="space-y-4">
        {badges.map((badge) => (
          <div
            key={badge.id}
            className="bg-card p-4 rounded-xl border border-border flex justify-between items-center"
          >
            <div className="flex items-center gap-4">
              <BadgeDisplay badge={badge} />
              <div>
                <p className="font-medium">{badge.name}</p>
                <p className="text-sm text-muted-foreground">
                  {badge.description || "No description"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {badge.user_count || 0} users
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0 ml-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleViewBadge(badge)}
                disabled={isLoading}
                title="View details"
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setGrantingBadgeId(badge.id)}
                disabled={isLoading}
                title="Grant badge"
              >
                <UserPlus className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleEdit(badge)}
                disabled={isLoading}
                title="Edit badge"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => handleDelete(badge.id)}
                disabled={isLoading}
                title="Delete badge"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        {badges.length === 0 && !isLoading && (
          <p className="text-muted-foreground text-center py-8">
            No badges created yet. Create your first badge above.
          </p>
        )}
      </div>
    </div>
  );
}
