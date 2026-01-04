"use client";

/**
 * Theme provider utilities
 *
 * This module exposes a small theme system used by the app UI:
 * - `ThemeProvider` wraps application UI and synchronises a theme value with:
 *   - localStorage (persisted user preference)
 *   - the system preference (prefers-color-scheme media query)
 *   - the document root element (adds `light` / `dark` classes for CSS)
 * - `useTheme` is a convenient hook for components to read and update theme state.
 *
 * Implementation notes:
 * - `theme` values follow the `Theme` type from `@/lib/theme` and support:
 *   "dark" | "light" | "system"
 * - `effectiveTheme` resolves `"system"` to the current `systemTheme` value.
 * - `storageKey` is configurable to allow for testing or namespacing in other apps.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { Theme } from "@/lib/theme";

/**
 * Context shape for theme manager.
 *
 * - `theme` is the stored preference ("dark" | "light" | "system").
 * - `setTheme` allows updates to the preference.
 * - `systemTheme` reflects the current OS-level preference ("dark" or "light").
 * - `effectiveTheme` is the resolved theme actually applied to the UI.
 */
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  systemTheme: "dark" | "light";
  effectiveTheme: "dark" | "light";
}

/**
 * React context that holds theme state. We initialise with `undefined` so
 * that `useTheme` can assert the context is used within a provider.
 */
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Hook to access theme state from components.
 *
 * Usage:
 *   const { theme, setTheme, effectiveTheme } = useTheme();
 *
 * Throws an error when used outside of a `ThemeProvider` to help catch
 * incorrect usage early during development.
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Props for the `ThemeProvider` component.
 *
 * - `defaultTheme`: initial theme used during first render when no persisted
 *   preference exists. Defaults to "system" to respect OS preference.
 * - `storageKey`: localStorage key used to persist user preference.
 */
interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

/**
 * ThemeProvider
 *
 * Wrap your application UI with this component to enable theme state and sync:
 * - reads/writes the user's preference to localStorage
 * - listens for system theme changes via `matchMedia`
 * - applies the resolved theme to `document.documentElement` by adding a
 *   `light` or `dark` class (used by CSS to style components accordingly)
 *
 * The component is intentionally small and focused on synchronisation behaviour.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
}: ThemeProviderProps) {
  // The persisted/selected theme preference ("dark" | "light" | "system")
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  // The system (OS/browser) theme, resolved to "dark" or "light"
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">("dark");

  // Resolve the effective theme that should be applied to the UI
  // If user selected "system", fall back to detected systemTheme
  const effectiveTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    // Try to load a persisted theme preference on mount. We keep the state update
    // local to avoid flashing the wrong theme for too long.
    try {
      const storedTheme = localStorage.getItem(storageKey) as Theme | null;
      if (storedTheme) {
        setTheme(storedTheme);
      }
    } catch (e) {
      // Access to localStorage may throw in some environments (e.g. privacy mode).
      // Fail silently — the app will continue using the default theme.
      // eslint-disable-next-line no-console
      console.warn("Unable to access localStorage for theme:", e);
    }

    // Observe the OS-level preference so `system` mode can be reactive.
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // Initialise current system theme
    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    // Handler updates local `systemTheme` state when OS preference changes
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    // Use addEventListener where available for modern browsers
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [storageKey]);

  useEffect(() => {
    // Apply the computed theme to the document root so CSS can target `.dark` / `.light`.
    // We first remove both classes to ensure switching from one to the other is deterministic.
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(effectiveTheme);

    // Persist the user's explicit selection (not the effective theme) to localStorage.
    // This keeps "system" as a valid user choice that continues to follow OS changes.
    try {
      localStorage.setItem(storageKey, theme);
    } catch (e) {
      // Best-effort persistence; don't crash if storage is unavailable.
      // eslint-disable-next-line no-console
      console.warn("Unable to persist theme to localStorage:", e);
    }
  }, [theme, effectiveTheme, storageKey]);

  // Compose context value for consumers
  const value = {
    theme,
    setTheme,
    systemTheme,
    effectiveTheme,
  };

  // Provide the theme context to child components
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
