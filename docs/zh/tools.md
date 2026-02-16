# 工具实现指南

nanocode 提供了六种核心工具，每种工具都遵循相同的设计模式。本文档详细介绍工具的实现原理和如何添加新工具。

## 工具架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         工具调用流程                             │
├─────────────────────────────────────────────────────────────────┤
│  1. LLM 生成 tool_use 请求                                       │
│           ↓                                                      │
│  2. main.ts 解析 tool_use block                                  │
│           ↓                                                      │
│  3. runTool(name, args) 被调用                                   │
│           ↓                                                      │
│  4. Zod Schema 验证参数                                          │
│           ↓                                                      │
│  5. 调用对应的 handler 函数                                      │
│           ↓                                                      │
│  6. 返回结果字符串                                               │
└─────────────────────────────────────────────────────────────────┘
```

## 工具注册表

所有工具在 `TOOLS` 对象中注册：

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

## 各工具详解

### 1. read - 文件读取

**功能**: 读取文件内容并添加行号

**实现要点**:
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

**关键设计**:
- 使用 `padStart(4)` 确保行号对齐
- 格式: `   1| content`，方便后续 edit 定位
- 支持分页读取大文件

**使用示例**:
```
输入: { path: "/tmp/test.ts", offset: 0, limit: 5 }
输出:
   1| import { z } from "zod";
   2|
   3| const schema = z.object({
   4|   name: z.string(),
   5| });
```

### 2. write - 文件写入

**功能**: 创建或覆盖文件

**实现要点**:
```typescript
export function write(args: WriteParams): string {
  writeFileSync(args.path, args.content);
  return "ok";
}
```

**注意事项**:
- 直接覆盖，无备份机制
- 返回简单字符串便于确认

### 3. edit - 文件编辑

**功能**: 查找替换文本

**实现要点**:
```typescript
export function edit(args: EditParams): string {
  const text = readFileSync(args.path, "utf-8");
  const old = args.old;
  const replacement = args.new;

  // 安全检查：old 必须存在
  if (!text.includes(old)) return "error: old_string not found";

  // 安全检查：old 必须唯一（除非 all=true）
  const count = text.split(old).length - 1;
  if (!args.all && count > 1)
    return `error: old_string appears ${count} times, must be unique (use all=true)`;

  // 执行替换
  const result = args.all
    ? text.replaceAll(old, replacement)
    : text.replace(old, replacement);

  writeFileSync(args.path, result);
  return "ok";
}
```

**安全机制**:
1. 检查 `old` 是否存在
2. 检查 `old` 是否唯一（防止误替换）
3. `all` 参数控制是否全部替换

**与 read 配合**:
- read 输出的行号格式便于人工定位
- edit 依赖精确匹配，适合代码修改

### 4. glob - 文件匹配

**功能**: 按模式查找文件，按修改时间排序

**实现要点**:
```typescript
export function glob(args: GlobParams): string {
  const base = args.path ?? ".";
  const pattern = `${base}/${args.pat}`.replace("//", "/");
  const files = globSync(pattern);

  // 按修改时间倒序
  files.sort((a, b) => {
    const ma = safeGetMtime(a);
    const mb = safeGetMtime(b);
    return mb - ma;  // 新的在前
  });

  return files.join("\n") || "none";
}
```

**排序逻辑**: 最近修改的文件排在前面，便于找到活跃文件。

### 5. grep - 文本搜索

**功能**: 递归搜索文件内容

**实现要点**:
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
      // 跳过不可读文件
    }
  }

  return hits.join("\n") || "none";
}
```

**输出格式**: `filepath:lineNumber:content`

**性能考虑**:
- 限制最多 50 条结果
- 忽略读取错误的文件

### 6. bash - 命令执行

**功能**: 执行 shell 命令

**实现要点**:
```typescript
export function bash(args: BashParams): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(args.cmd, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outputLines: string[] = [];

    // 实时显示输出
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

    // 30 秒超时
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

**安全特性**:
- 30 秒超时保护
- 实时显示输出（带缩进和分隔符）
- 同时捕获 stdout 和 stderr

## 添加新工具的步骤

### 步骤 1: 在 types.ts 添加 Schema

```typescript
export const NewToolSchema = z.object({
  param1: z.string().describe("参数1描述"),
  param2: z.number().optional().describe("参数2描述"),
});

export type NewToolParams = z.infer<typeof NewToolSchema>;
```

### 步骤 2: 在 tools.ts 实现 handler

```typescript
export function newTool(args: NewToolParams): string {
  // 实现逻辑
  return "结果";
}
```

### 步骤 3: 注册到 TOOLS

```typescript
export const TOOLS: Record<string, ToolConfig<any>> = {
  // ... 现有工具
  newTool: {
    description: "新工具的描述",
    schema: NewToolSchema,
    handler: newTool,
  },
};
```

### 完整示例：添加 cat 工具

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

// 注册
const TOOLS = {
  // ...
  cat: {
    description: "Concatenate files",
    schema: CatSchema,
    handler: cat,
  },
};
```

## 工具设计原则

### 1. 单一职责
每个工具只做一件事，保持简单。

### 2. 返回字符串
所有工具返回字符串，便于 LLM 理解：
- 成功: `"ok"` 或结果内容
- 失败: `"error: 描述"`

### 3. 参数验证
依赖 Zod 进行参数验证，不要重复实现。

### 4. 错误处理
```typescript
try {
  // 操作
} catch {
  return "error: 具体原因";
}
```

### 5. 安全性考虑
- 限制命令执行时间
- 验证文件路径
- 防止意外批量修改
