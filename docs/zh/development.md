# 开发指南

本文档介绍如何设置开发环境、调试代码以及扩展 nanocode 的功能。

## 开发环境设置

### 前置要求

- Node.js >= 18
- TypeScript 5.7+
- Anthropic API Key

### 安装步骤

```bash
# 1. 克隆项目
git clone <repo-url>
cd nano-ts

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，添加 ANTHROPIC_API_KEY

# 4. 类型检查
npm run check

# 5. 运行
npm start
```

## 项目脚本

| 命令 | 说明 |
|------|------|
| `npm start` | 启动程序 |
| `npm run check` | TypeScript 类型检查 |

## 调试技巧

### 1. 打印调试

在关键位置添加日志：

```typescript
console.log(`${DIM}[DEBUG] messages count: ${messages.length}${RESET}`);
```

### 2. 查看生成的 Schema

临时添加测试代码：

```typescript
// 在 tools.ts 末尾添加
console.log(JSON.stringify(makeSchema(), null, 2));
```

### 3. 测试单个工具

```typescript
// 在 main.ts 开头测试
import { read } from "./tools.js";
console.log(read({ path: "./package.json", offset: 0, limit: 10 }));
```

### 4. 模拟 API 响应

```typescript
// 替换 callApi 临时测试
async function callApi(messages: Message[]) {
  return {
    content: [{
      type: "tool_use" as const,
      id: "test-1",
      name: "read",
      input: { path: "./package.json" }
    }]
  } as any;
}
```

## 扩展功能

### 添加新工具

参考 [tools.md](./tools.md) 的"添加新工具的步骤"章节。

### 修改系统提示词

编辑 `main.ts` 中的 `SYSTEM_PROMPT`：

```typescript
const SYSTEM_PROMPT = `You are a coding assistant with access to tools.
Working directory: ${process.cwd()}

Additional instructions:
- Always use TypeScript best practices
- Prefer async/await over callbacks
- Include JSDoc comments in generated code`;
```

### 添加自定义命令

在 `main.ts` 的用户输入处理部分添加：

```typescript
if (userInput === "/save") {
  // 保存对话历史到文件
  writeFileSync("./history.json", JSON.stringify(messages, null, 2));
  console.log(`${DIM}History saved${RESET}`);
  continue;
}
```

### 集成其他模型

修改 `callApi` 函数支持多模型：

```typescript
async function callApi(messages: Message[], model?: string): Promise<...> {
  if (model?.startsWith("openai:")) {
    // 调用 OpenAI API
    return callOpenAI(messages, model.replace("openai:", ""));
  }
  // 默认 Anthropic
  return client.messages.create({...});
}
```

## 代码规范

### 命名规范

- **文件**: 小写，短横线连接（如 `my-util.ts`）
- **类型**: PascalCase（如 `ToolConfig`, `ReadParams`）
- **函数**: camelCase（如 `runTool`, `safeGetMtime`）
- **常量**: UPPER_SNAKE_CASE（如 `TOOLS`, `SYSTEM_PROMPT`）

### 导入顺序

```typescript
// 1. Node.js 内置
import { readFileSync } from "node:fs";

// 2. 第三方库
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

// 3. 本地模块
import { ReadSchema } from "./types.js";
import { safeGetMtime } from "./utils.js";
```

### 类型安全最佳实践

1. **避免 any**
   ```typescript
   // 避免
   function foo(x: any) { }

   // 推荐
   function foo(x: unknown) { }
   ```

2. **使用具体类型**
   ```typescript
   // 避免
   function read(args: Record<string, unknown>)

   // 推荐
   function read(args: ReadParams)
   ```

3. **充分利用 Zod**
   ```typescript
   // Schema 定义
   const Schema = z.object({ name: z.string() });

   // 类型推断
   type Params = z.infer<typeof Schema>;

   // 运行时验证
   const parsed = Schema.parse(unknownData);
   ```

## 常见问题

### Q: 工具调用返回 "validation error"

LLM 传入的参数不符合 Zod Schema。检查：
- Schema 定义是否正确
- `.describe()` 是否清晰
- 必需字段是否标记为 `.optional()`

### Q: API 返回 400 错误

可能是工具 schema 格式问题：
- 检查 `makeSchema()` 生成的格式
- 确保 `input_schema.type` 是 `"object"`
- 验证 `properties` 不为空

### Q: 程序无法启动

检查：
- `ANTHROPIC_API_KEY` 是否设置
- Node.js 版本 >= 18
- 是否运行 `npm install`

### Q: 类型检查失败

运行 `npm run check` 查看错误：
- 检查导入路径是否正确（需要 `.js` 后缀）
- 确保 tsx 已安装
- 检查 TypeScript 版本

## 性能优化

### 1. 大文件处理

read 工具支持分页：
```typescript
{ path: "./large.log", offset: 0, limit: 100 }
```

### 2. 减少 API 调用

- 合并相关操作到单个工具
- 使用 glob + grep 组合而非多次调用

### 3. 消息历史压缩

长时间对话后可以摘要：
```typescript
// 当 messages 过长时
if (messages.length > 50) {
  const summary = await generateSummary(messages);
  messages = [systemMessage, { role: "user", content: summary }];
}
```

## 贡献指南

### 提交 PR 前检查清单

- [ ] 代码通过 `npm run check`
- [ ] 添加新工具时更新文档
- [ ] 测试基本功能正常
- [ ] 遵循代码规范

### 文档更新

修改代码时同步更新：
- `docs/` 目录下的相关文档
- 代码中的 JSDoc 注释
- README.md（如需要）
