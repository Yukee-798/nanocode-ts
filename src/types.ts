/**
 * Type definitions for nanocode
 */

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

export type ContentBlock = Anthropic.Messages.ContentBlock;

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResult[];
}

export interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

// --- Zod Schemas for each tool ---

export const ReadSchema = z.object({
  path: z.string().describe("File path to read"),
  offset: z.number().optional().describe("Line offset to start reading from"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
});

export const WriteSchema = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("Content to write"),
});

export const EditSchema = z.object({
  path: z.string().describe("File path to edit"),
  old: z.string().describe("Text to replace"),
  new: z.string().describe("Replacement text"),
  all: z.boolean().optional().describe("Replace all occurrences if true"),
});

export const GlobSchema = z.object({
  pat: z.string().describe("Glob pattern"),
  path: z.string().optional().describe("Base directory"),
});

export const GrepSchema = z.object({
  pat: z.string().describe("Regex pattern to search"),
  path: z.string().optional().describe("Base directory"),
});

export const BashSchema = z.object({
  cmd: z.string().describe("Shell command to run"),
});

// --- Inferred parameter types ---

export type ReadParams = z.infer<typeof ReadSchema>;
export type WriteParams = z.infer<typeof WriteSchema>;
export type EditParams = z.infer<typeof EditSchema>;
export type GlobParams = z.infer<typeof GlobSchema>;
export type GrepParams = z.infer<typeof GrepSchema>;
export type BashParams = z.infer<typeof BashSchema>;

// --- Tool schema for Anthropic API ---

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

// --- Tool config interface ---

export interface ToolConfig<T extends z.ZodObject<any>> {
  description: string;
  schema: T;
  handler: (args: z.infer<T>) => string | Promise<string>;
}
