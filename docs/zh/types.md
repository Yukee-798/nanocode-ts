# 类型系统详解

nanocode 使用 TypeScript + Zod 构建完整的类型系统，实现编译时和运行时的双重类型安全。

## 核心类型概览

```
┌──────────────────────────────────────────────────────────────┐
│                     types.ts 类型体系                        │
├──────────────────────────────────────────────────────────────┤
│  Anthropic 相关类型                                          │
│  ├── ContentBlock      消息内容块                            │
│  ├── Message           消息对象                              │
│  └── ToolResult        工具执行结果                          │
├──────────────────────────────────────────────────────────────┤
│  Zod Schemas (运行时验证)                                     │
│  ├── ReadSchema        读取文件参数                          │
│  ├── WriteSchema       写入文件参数                          │
│  ├── EditSchema        编辑文件参数                          │
│  ├── GlobSchema        文件匹配参数                          │
│  ├── GrepSchema        文本搜索参数                          │
│  └── BashSchema        命令执行参数                          │
├──────────────────────────────────────────────────────────────┤
│  推断类型 (编译时类型)                                        │
│  ├── ReadParams        = z.infer<typeof ReadSchema>          │
│  ├── WriteParams       = z.infer<typeof WriteSchema>         │
│  └── ...                                                     │
├──────────────────────────────────────────────────────────────┤
│  工具配置类型                                                 │
│  ├── ToolSchema        Anthropic API 工具格式                │
│  └── ToolConfig<T>     工具配置泛型                          │
└──────────────────────────────────────────────────────────────┘
```

## Anthropic 相关类型

### ContentBlock

```typescript
export type ContentBlock = Anthropic.Messages.ContentBlock;
```

这是 Anthropic SDK 提供的类型，代表消息中的一个内容块，可能是：
- `TextBlock`: 文本内容 `{ type: "text", text: string }`
- `ToolUseBlock`: 工具调用 `{ type: "tool_use", id, name, input }`

