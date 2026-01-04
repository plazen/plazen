"use client";

/**
 * PlazenLogo
 *
 * Small presentational component that renders the Plazen logo image.
 * The component supports an optional `theme` prop and will also observe the
 * document root's class list to determine whether it should invert the logo
 * colors (useful for switching the logo when the app is in light or dark mode).
 *
 * Behaviour:
 * - If `theme` prop is provided:
 *   - `"light"` forces an inverted logo (so it is visible on light backgrounds).
 *   - `"dark"` forces non-inverted logo.
 *   - Any other value leaves the default (non-inverted).
 * - If `theme` is not provided, the component will:
 *   - Inspect `document.documentElement.classList` for the `light` class.
 *   - Observe changes to the document element's `class` attribute and update
 *     the inversion state accordingly.
 *
 * Notes:
 * - This component is a client component (uses browser APIs like `document`).
 * - `Image` from `next/image` is used for optimized loading and sizing.
 */

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Logo from "@/images/logo2.png";

/**
 * Props accepted by `PlazenLogo`.
 *
 * - `width` / `height`: control the rendered image dimensions (pixels).
 * - `className`: optional container class names (useful for layout/spacing).
 * - `theme`: optional explicit theme override (`"light"` | `"dark"` or other).
 */
interface PlazenLogoProps {
  width?: number;
  height?: number;
  className?: string;
  theme?: string; // Accept theme as a prop (explicit override)
}

/**
 * Render the Plazen logo, optionally inverting the image colors when the UI
 * is in light mode so the logo remains visible against the background.
 */
export const PlazenLogo: React.FC<PlazenLogoProps> = ({
  width = 70,
  height = 70,
  className = "",
  theme,
}) => {
  // Local state indicating whether to apply a CSS inversion/filter to the image.
  const [shouldInvert, setShouldInvert] = useState(false);

  useEffect(() => {
    // If a theme prop was explicitly provided, prefer it.
    if (theme) {
      setShouldInvert(theme === "light");
      return;
    }

    // When no explicit theme provided, determine the theme by inspecting the
    // document root's classList. This mirrors how the app toggles `.light` / `.dark`.
    const checkTheme = () => {
      if (typeof document === "undefined") return;
      setShouldInvert(document.documentElement.classList.contains("light"));
    };

    // Run once on mount to initialise state.
    checkTheme();

    // Observe `class` attribute changes on the documentElement so we react to
    // runtime theme toggles (e.g., user switches theme via UI).
    const observer = new MutationObserver(checkTheme);

    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // Cleanup observer when component unmounts.
    return () => observer.disconnect();
  }, [theme]);

  return (
    // Container preserves layout behaviour and accepts additional classes.
    <div className={`relative flex items-center justify-center ${className}`}>
      <Image
        src={Logo}
        alt="Plazen Logo"
        width={width}
        height={height}
        priority
        // Tailwind transitions for a smooth invert toggle.
        className={`transition-all duration-300 ease-in-out ${
          shouldInvert ? "invert" : ""
        }`}
        // Use an explicit CSS filter as a reliable fallback for environments
        // that might not support the `invert` utility class.
        style={{
          filter: shouldInvert ? "invert(1)" : "none",
        }}
      />
    </div>
  );
};
