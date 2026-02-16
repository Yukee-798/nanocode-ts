# Architecture Design

## Overall Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                          main.ts                             │
│                    (Agent Loop & UI)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  User Input  │  │   API Call   │  │ Tool Results │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        tools.ts                              │
│              (Tool Registry & Implementations)               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │  read  │ │ write  │ │  edit  │ │  glob  │ │  grep  │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐                                                  │
│  │  bash  │                                                  │
│  └────────┘                                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        types.ts                              │
│              (Type Definitions & Zod Schemas)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ToolConfig<T>  │  ToolSchema  │  Message  │ ...     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ReadSchema  │  WriteSchema  │  EditSchema  │ ...    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        utils.ts                              │
│                 (Utility Functions)                          │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  separator  │  │renderMarkdown│  │ safeGetMtime│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ANSI Colors: RESET, BOLD, DIM, BLUE, CYAN, ...      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Module Dependency Relationships

```
main.ts
  ├── imports types.ts (type definitions)
  ├── imports tools.ts (tool functions)
  └── imports utils.ts (common utilities)

tools.ts
  ├── imports types.ts (Schemas and types)
  └── imports utils.ts (safeGetMtime, colors)

types.ts
  └── no dependencies (pure type definitions)

utils.ts
  └── only depends on Node.js built-in modules
```

## Data Flow

### 1. User Input to API Call

```
User Input → main.ts:main() → callApi() → Anthropic API
```

### 2. API Response Processing

```
API Response → ContentBlock[] → text display / tool invocation
```

### 3. Tool Invocation Flow

```
tool_use block → runTool(name, args) → TOOLS[name].handler(parsedArgs) → result
                      ↑
                      └── Zod Schema validation
```

### 4. Tool Result Feedback

```
Tool result → ToolResult[] → add to messages → call API again
```

## Core Concepts

### 1. Agent Loop

```typescript
while (true) {
  // 1. Get user input
  // 2. Call API
  // 3. Process response content
  // 4. Execute tools if any
  // 5. Feed results back to API
  // 6. Repeat until no tool calls
}
```

### 2. Tool Registry

All tools are registered through the `TOOLS` object:

```typescript
const TOOLS: Record<string, ToolConfig<any>> = {
  read: { description, schema, handler },
  write: { description, schema, handler },
  // ...
};
```

### 3. Schema Generation

Uses Zod v4's `toJSONSchema()` method to automatically generate JSON Schema required by the Anthropic API:

```typescript
function makeSchema(): ToolSchema[] {
  return Object.entries(TOOLS).map(([name, config]) => {
    const jsonSchema = config.schema.toJSONSchema();
    return {
      name,
      description: config.description,
      input_schema: {
        type: "object",
        properties: jsonSchema.properties,
        required: jsonSchema.required,
      },
    };
  });
}
```

## Design Decisions

### Why Zod?

1. **Type Safety**: Schema definitions are type definitions
2. **Runtime Validation**: Automatically validates parameters passed by the API
3. **JSON Schema Generation**: Directly generates format required by Anthropic API
4. **Type Inference**: Get parameter types using `z.infer<typeof Schema>`

### Why Split Modules?

| Module | Responsibility | Benefits |
|--------|---------------|----------|
| types.ts | Type definitions | Centralized management, avoids circular dependencies |
| utils.ts | Common utilities | Reusable, separated from business logic |
| tools.ts | Tool implementations | Clear tool registration mechanism |
| main.ts | Flow control | Single entry, clear responsibility |

### Why tsx?

- Run TypeScript directly, no compilation step needed
- Supports ESM modules
- Compatible with native Node.js
