# Type System Deep Dive

nanocode uses TypeScript + Zod to build a complete type system, achieving dual type safety at compile-time and runtime.

## Core Types Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     types.ts Type System                     │
├──────────────────────────────────────────────────────────────┤
│  Anthropic Related Types                                     │
│  ├── ContentBlock      Message content blocks                │
│  ├── Message           Message object                        │
│  └── ToolResult        Tool execution results                │
├──────────────────────────────────────────────────────────────┤
│  Zod Schemas (Runtime Validation)                            │
│  ├── ReadSchema        File read parameters                  │
│  ├── WriteSchema       File write parameters                 │
│  ├── EditSchema        File edit parameters                  │
│  ├── GlobSchema        File matching parameters              │
│  ├── GrepSchema        Text search parameters                │
│  └── BashSchema        Command execution parameters          │
├──────────────────────────────────────────────────────────────┤
│  Inferred Types (Compile-time Types)                         │
│  ├── ReadParams        = z.infer<typeof ReadSchema>          │
│  ├── WriteParams       = z.infer<typeof WriteSchema>         │
│  └── ...                                                     │
├──────────────────────────────────────────────────────────────┤
│  Tool Configuration Types                                    │
│  ├── ToolSchema        Anthropic API tool format             │
│  └── ToolConfig<T>     Tool configuration generic            │
└──────────────────────────────────────────────────────────────┘
```

## Anthropic Related Types

### ContentBlock

```typescript
export type ContentBlock = Anthropic.Messages.ContentBlock;
```

This is a type provided by the Anthropic SDK, representing a content block in a message. It could be:
- `TextBlock`: Text content `{ type: "text", text: string }`
- `ToolUseBlock`: Tool invocation `{ type: "tool_use", id, name, input }`

### Message

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResult[];
}
```

Used for storing conversation history locally:
- `role`: Message sender identity
- `content`: Supports three formats:
  - `string`: Plain text user input
  - `ContentBlock[]`: Content blocks returned by API
  - `ToolResult[]`: Array of tool execution results

### ToolResult

```typescript
export interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}
```

Tool result format required by the Anthropic API:
- `tool_use_id`: Corresponds to the tool_use id
- `content`: String returned by tool execution

## Zod Schema Deep Dive

### Schema Definition Pattern

All tool schemas follow a unified pattern:

```typescript
const SchemaName = z.object({
  field: z.type().describe("Description"),
  optionalField: z.type().optional().describe("Optional field"),
});
```

### Tool Schema Analysis

#### ReadSchema - File Reading

```typescript
export const ReadSchema = z.object({
  path: z.string().describe("File path to read"),
  offset: z.number().optional().describe("Line offset to start reading from"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | ✓ | File path |
| offset | number | ✗ | Starting line number (0-based) |
| limit | number | ✗ | Maximum lines to read |

**Usage Scenarios**:
```typescript
// Full read
{ path: "/tmp/test.ts" }

// Paginated read
{ path: "/tmp/test.ts", offset: 0, limit: 50 }
```

#### WriteSchema - File Writing

```typescript
export const WriteSchema = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("Content to write"),
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | ✓ | Target file path |
| content | string | ✓ | Content to write |

**Note**: This operation directly overwrites file content.

#### EditSchema - File Editing

```typescript
export const EditSchema = z.object({
  path: z.string().describe("File path to edit"),
  old: z.string().describe("Text to replace"),
  new: z.string().describe("Replacement text"),
  all: z.boolean().optional().describe("Replace all occurrences if true"),
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | ✓ | Target file path |
| old | string | ✓ | Text to be replaced |
| new | string | ✓ | New text |
| all | boolean | ✗ | Whether to replace all matches |

**Safety Mechanisms**:
- `old` content must be unique (unless `all=true`)
- Prevents accidental multiple modifications

#### GlobSchema - File Matching

```typescript
export const GlobSchema = z.object({
  pat: z.string().describe("Glob pattern"),
  path: z.string().optional().describe("Base directory"),
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pat | string | ✓ | Glob pattern, e.g., `"**/*.ts"` |
| path | string | ✗ | Base directory, defaults to current directory |

**Sorting**: Results are sorted by file modification time in descending order.

#### GrepSchema - Text Search

```typescript
export const GrepSchema = z.object({
  pat: z.string().describe("Regex pattern to search"),
  path: z.string().optional().describe("Base directory"),
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pat | string | ✓ | Regular expression pattern |
| path | string | ✗ | Search directory, defaults to current directory |

**Limit**: Returns at most 50 matching results.

#### BashSchema - Command Execution

```typescript
export const BashSchema = z.object({
  cmd: z.string().describe("Shell command to run"),
});
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| cmd | string | ✓ | Shell command to execute |

**Safety Limits**:
- 30-second timeout automatic termination
- Real-time display of command output

## Type Inference

### infer Keyword

Zod Schemas can extract TypeScript types via `z.infer`:

```typescript
export type ReadParams = z.infer<typeof ReadSchema>;
// Equivalent to:
// type ReadParams = {
//   path: string;
//   offset?: number | undefined;
//   limit?: number | undefined;
// }
```

### Generic Tool Configuration

```typescript
export interface ToolConfig<T extends z.ZodObject<any>> {
  description: string;
  schema: T;
  handler: (args: z.infer<T>) => string | Promise<string>;
}
```

This is a generic interface:
- `T`: Must be ZodObject type
- `handler` parameter types are automatically inferred from Schema
- Ensures Schema and handler parameter types are consistent

**Usage Example**:

```typescript
const readConfig: ToolConfig<typeof ReadSchema> = {
  description: "Read file",
  schema: ReadSchema,
  handler: (args) => {
    // args is automatically inferred as ReadParams type
    return readFileSync(args.path, "utf-8");
  },
};
```

## Anthropic API Format

### ToolSchema

```typescript
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}
```

This is the tool definition format sent to the Anthropic API:
- Uses `toJSONSchema()` to automatically generate `input_schema`
- `required` array is automatically derived by Zod (non-optional fields)

### Auto-generation Example

For `ReadSchema`:

```typescript
// Zod Schema
const ReadSchema = z.object({
  path: z.string().describe("File path"),
  offset: z.number().optional(),
});

// Generated ToolSchema
{
  name: "read",
  description: "Read file...",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      offset: { type: "number", description: "Line offset" }
    },
    required: ["path"]  // offset is optional, not included
  }
}
```

## Type Safety Flow

```
1. Define Zod Schema
        ↓
2. Use z.infer to get TS type
        ↓
3. Use concrete types in handler
        ↓
4. Runtime Zod validation of incoming params
        ↓
5. Call handler after validation passes
```

## Best Practices

### 1. Always use .describe()

Add descriptions for each field, these will be passed to the LLM:

```typescript
// Good practice
z.string().describe("Absolute file path, not directory")

// Bad practice
z.string()  // LLM doesn't know how to use it
```

### 2. Clearly mark optional fields

```typescript
// Good practice
optionalField: z.string().optional()

// Avoid
optionalField: z.string().default("")  // Hides optionality
```

### 3. Use concrete types

```typescript
// Good practice
function read(args: ReadParams): string

// Avoid
function read(args: Record<string, unknown>): string  // Loses type safety
```

### 4. Use generics to ensure consistency

```typescript
// ToolConfig ensures schema and handler match
const config: ToolConfig<typeof MySchema> = {
  schema: MySchema,
  handler: (args) => { /* args automatically has correct type */ }
};
```
