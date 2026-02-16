# Tools Implementation Guide

nanocode provides six core tools, each following the same design pattern. This document details the implementation principles of tools and how to add new ones.

## Tools Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tool Invocation Flow                       │
├─────────────────────────────────────────────────────────────────┤
│  1. LLM generates tool_use request                              │
│           ↓                                                      │
│  2. main.ts parses tool_use block                               │
│           ↓                                                      │
│  3. runTool(name, args) is called                               │
│           ↓                                                      │
│  4. Zod Schema validates parameters                             │
│           ↓                                                      │
│  5. Calls corresponding handler function                        │
│           ↓                                                      │
│  6. Returns result string                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Tools Registry

All tools are registered in the `TOOLS` object:

```typescript
export const TOOLS: Record<string, ToolConfig<any>> = {
  read: { description, schema: ReadSchema, handler: read },
  write: { description, schema: WriteSchema, handler: write },
  edit: { description, schema: EditSchema, handler: edit },
  glob: { description, schema: GlobSchema, handler: glob },
  grep: { description, schema: GrepSchema, handler: grep },
  bash: { description, schema: BashSchema, handler: bash },
};
```

## Detailed Tool Analysis

### 1. read - File Reading

**Function**: Read file content and add line numbers

**Implementation Points**:
```typescript
export function read(args: ReadParams): string {
  const lines = readFileSync(args.path, "utf-8").split("\n");
  const offset = args.offset ?? 0;
  const limit = args.limit ?? lines.length;
  const selected = lines.slice(offset, offset + limit);
  return selected
    .map((line, idx) => `${String(offset + idx + 1).padStart(4)}| ${line}`)
    .join("\n");
}
```

**Key Design**:
- Uses `padStart(4)` to ensure line number alignment
- Format: `   1| content`, facilitates subsequent edit positioning
- Supports paginated reading of large files

**Usage Example**:
```
Input: { path: "/tmp/test.ts", offset: 0, limit: 5 }
Output:
   1| import { z } from "zod";
   2|
   3| const schema = z.object({
   4|   name: z.string(),
   5| });
```

### 2. write - File Writing

**Function**: Create or overwrite files

**Implementation Points**:
```typescript
export function write(args: WriteParams): string {
  writeFileSync(args.path, args.content);
  return "ok";
}
```

**Notes**:
- Direct overwrite, no backup mechanism
- Returns simple string for confirmation

### 3. edit - File Editing

**Function**: Find and replace text

**Implementation Points**:
```typescript
export function edit(args: EditParams): string {
  const text = readFileSync(args.path, "utf-8");
  const old = args.old;
  const replacement = args.new;

  // Safety check: old must exist
  if (!text.includes(old)) return "error: old_string not found";

  // Safety check: old must be unique (unless all=true)
  const count = text.split(old).length - 1;
  if (!args.all && count > 1)
    return `error: old_string appears ${count} times, must be unique (use all=true)`;

  // Execute replacement
  const result = args.all
    ? text.replaceAll(old, replacement)
    : text.replace(old, replacement);

  writeFileSync(args.path, result);
  return "ok";
}
```

**Safety Mechanisms**:
1. Check if `old` exists
2. Check if `old` is unique (prevents accidental replacement)
3. `all` parameter controls whether to replace all

**Works with read**:
- read output line number format facilitates manual positioning
- edit relies on exact matching, suitable for code modifications

### 4. glob - File Matching

**Function**: Find files by pattern, sorted by modification time

**Implementation Points**:
```typescript
export function glob(args: GlobParams): string {
  const base = args.path ?? ".";
  const pattern = `${base}/${args.pat}`.replace("//", "/");
  const files = globSync(pattern);

  // Sort by modification time descending
  files.sort((a, b) => {
    const ma = safeGetMtime(a);
    const mb = safeGetMtime(b);
    return mb - ma;  // Newest first
  });

  return files.join("\n") || "none";
}
```

**Sorting Logic**: Most recently modified files appear first, making it easy to find active files.

### 5. grep - Text Search

**Function**: Recursively search file content

**Implementation Points**:
```typescript
export function grep(args: GrepParams): string {
  const pattern = new RegExp(args.pat);
  const base = args.path ?? ".";
  const allFiles = globSync(`${base}/**`, { withFileTypes: false });
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
      // Skip unreadable files
    }
  }

  return hits.join("\n") || "none";
}
```

**Output Format**: `filepath:lineNumber:content`

**Performance Considerations**:
- Limit to at most 50 results
- Ignore files with read errors

### 6. bash - Command Execution

**Function**: Execute shell commands

**Implementation Points**:
```typescript
export function bash(args: BashParams): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(args.cmd, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outputLines: string[] = [];

    // Real-time display of output
    const onData = (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        if (line) {
          process.stdout.write(`  ${DIM}│ ${line}${RESET}\n`);
          outputLines.push(line);
        }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    // 30 second timeout
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
```

**Safety Features**:
- 30-second timeout protection
- Real-time display of output (with indentation and separator)
- Captures both stdout and stderr

## Steps to Add a New Tool

### Step 1: Add Schema in types.ts

```typescript
export const NewToolSchema = z.object({
  param1: z.string().describe("Parameter 1 description"),
  param2: z.number().optional().describe("Parameter 2 description"),
});

export type NewToolParams = z.infer<typeof NewToolSchema>;
```

### Step 2: Implement handler in tools.ts

```typescript
export function newTool(args: NewToolParams): string {
  // Implementation logic
  return "result";
}
```

### Step 3: Register in TOOLS

```typescript
export const TOOLS: Record<string, ToolConfig<any>> = {
  // ... existing tools
  newTool: {
    description: "Description of new tool",
    schema: NewToolSchema,
    handler: newTool,
  },
};
```

### Complete Example: Adding a cat Tool

```typescript
// types.ts
export const CatSchema = z.object({
  paths: z.array(z.string()).describe("File paths to concatenate"),
});

export type CatParams = z.infer<typeof CatSchema>;

// tools.ts
export function cat(args: CatParams): string {
  return args.paths
    .map(p => readFileSync(p, "utf-8"))
    .join("\n");
}

// Register
const TOOLS = {
  // ...
  cat: {
    description: "Concatenate files",
    schema: CatSchema,
    handler: cat,
  },
};
```

## Tool Design Principles

### 1. Single Responsibility
Each tool does only one thing and keeps it simple.

### 2. Return Strings
All tools return strings for easy LLM understanding:
- Success: `"ok"` or result content
- Failure: `"error: description"`

### 3. Parameter Validation
Rely on Zod for parameter validation, don't reimplement.

### 4. Error Handling
```typescript
try {
  // Operation
} catch {
  return "error: specific reason";
}
```

### 5. Security Considerations
- Limit command execution time
- Validate file paths
- Prevent accidental batch modifications
