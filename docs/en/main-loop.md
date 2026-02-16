# Main Loop Deep Dive

`main.ts` is the entry point of nanocode, implementing the complete Agent Loop, which coordinates user interaction, API communication, and tool invocation.

## Overall Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                           main()                                │
│                                                                 │
│  1. Initialization                                              │
│     ├── Load environment variables (.env)                       │
│     ├── Create Anthropic client                                 │
│     └── Display startup info                                    │
│                                                                 │
│  2. Main Loop (while true)                                      │
│     ├── Read user input                                         │
│     ├── Handle special commands (/q, /c)                        │
│     └── Add to message history                                  │
│                                                                 │
│  3. Agent Loop (inner loop)                                     │
│     ├── Call API                                                │
│     ├── Process response content                                │
│     ├── Execute tool calls                                      │
│     └── Loop until no tool calls                                │
│                                                                 │
│  4. Cleanup                                                     │
│     └── Close readline interface                                │
└─────────────────────────────────────────────────────────────────┘
```

## Initialization Phase

```typescript
// Load .env file
dotenv.config();

const MODEL = process.env.MODEL ?? "claude-sonnet-4-5-20250929";

// Anthropic client configuration
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  baseURL: process.env.ANTHROPIC_BASE_URL,
  fetch: ((url: any, init?: any) => {
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", "Mozilla/5.0");
    return globalThis.fetch(url, { ...init, headers });
  }) as unknown as import("@anthropic-ai/sdk/core").Fetch,
});
```

### Purpose of Custom fetch

Sets the `User-Agent` header, which is required in some environments to pass through firewalls or proxies.

## User Input Loop

```typescript
const rl = createInterface({ input: stdin, output: stdout });
const messages: Message[] = [];

while (true) {
  // Read input
  let userInput: string;
  try {
    userInput = await rl.question(`\n${GREEN}>${RESET} `);
  } catch {
    break; // Ctrl+D triggers exception, graceful exit
  }

  userInput = userInput.trim();
  if (!userInput) continue;

  // Special commands
  if (userInput === "/q" || userInput === "exit") break;
  if (userInput === "/c") {
    messages.length = 0; // Clear history
    console.log(`${DIM}(history cleared)${RESET}`);
    continue;
  }

  messages.push({ role: "user", content: userInput });

  // Enter Agent Loop...
}
```

### Special Commands

| Command | Action |
|---------|--------|
| `/q` or `exit` | Exit program |
| `/c` | Clear conversation history |
| `Ctrl+D` | Send EOF, graceful exit |

## Agent Loop (Core)

This is the core mechanism of nanocode, implementing automated tool calling:

```typescript
while (true) {
  console.log(`\n${DIM}thinking...${RESET}`);

  // 1. Call API
  let resp: Anthropic.Messages.Message;
  try {
    resp = await callApi(messages);
  } catch (err) {
    console.log(`${RED}API error: ${err}${RESET}`);
    break;
  }

  // 2. Check response
  if (!resp.content) {
    console.log(`${RED}Unexpected response${RESET}`);
    break;
  }

  // 3. Save assistant reply
  messages.push({ role: "assistant", content: resp.content });

  // 4. Process content blocks
  const toolResults: ToolResult[] = [];
  for (const block of resp.content) {
    if (block.type === "text") {
      // Display text
      console.log(`\n${renderMarkdown(block.text)}`);
    } else if (block.type === "tool_use") {
      // Execute tool
      const result = await executeTool(block);
      toolResults.push(result);
    }
  }

  // 5. If no tool calls, end loop
  if (toolResults.length === 0) break;

  // 6. Feed results back to API
  messages.push({ role: "user", content: toolResults });
}
```

### Why is a Loop Needed?

The LLM may need multiple tool calls to complete complex tasks:

```
User: "Find all TODO comments in the project"

Round 1:
  LLM: Calls glob to get all files
  System: Returns file list

Round 2:
  LLM: Calls grep to search for TODO
  System: Returns search results

Round 3:
  LLM: No tools needed, directly summarizes the answer
  Loop ends
```

## Tool Execution Flow

```typescript
const { id, name, input } = block;  // tool_use block
const args = input as Record<string, unknown>;

// Display tool call
console.log(`\n${separator()}`);
console.log(`${BLUE}tool: ${name}${RESET} ${DIM}${JSON.stringify(args)}${RESET}`);

// Execute tool
const result = await runTool(name, args);

// Display result (limit length)
console.log(`${DIM}${result.slice(0, 500)}${RESET}`);
console.log(separator());

// Save result
toolResults.push({
  type: "tool_result",
  tool_use_id: id,
  content: result,
});
```

### Purpose of tool_use_id

`tool_use_id` is used to associate tool calls with results:
- LLM generates unique ID when initiating call
- System returns result with same ID
- Anthropic API knows which call the result corresponds to via ID

## API Call

```typescript
async function callApi(messages: Message[]): Promise<Anthropic.Messages.Message> {
  return client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: messages as Anthropic.Messages.MessageParam[],
    tools: makeSchema() as Anthropic.Messages.Tool[],
  });
}
```

### System Prompt

```typescript
const SYSTEM_PROMPT = `You are a coding assistant with access to tools.
Working directory: ${process.cwd()}`;
```

Informs the LLM:
1. Identity: Coding assistant
2. Capability: Can invoke tools
3. Context: Current working directory

### Message Type Conversion

```typescript
messages as Anthropic.Messages.MessageParam[]
```

The local `Message[]` type is not completely consistent with the Anthropic SDK types, requiring a type assertion.

## UI Rendering

### Separator

```typescript
function separator(): string {
  const cols = process.stdout.columns || 80;
  return DIM + "─".repeat(cols) + RESET;
}
```

Dynamically generated based on terminal width.

### Markdown Rendering

```typescript
function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
}
```

Simple regex replacement, supports **bold**.

## State Management

### messages Array

```typescript
const messages: Message[] = [];
```

Stores complete conversation history:

```typescript
// User message
{ role: "user", content: "Read package.json" }

// Assistant message (contains tool call)
{ role: "assistant", content: [
  { type: "tool_use", id: "...", name: "read", input: {...} }
]}

// Tool result (as user message)
{ role: "user", content: [
  { type: "tool_result", tool_use_id: "...", content: "..." }
]}
```

### Memory Management

Currently simple array storage, long conversations may need attention:
- Use `/c` to clear history
- Future: Auto-summarization or truncation

## Error Handling

### API Errors

```typescript
try {
  resp = await callApi(messages);
} catch (err) {
  console.log(`${RED}API error: ${err}${RESET}`);
  break;  // Exit inner loop, wait for new user input
}
```

### Tool Errors

Tool internal errors are handled by returning strings:
```typescript
return "error: file not found";
```

## Extension Points

### Adding New Special Commands

```typescript
if (userInput === "/newcommand") {
  // Implement functionality
  continue;
}
```

### Modifying System Prompt

```typescript
const SYSTEM_PROMPT = `Custom prompt
Can include more instructions, such as:
- Code style requirements
- Response format requirements
- Domain-specific knowledge
`;
```

### Adding Logging

```typescript
// Add logs at key points
console.log(`${DIM}[DEBUG] Calling tool: ${name}${RESET}`);
```
