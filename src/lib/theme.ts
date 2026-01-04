/**
 * theme.ts
 *
 * Small theme utilities used by the application for consistent presentation
 * and developer ergonomics.
 *
 * Exports:
 * - `Theme`       : union type of allowed theme identifiers used across the app.
 * - `themes`      : a record mapping theme keys to descriptive objects (display name + value).
 * - `themeList`   : an array of theme objects (useful for UI lists / select inputs).
 *
 * Notes:
 * - This module is intentionally tiny and deterministic. Use `Theme` where a
 *   strongly-typed theme parameter is required and `themeList` when iterating
 *   over available choices in UI components.
 * - Keeping display names and values together makes it straightforward for UI
 *   code to show friendly names while using the `value` for storage/config.
 */

/** Theme identifiers used across the codebase. */
export type Theme = "dark" | "light" | "system";

/**
 * Mapping of available themes to metadata used by UI components.
 *
 * - `name`: human-friendly label for display.
 * - `value`: canonical value stored in settings or passed to theme handlers.
 */
export const themes = {
  dark: {
    name: "Dark",
    value: "dark",
  },
  light: {
    name: "Light",
    value: "light",
  },
  system: {
    name: "System",
    value: "system",
  },
} as const;

/**
 * Array form of the `themes` mapping, convenient for use in select controls
 * and iteration in components. The order here controls presentation order.
 */
export const themeList = Object.values(themes);
