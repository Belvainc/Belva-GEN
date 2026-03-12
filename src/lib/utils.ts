/**
 * Utility for merging Tailwind CSS class names.
 * Simple implementation - combines class names and filters falsy values.
 */
export function cn(...inputs: Array<string | undefined | null | false>): string {
  return inputs.filter(Boolean).join(" ");
}
