# 架构设计

## 整体架构图

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

## 模块依赖关系

```
main.ts
  ├── imports types.ts (类型定义)
  ├── imports tools.ts (工具函数)
  └── imports utils.ts (通用工具)

tools.ts
  ├── imports types.ts (Schema 和类型)
  └── imports utils.ts (safeGetMtime, 颜色)

types.ts
  └── 无依赖 (纯类型定义)

utils.ts
  └── 仅依赖 Node.js 内置模块
```

## 数据流

### 1. 用户输入到 API 调用

```
用户输入 → main.ts:main() → callApi() → Anthropic API
```

### 2. API 响应处理

```
API Response → ContentBlock[] → 文本显示 / 工具调用
```

### 3. 工具调用流程

```
tool_use block → runTool(name, args) → TOOLS[name].handler(parsedArgs) → 结果
                      ↑
                      └── Zod Schema 验证
```

### 4. 工具结果回传

```
工具结果 → ToolResult[] → 添加到 messages → 再次调用 API
```

## 核心概念

### 1. Agent Loop (智能体循环)

```typescript
while (true) {
  // 1. 获取用户输入
  // 2. 调用 API
  // 3. 处理响应内容
  // 4. 如有工具调用，执行工具
  // 5. 将结果回传给 API
  // 6. 重复直到没有工具调用
}
```

### 2. 工具注册表

所有工具通过 `TOOLS` 对象注册：

```typescript
const TOOLS: Record<string, ToolConfig<any>> = {
  read: { description, schema, handler },
  write: { description, schema, handler },
  // ...
};
```

### 3. Schema 生成

使用 Zod v4 的 `toJSONSchema()` 方法自动生成 Anthropic API 所需的 JSON Schema：

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

## 设计决策

### 为什么使用 Zod？

1. **类型安全**: Schema 定义即类型定义
2. **运行时验证**: 自动验证 API 传入的参数
3. **JSON Schema 生成**: 直接生成 Anthropic API 需要的格式
4. **类型推断**: 使用 `z.infer<typeof Schema>` 获取参数类型

### 为什么拆分模块？

| 模块 | 职责 | 优点 |
|------|------|------|
| types.ts | 类型定义 | 集中管理，避免循环依赖 |
| utils.ts | 通用工具 | 可复用，与业务逻辑分离 |
| tools.ts | 工具实现 | 清晰的工具注册机制 |
| main.ts | 流程控制 | 单一入口，职责清晰 |

### 为什么选择 tsx？

- 直接运行 TypeScript，无需编译步骤
- 支持 ESM 模块
- 与 Node.js 原生兼容
