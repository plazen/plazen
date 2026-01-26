"use client";

import type { Badge } from "@/types/profile";
import Tooltip from "@/app/components/ui/tooltip";
import {
  Award,
  Star,
  Trophy,
  Medal,
  Zap,
  Target,
  Crown,
  Heart,
  Flame,
  Sparkles,
} from "lucide-react";

interface BadgeDisplayProps {
  badge: Badge;
  size?: "sm" | "md" | "lg";
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  Star,
  Trophy,
  Medal,
  Zap,
  Target,
  Crown,
  Heart,
  Flame,
  Sparkles,
};

export function BadgeDisplay({ badge, size = "md" }: BadgeDisplayProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-16 h-16 text-lg",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  // Try to get icon component from map, otherwise use first letter or emoji
  const IconComponent = badge.icon ? iconMap[badge.icon] : null;

  const tooltipContent = badge.description
    ? `${badge.name}: ${badge.description}`
    : badge.name;

  return (
    <Tooltip content={tooltipContent}>
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center cursor-help transition-transform hover:scale-110`}
        style={{
          backgroundColor: `${badge.color}20`,
          color: badge.color,
          borderWidth: "2px",
          borderColor: `${badge.color}40`,
        }}
      >
        {IconComponent ? (
          <IconComponent className={iconSizes[size]} />
        ) : badge.icon ? (
          <span className="text-lg">{badge.icon}</span>
        ) : (
          <span className="font-bold">{badge.name[0]?.toUpperCase()}</span>
        )}
      </div>
    </Tooltip>
  );
}