### Message

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResult[];
}
```

用于本地存储对话历史：
- `role`: 消息发送者身份
- `content`: 支持三种格式：
  - `string`: 用户输入的纯文本
  - `ContentBlock[]`: API 返回的内容块
  - `ToolResult[]`: 工具执行结果数组

### ToolResult

```typescript
export interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}
```

符合 Anthropic API 要求的工具结果格式：
- `tool_use_id`: 对应 tool_use 的 id
- `content`: 工具执行返回的字符串

## Zod Schema 详解

### Schema 定义模式

所有工具 Schema 遵循统一模式：

```typescript
const SchemaName = z.object({
  field: z.type().describe("描述信息"),
  optionalField: z.type().optional().describe("可选字段"),
});
```

### 各工具 Schema 分析

#### ReadSchema - 文件读取

```typescript
export const ReadSchema = z.object({
  path: z.string().describe("File path to read"),
  offset: z.number().optional().describe("Line offset to start reading from"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
});
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | ✓ | 文件路径 |
| offset | number | ✗ | 起始行号（0-based） |
| limit | number | ✗ | 最大读取行数 |

**使用场景**:
```typescript
// 完整读取
{ path: "/tmp/test.ts" }

// 分页读取
{ path: "/tmp/test.ts", offset: 0, limit: 50 }
```

#### WriteSchema - 文件写入

```typescript
export const WriteSchema = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("Content to write"),
});
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | ✓ | 目标文件路径 |
| content | string | ✓ | 写入内容 |

**注意**: 此操作会直接覆盖文件内容。

#### EditSchema - 文件编辑

```typescript
export const EditSchema = z.object({
  path: z.string().describe("File path to edit"),
  old: z.string().describe("Text to replace"),
  new: z.string().describe("Replacement text"),
  all: z.boolean().optional().describe("Replace all occurrences if true"),
});
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| path | string | ✓ | 目标文件路径 |
| old | string | ✓ | 要被替换的文本 |
| new | string | ✓ | 新文本 |
| all | boolean | ✗ | 是否替换所有匹配 |

**安全机制**:
- `old` 内容必须唯一（除非 `all=true`）
- 防止意外多处修改

#### GlobSchema - 文件匹配

```typescript
export const GlobSchema = z.object({
  pat: z.string().describe("Glob pattern"),
  path: z.string().optional().describe("Base directory"),
});
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| pat | string | ✓ | Glob 模式，如 `"**/*.ts"` |
| path | string | ✗ | 基础目录，默认为当前目录 |

**排序**: 结果按文件修改时间倒序排列。

#### GrepSchema - 文本搜索

```typescript
export const GrepSchema = z.object({
  pat: z.string().describe("Regex pattern to search"),
  path: z.string().optional().describe("Base directory"),
});
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| pat | string | ✓ | 正则表达式模式 |
| path | string | ✗ | 搜索目录，默认为当前目录 |

**限制**: 最多返回 50 条匹配结果。

#### BashSchema - 命令执行

```typescript
export const BashSchema = z.object({
  cmd: z.string().describe("Shell command to run"),
});
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| cmd | string | ✓ | 要执行的 shell 命令 |

**安全限制**:
- 30 秒超时自动终止
- 实时显示命令输出

## 类型推断

### infer 关键字

Zod Schema 可以通过 `z.infer` 提取 TypeScript 类型：

```typescript
export type ReadParams = z.infer<typeof ReadSchema>;
// 等同于：
// type ReadParams = {
//   path: string;
//   offset?: number | undefined;
//   limit?: number | undefined;
// }
```

### 泛型工具配置

```typescript
export interface ToolConfig<T extends z.ZodObject<any>> {
  description: string;
  schema: T;
  handler: (args: z.infer<T>) => string | Promise<string>;
}
```

这是一个泛型接口：
- `T`: 必须是 ZodObject 类型
- `handler` 的参数类型自动从 Schema 推断
- 确保 Schema 和 handler 参数类型一致

**使用示例**:

```typescript
const readConfig: ToolConfig<typeof ReadSchema> = {
  description: "Read file",
  schema: ReadSchema,
  handler: (args) => {
    // args 自动推断为 ReadParams 类型
    return readFileSync(args.path, "utf-8");
  },
};
```

## Anthropic API 格式

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

这是发送给 Anthropic API 的工具定义格式：
- 使用 `toJSONSchema()` 自动生成 `input_schema`
- `required` 数组由 Zod 自动推导（非 optional 字段）

### 自动生成示例

对于 `ReadSchema`：

```typescript
// Zod Schema
const ReadSchema = z.object({
  path: z.string().describe("File path"),
  offset: z.number().optional(),
});

// 生成的 ToolSchema
{
  name: "read",
  description: "Read file...",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      offset: { type: "number", description: "Line offset" }
    },
    required: ["path"]  // offset 是 optional，不包含
  }
}
```

## 类型安全流程

```
1. 定义 Zod Schema
        ↓
2. 使用 z.infer 获取 TS 类型
        ↓
3. 在 handler 中使用具体类型
        ↓
4. 运行时 Zod 验证传入参数
        ↓
5. 验证通过后调用 handler
```

## 最佳实践

### 1. 始终使用 .describe()

为每个字段添加描述，这些描述会传递给 LLM：

```typescript
// 好的做法
z.string().describe("Absolute file path, not directory")

// 不好的做法
z.string()  // LLM 不知道如何使用
```

### 2. 明确标记可选字段

```typescript
// 好的做法
optionalField: z.string().optional()

// 避免
optionalField: z.string().default("")  // 隐藏了可选性
```

### 3. 使用具体类型

```typescript
// 好的做法
function read(args: ReadParams): string

// 避免
function read(args: Record<string, unknown>): string  // 失去类型安全
```

### 4. 利用泛型确保一致性

```typescript
// ToolConfig 确保 schema 和 handler 匹配
const config: ToolConfig<typeof MySchema> = {
  schema: MySchema,
  handler: (args) => { /* args 自动正确类型 */ }
};
```
