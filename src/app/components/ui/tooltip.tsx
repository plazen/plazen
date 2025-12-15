"use client";

import * as React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "right" | "bottom" | "left";

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: Side;
  className?: string;
  interactive?: boolean;
}

export function Tooltip({
  children,
  content,
  side = "top",
  className,
  interactive = false,
}: TooltipProps) {
  const id = useId();

  const positionClass = React.useMemo(() => {
    switch (side) {
      case "top":
        return "bottom-full mb-2 left-1/2 -translate-x-1/2";
      case "bottom":
        return "top-full mt-2 left-1/2 -translate-x-1/2";
      case "left":
        return "right-full mr-2 top-1/2 -translate-y-1/2";
      case "right":
      default:
        return "left-full ml-2 top-1/2 -translate-y-1/2";
    }
  }, [side]);

  const arrowClass = React.useMemo(() => {
    switch (side) {
      case "top":
        return "top-full left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45";
      case "bottom":
        return "bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45";
      case "left":
        return "left-full top-1/2 -translate-y-1/2 translate-x-1/2 rotate-45";
      case "right":
      default:
        return "right-full top-1/2 -translate-y-1/2 -translate-x-1/2 rotate-45";
    }
  }, [side]);

  if (!React.isValidElement(children)) return <>{children}</>;

  const trigger = React.cloneElement(children, {
    "aria-describedby": id,
  } as any);

  return (
    <span className="relative inline-block group">
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none z-50 inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground shadow-md transition-all duration-150 transform opacity-0 scale-95",
          "group-hover:opacity-100 group-focus-within:opacity-100 group-hover:scale-100 group-focus-within:scale-100",
          "absolute whitespace-nowrap",
          positionClass,
          interactive ? "pointer-events-auto" : "",
          className ?? "",
        )}
      >
        <span className="relative block">{content}</span>
        <span
          aria-hidden
          className={cn(
            "absolute w-2.5 h-2.5 bg-muted transform origin-center",
            arrowClass,
            interactive ? "" : "",
          )}
        />
      </span>
    </span>
  );
}

export default Tooltip;
