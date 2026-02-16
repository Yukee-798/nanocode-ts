/**
 * Tool implementations and registry for nanocode
 */

import { readFileSync, writeFileSync, globSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { z } from "zod";
import {
  ReadParams,
  WriteParams,
  EditParams,
  GlobParams,
  GrepParams,
  BashParams,
  ReadSchema,
  WriteSchema,
  EditSchema,
  GlobSchema,
  GrepSchema,
  BashSchema,
  ToolConfig,
  ToolSchema,
} from "./types.js";
import { safeGetMtime, DIM, RESET } from "./utils.js";

// --- Tool implementations ---

export function read(args: ReadParams): string {
  const lines = readFileSync(args.path, "utf-8").split("\n");
  const offset = args.offset ?? 0;
  const limit = args.limit ?? lines.length;
  const selected = lines.slice(offset, offset + limit);
  return selected
    .map((line, idx) => `${String(offset + idx + 1).padStart(4)}| ${line}`)
    .join("\n");
}

export function write(args: WriteParams): string {
  writeFileSync(args.path, args.content);
  return "ok";
}

export function edit(args: EditParams): string {
  const text = readFileSync(args.path, "utf-8");
  const old = args.old;
  const replacement = args.new;
  if (!text.includes(old)) return "error: old_string not found";
  const count = text.split(old).length - 1;
  if (!args.all && count > 1)
    return `error: old_string appears ${count} times, must be unique (use all=true)`;
  const result = args.all
    ? text.replaceAll(old, replacement)
    : text.replace(old, replacement);
  writeFileSync(args.path, result);
  return "ok";
}

export function glob(args: GlobParams): string {
  const base = args.path ?? ".";
  const pattern = `${base}/${args.pat}`.replace("//", "/");
  const files = globSync(pattern);
  files.sort((a, b) => {
    const ma = safeGetMtime(a);
    const mb = safeGetMtime(b);
    return mb - ma;
  });
  return files.join("\n") || "none";
}

export function grep(args: GrepParams): string {
  const pattern = new RegExp(args.pat);
  const base = args.path ?? ".";
  const allFiles = globSync(`${base}/**`, {
    withFileTypes: false,
  }) as string[];
  const hits: string[] = [];
  for (const filepath of allFiles) {
    try {
      const st = statSync(filepath);
      if (!st.isFile()) continue;
      const lines = readFileSync(filepath, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          hits.push(`${filepath}:${i + 1}:${lines[i]}`);
          if (hits.length >= 50) return hits.join("\n");
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return hits.join("\n") || "none";
}

export function bash(args: BashParams): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(args.cmd, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outputLines: string[] = [];
    const onData = (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        if (line) {
          process.stdout.write(`  ${DIM}│ ${line}${RESET}\n`);
          outputLines.push(line);
        }
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    const timer = setTimeout(() => {
      proc.kill();
      outputLines.push("(timed out after 30s)");
    }, 30_000);

    proc.on("close", () => {
      clearTimeout(timer);
      resolve(outputLines.join("\n").trim() || "(empty)");
    });
  });
}

// --- Tool registry ---

export const TOOLS: Record<string, ToolConfig<any>> = {
  read: {
    description: "Read file with line numbers (file path, not directory)",
    schema: ReadSchema,
    handler: read,
  },
  write: {
    description: "Write content to file",
    schema: WriteSchema,
    handler: write,
  },
  edit: {
    description: "Replace old with new in file (old must be unique unless all=true)",
    schema: EditSchema,
    handler: edit,
  },
  glob: {
    description: "Find files by pattern, sorted by mtime",
    schema: GlobSchema,
    handler: glob,
  },
  grep: {
    description: "Search files for regex pattern",
    schema: GrepSchema,
    handler: grep,
  },
  bash: {
    description: "Run shell command",
    schema: BashSchema,
    handler: bash,
  },
};

/**
 * Run a tool with the given name and arguments
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const tool = TOOLS[name];
    if (!tool) return `error: unknown tool "${name}"`;
    const parsed = tool.schema.parse(args);
    return await tool.handler(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = (err as any).issues || [];
      return `validation error: ${issues.map((e: any) => `${String(e.path).replace(",", ".")}: ${e.message}`).join(", ")}`;
    }
    return `error: ${err}`;
  }
}

/**
 * Generate tool schemas for Anthropic API
 */
export function makeSchema(): ToolSchema[] {
  return Object.entries(TOOLS).map(([name, config]) => {
    const jsonSchema = config.schema.toJSONSchema();
    return {
      name,
      description: config.description,
      input_schema: {
        type: "object" as const,
        properties: jsonSchema.properties || {},
        required: jsonSchema.required || [],
      },
    };
  });
}
