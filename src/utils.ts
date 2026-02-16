/**
 * Utility functions for nanocode
 */

import { statSync } from "node:fs";

// ANSI colors
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";
export const BLUE = "\x1b[34m";
export const CYAN = "\x1b[36m";
export const GREEN = "\x1b[32m";
export const RED = "\x1b[31m";

/**
 * Get file modification time, return 0 if file doesn't exist
 */
export function safeGetMtime(f: string): number {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Create a separator line
 */
export function separator(): string {
  const cols = process.stdout.columns || 80;
  return DIM + "─".repeat(cols) + RESET;
}

/**
 * Simple markdown rendering
 */
export function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
}
