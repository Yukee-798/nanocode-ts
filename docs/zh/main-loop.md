# 主循环详解

`main.ts` 是 nanocode 的入口文件，实现了完整的 Agent Loop（智能体循环），负责用户交互、API 通信和工具调用的协调。

## 整体流程

```
┌─────────────────────────────────────────────────────────────────┐
│                           main()                                 │
│                                                                  │
│  1. 初始化                                                       │
│     ├── 加载环境变量 (.env)                                      │
│     ├── 创建 Anthropic 客户端                                    │
│     └── 显示启动信息                                             │
│                                                                  │
│  2. 主循环 (while true)                                          │
│     ├── 读取用户输入                                             │
│     ├── 处理特殊命令 (/q, /c)                                    │
│     └── 添加到消息历史                                           │
│                                                                  │
│  3. Agent Loop (内层循环)                                        │
│     ├── 调用 API                                                 │
│     ├── 处理响应内容                                             │
│     ├── 执行工具调用                                             │
│     └── 循环直到没有工具调用                                     │
│                                                                  │
│  4. 清理                                                         │
│     └── 关闭 readline 接口                                       │
└─────────────────────────────────────────────────────────────────┘
```

## 初始化阶段

```typescript
// 加载 .env 文件
dotenv.config();

const MODEL = process.env.MODEL ?? "claude-sonnet-4-5-20250929";

// Anthropic 客户端配置
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

### 自定义 fetch 的作用

设置 `User-Agent` 头，某些环境需要这个头来通过防火墙或代理。

## 用户输入循环

```typescript
const rl = createInterface({ input: stdin, output: stdout });
const messages: Message[] = [];

while (true) {
  // 读取输入
  let userInput: string;
  try {
    userInput = await rl.question(`\n${GREEN}>${RESET} `);
  } catch {
    break; // Ctrl+D 触发异常，优雅退出
  }

  userInput = userInput.trim();
  if (!userInput) continue;

  // 特殊命令
  if (userInput === "/q" || userInput === "exit") break;
  if (userInput === "/c") {
    messages.length = 0; // 清空历史
    console.log(`${DIM}(history cleared)${RESET}`);
    continue;
  }

  messages.push({ role: "user", content: userInput });

  // 进入 Agent Loop...
}
```

### 特殊命令

| 命令 | 作用 |
|------|------|
| `/q` 或 `exit` | 退出程序 |
| `/c` | 清空对话历史 |
| `Ctrl+D` | 发送 EOF，优雅退出 |

## Agent Loop（核心）

这是 nanocode 的核心机制，实现自动化的工具调用：

```typescript
while (true) {
  console.log(`\n${DIM}thinking...${RESET}`);

  // 1. 调用 API
  let resp: Anthropic.Messages.Message;
  try {
    resp = await callApi(messages);
  } catch (err) {
    console.log(`${RED}API error: ${err}${RESET}`);
    break;
  }

  // 2. 检查响应
  if (!resp.content) {
    console.log(`${RED}Unexpected response${RESET}`);
    break;
  }

  // 3. 保存助手回复
  messages.push({ role: "assistant", content: resp.content });

  // 4. 处理内容块
  const toolResults: ToolResult[] = [];
  for (const block of resp.content) {
    if (block.type === "text") {
      // 显示文本
      console.log(`\n${renderMarkdown(block.text)}`);
    } else if (block.type === "tool_use") {
      // 执行工具
      const result = await executeTool(block);
      toolResults.push(result);
    }
  }

  // 5. 如果没有工具调用，结束循环
  if (toolResults.length === 0) break;

  // 6. 将结果回传给 API
  messages.push({ role: "user", content: toolResults });
}
```

### 为什么需要循环？

LLM 可能需要多次工具调用才能完成复杂任务：

```
用户: "找出项目中所有的 TODO 注释"

轮次 1:
  LLM: 调用 glob 获取所有文件
  系统: 返回文件列表

轮次 2:
  LLM: 调用 grep 搜索 TODO
  系统: 返回搜索结果

轮次 3:
  LLM: 无需工具，直接总结回答
  循环结束
```

## 工具执行流程

```typescript
const { id, name, input } = block;  // tool_use block
const args = input as Record<string, unknown>;

// 显示工具调用
console.log(`\n${separator()}`);
console.log(`${BLUE}tool: ${name}${RESET} ${DIM}${JSON.stringify(args)}${RESET}`);

// 执行工具
const result = await runTool(name, args);

// 显示结果（限制长度）
console.log(`${DIM}${result.slice(0, 500)}${RESET}`);
console.log(separator());

// 保存结果
toolResults.push({
  type: "tool_result",
  tool_use_id: id,
  content: result,
});
```

### tool_use_id 的作用

`tool_use_id` 用于关联工具调用和结果：
- LLM 发起调用时生成唯一 ID
- 系统返回结果时携带相同 ID
- Anthropic API 通过 ID 知道结果对应哪个调用

## API 调用

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

告知 LLM：
1. 身份：编程助手
2. 能力：可以调用工具
3. 上下文：当前工作目录

### 消息类型转换

```typescript
messages as Anthropic.Messages.MessageParam[]
```

本地 `Message[]` 类型与 Anthropic SDK 的类型不完全一致，需要类型断言。

## UI 渲染

### 分隔线

```typescript
function separator(): string {
  const cols = process.stdout.columns || 80;
  return DIM + "─".repeat(cols) + RESET;
}
```

根据终端宽度动态生成。

### Markdown 渲染

```typescript
function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
}
```

简单的正则替换，支持 **粗体**。

## 状态管理

### messages 数组

```typescript
const messages: Message[] = [];
```

存储完整的对话历史：

```typescript
// 用户消息
{ role: "user", content: "读取 package.json" }

// 助手消息（包含工具调用）
{ role: "assistant", content: [
  { type: "tool_use", id: "...", name: "read", input: {...} }
]}

// 工具结果（作为用户消息）
{ role: "user", content: [
  { type: "tool_result", tool_use_id: "...", content: "..." }
]}
```

### 内存管理

目前简单的数组存储，长时间对话可能需要注意：
- 使用 `/c` 清空历史
- 未来可实现自动摘要或截断

## 错误处理

### API 错误

```typescript
try {
  resp = await callApi(messages);
} catch (err) {
  console.log(`${RED}API error: ${err}${RESET}`);
  break;  // 退出内层循环，等待新用户输入
}
```

### 工具错误

工具内部错误通过返回字符串处理：
```typescript
return "error: file not found";
```

## 扩展点

### 添加新的特殊命令

```typescript
if (userInput === "/newcommand") {
  // 实现功能
  continue;
}
```

### 修改提示词

```typescript
const SYSTEM_PROMPT = `自定义提示词
可以包含更多指令，如：
- 代码风格要求
- 回答格式要求
- 特定领域的知识
`;
```

### 添加日志记录

```typescript
// 在关键位置添加日志
console.log(`${DIM}[DEBUG] Calling tool: ${name}${RESET}`);
```
