# nanocode 学习指南

## 项目简介

nanocode 是一个基于 TypeScript 的极简 Claude Code 替代实现，支持与 Anthropic API 交互，通过工具调用的方式完成代码编辑、文件操作、命令执行等任务。

## 核心特性

- **TypeScript 全栈**：使用 TypeScript 编写，类型安全
- **Zod 类型验证**：所有工具参数使用 Zod Schema 定义和验证
- **模块化架构**：代码按功能拆分为独立的模块
- **工具调用**：支持 read/write/edit/glob/grep/bash 六种工具
- **Agent Loop**：自动化的工具调用循环，直到任务完成

## 项目结构

```
nano-ts/
├── src/
│   ├── main.ts       # 主入口：agent loop 和 UI
│   ├── tools.ts      # 工具实现和注册
│   ├── types.ts      # 类型定义和 Zod Schemas
│   └── utils.ts      # 通用工具函数
├── docs/             # 学习文档
├── package.json
└── tsconfig.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 运行程序
npm start

# 类型检查
npm run check
```

## 环境变量

```bash
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_BASE_URL=optional_base_url
MODEL=claude-sonnet-4-5-20250929
```

## 文档导航

- [架构设计](./architecture.md) - 系统整体架构和模块关系
- [类型系统](./types.md) - Zod Schemas 和类型定义
- [工具实现](./tools.md) - 如何添加新工具
- [主循环详解](./main-loop.md) - Agent loop 工作流程
- [开发指南](./development.md) - 如何扩展和调试
