# nanocode

A minimal Claude Code alternative implementation in TypeScript. Interact with Anthropic's API to complete coding tasks through tool calls.

## Features

- **Full TypeScript Stack**: Type-safe implementation with TypeScript
- **Zod Type Validation**: All tool parameters defined and validated using Zod Schema
- **Modular Architecture**: Code organized into independent modules by functionality
- **Six Core Tools**: read, write, edit, glob, grep, bash
- **Agent Loop**: Automated tool calling loop until task completion

## Quick Start

```bash
# Install dependencies
npm install

# Run the program
npm start

# Type checking
npm run check
```

## Environment Variables

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=optional_base_url
MODEL=claude-sonnet-4-5-20250929
```

## Project Structure

```
nano-ts/
├── src/
│   ├── main.ts       # Main entry: agent loop and UI
│   ├── tools.ts      # Tool implementations and registry
│   ├── types.ts      # Type definitions and Zod Schemas
│   └── utils.ts      # Common utility functions
├── docs/             # Documentation
│   ├── en/           # English docs
│   └── zh/           # Chinese docs
├── package.json
└── tsconfig.json
```

## Available Tools

| Tool | Description |
|------|-------------|
| `read` | Read file with line numbers |
| `write` | Write content to file |
| `edit` | Find and replace text in file |
| `glob` | Find files by pattern, sorted by mtime |
| `grep` | Search files for regex pattern |
| `bash` | Run shell command with 30s timeout |

## Documentation

### English
- [Getting Started](./docs/en/README.md)
- [Architecture](./docs/en/architecture.md)
- [Type System](./docs/en/types.md)
- [Tools Guide](./docs/en/tools.md)
- [Main Loop](./docs/en/main-loop.md)
- [Development](./docs/en/development.md)

### 中文文档
- [入门指南](./docs/zh/README.md)
- [架构设计](./docs/zh/architecture.md)
- [类型系统](./docs/zh/types.md)
- [工具指南](./docs/zh/tools.md)
- [主循环详解](./docs/zh/main-loop.md)
- [开发指南](./docs/zh/development.md)

## Tech Stack

- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Zod](https://zod.dev/) - Schema validation with static type inference
- [Anthropic SDK](https://www.npmjs.com/package/@anthropic-ai/sdk) - AI API client
- [tsx](https://github.com/privatenumber/tsx) - TypeScript execution

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the application |
| `npm run check` | Run TypeScript type checking |

## Special Commands

When running the application:

| Command | Action |
|---------|--------|
| `/q` or `exit` | Quit the program |
| `/c` | Clear conversation history |
| `Ctrl+D` | Send EOF to exit |

## Adding New Tools

1. Define schema in `src/types.ts`:

```typescript
export const MyToolSchema = z.object({
  param: z.string().describe("Parameter description"),
});

export type MyToolParams = z.infer<typeof MyToolSchema>;
```

2. Implement handler in `src/tools.ts`:

```typescript
export function myTool(args: MyToolParams): string {
  // Implementation
  return "result";
}
```

3. Register in `TOOLS`:

```typescript
export const TOOLS = {
  // ... existing tools
  myTool: {
    description: "My new tool",
    schema: MyToolSchema,
    handler: myTool,
  },
};
```

See [Tools Guide](./docs/en/tools.md) for detailed instructions.

## License

MIT
