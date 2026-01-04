import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose className values using `clsx` for conditional logic and
 * `twMerge` to merge Tailwind utility conflicts (e.g., `px-2` vs `px-4`).
 *
 * @param inputs - A list of class values accepted by `clsx`. These can be
 *                 strings, arrays, objects (for conditional classes), or
 *                 other ClassValue types supported by `clsx`.
 * @returns A single merged className string safe to pass to a `className` prop.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
