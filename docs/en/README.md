# nanocode Learning Guide

## Project Overview

nanocode is a minimal Claude Code alternative implementation based on TypeScript, which interacts with the Anthropic API to complete tasks such as code editing, file operations, and command execution through tool calls.

## Core Features

- **Full TypeScript Stack**: Written in TypeScript for type safety
- **Zod Type Validation**: All tool parameters are defined and validated using Zod Schema
- **Modular Architecture**: Code is split into independent modules by functionality
- **Tool Calling**: Supports six tools: read, write, edit, glob, grep, and bash
- **Agent Loop**: Automated tool calling loop until task completion

## Project Structure

```
nano-ts/
├── src/
│   ├── main.ts       # Main entry: agent loop and UI
│   ├── tools.ts      # Tool implementations and registry
│   ├── types.ts      # Type definitions and Zod Schemas
│   └── utils.ts      # Common utility functions
├── docs/             # Learning documentation
├── package.json
└── tsconfig.json
```

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

```bash
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_BASE_URL=optional_base_url
MODEL=claude-sonnet-4-5-20250929
```

## Documentation Navigation

- [Architecture](./architecture.md) - System architecture and module relationships
- [Type System](./types.md) - Zod Schemas and type definitions
- [Tools Implementation](./tools.md) - How to add new tools
- [Main Loop](./main-loop.md) - Agent loop workflow
- [Development Guide](./development.md) - How to extend and debug
