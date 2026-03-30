# clausidian Developer Guide

为 clausidian 贡献代码的完整指南 — 从添加命令到扩展 MCP 工具。

**目录:**
- [开发环境](#开发环境) — 本地设置
- [新增命令](#新增命令) — 3 步添加 CLI 命令
- [扩展 MCP](#扩展-mcp) — 集成 Claude Code
- [写测试](#写测试) — 单元测试规范
- [代码风格](#代码风格) — 项目约定
- [发布流程](#发布流程) — 如何发布版本
- [常见问题](#常见问题) — FAQ

---

## 开发环境

### 1. 克隆和安装

```bash
git clone https://github.com/redredchen01/clausidian.git
cd clausidian
npm install
```

### 2. 运行测试

```bash
npm test                 # 运行所有 168 个测试
npm run test -- journal  # 运行特定测试
```

### 3. 试用 CLI

```bash
node bin/cli.mjs help           # 显示帮助
node bin/cli.mjs init /tmp/test # 测试初始化
cd /tmp/test
node /path/to/clausidian/bin/cli.mjs journal
```

### 4. 项目结构

```
clausidian/
├── bin/
│   └── cli.mjs                      # CLI 入口点
├── src/
│   ├── registry.mjs                 # 命令注册表（CLI + MCP）
│   ├── vault.mjs                    # 核心 API（读写笔记、搜索等）
│   ├── index-manager.mjs            # 索引重建（_tags.md, _graph.md）
│   ├── bm25.mjs                     # BM25 搜索算法
│   ├── mcp-server.mjs               # MCP 协议实现
│   ├── templates.mjs                # 模板引擎
│   ├── dates.mjs                    # 日期工具
│   ├── search-cache.mjs             # 5 分钟 TTL 缓存
│   ├── journal-utils.mjs            # 日志分析 (A1-A5)
│   ├── commands/                    # 50+ 个命令实现
│   │   ├── journal.mjs
│   │   ├── note.mjs
│   │   ├── search.mjs
│   │   └── ... (50+ files)
│   ├── types.mjs                    # TypeScript 定义（JSDoc）
│   └── help.mjs                     # 帮助文本生成
├── test/                            # 24 个测试文件，168 个测试
│   ├── vault.test.mjs
│   ├── commands.test.mjs
│   └── ...
├── scaffold/                        # 模板和 agent 配置
│   ├── templates/
│   ├── .claude/commands/
│   └── .cursor/rules/
├── skill/
│   └── SKILL.md                     # /obsidian skill 定义
├── package.json
├── README.md
├── ARCHITECTURE.md
└── CONTRIBUTING.md
```

---

## 新增命令

### 3 步流程

#### Step 1: 创建命令模块

文件: `src/commands/my-command.mjs`

```javascript
/**
 * 我的命令的简单描述
 * @type {import('../types').CliCommand}
 */
export default {
  name: 'my-command',
  description: 'What this command does',
  usage: 'my-command <arg1> [--flag value]',

  // MCP 模式（可选，用于 Claude Code）
  mcpSchema: {
    arg1: {
      type: 'string',
      description: 'First argument description'
    },
    flag: {
      type: 'string',
      description: 'Optional flag'
    },
  },
  mcpRequired: ['arg1'],  // 必需参数

  /**
   * 命令实现
   * @param {string} vaultPath - Vault 路径
   * @param {object} flags - 解析的标志
   * @param {string[]} positional - 位置参数
   * @returns {Promise<object>} 返回结果
   */
  async run(vaultPath, flags, positional) {
    const { Vault } = await import('../vault.mjs');
    const vault = new Vault(vaultPath);

    // 获取参数
    const arg1 = flags.arg1 || positional[0];
    if (!arg1) {
      throw new Error('Usage: clausidian my-command <arg1>');
    }

    // 实现逻辑
    const result = await vault.search(arg1);

    // 返回结果
    if (flags.json) {
      return result;  // CLI 自动转换为 JSON
    }

    // 人类可读的输出
    console.log(`Found ${result.length} results for "${arg1}"`);
    return { success: true, count: result.length };
  },
};
```

#### Step 2: 注册命令

编辑 `src/registry.mjs`，在 `COMMANDS` 数组中添加：

```javascript
{
  name: 'my-command',
  description: 'What this command does',
  usage: 'my-command <arg1>',
  mcpSchema: {
    arg1: { type: 'string', description: 'First argument' },
  },
  mcpRequired: ['arg1'],
  async run(root, flags, pos) {
    const { default: myCommand } = await import('./commands/my-command.mjs');
    return myCommand.run(root, flags, pos);
  },
},
```

#### Step 3: 写测试

文件: `test/my-command.test.mjs`

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { default: myCommand } from '../src/commands/my-command.mjs';
import { createTestVault, cleanupTestVault } from './helpers.mjs';

test('my-command - basic usage', async (t) => {
  const vaultPath = createTestVault();

  try {
    // 创建测试笔记
    const vault = new Vault(vaultPath);
    await vault.write('test.md', {
      title: 'Test Note',
      type: 'idea',
      tags: ['test'],
    });

    // 运行命令
    const result = await myCommand.run(vaultPath, {}, ['test']);

    // 验证
    assert.ok(result.success);
    assert.strictEqual(result.count, 1);
  } finally {
    cleanupTestVault(vaultPath);
  }
});

test('my-command - with json flag', async (t) => {
  const vaultPath = createTestVault();

  try {
    const result = await myCommand.run(vaultPath, { json: true }, ['test']);

    // 应该返回结构化数据
    assert.ok(Array.isArray(result));
  } finally {
    cleanupTestVault(vaultPath);
  }
});
```

运行测试：
```bash
npm test -- my-command
```

---

## 扩展 MCP

### MCP 协议简介

MCP (Model Context Protocol) 允许 Claude Code 调用你的命令。每个命令自动成为 MCP "工具"。

### 添加新 MCP 工具

当你在 `registry.mjs` 中添加命令时，它会自动成为 MCP 工具：

```javascript
{
  name: 'my-command',
  description: 'User-facing description',
  mcpSchema: {              // 这定义了 MCP 工具的参数
    param1: {
      type: 'string',
      description: 'Parameter description for Claude'
    },
    param2: {
      type: 'number',
      description: 'Another parameter'
    }
  },
  mcpRequired: ['param1'],  // 必需参数
  async run(root, flags, pos) {
    // 实现
  }
}
```

### MCP 数据类型

支持的参数类型：

```javascript
mcpSchema: {
  // 字符串
  title: {
    type: 'string',
    description: 'Note title'
  },

  // 数字
  limit: {
    type: 'number',
    description: 'Result limit'
  },

  // 布尔值
  json: {
    type: 'boolean',
    description: 'JSON output'
  },

  // 枚举
  status: {
    type: 'string',
    enum: ['active', 'draft', 'archived'],
    description: 'Note status'
  },

  // 数组
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: 'Tag list'
  }
}
```

### 在 Claude Code 中使用

安装后运行：
```bash
clausidian setup ~/my-vault
```

然后在 Claude Code 中：
```
/obsidian my-command param1=value
/obsidian search "keyword" --type project
/obsidian create-note "Title" idea
```

---

## 写测试

### 测试结构

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { Vault } from '../src/vault.mjs';
import { createTestVault, cleanupTestVault } from './helpers.mjs';

test('feature name', async (t) => {
  const vaultPath = createTestVault();

  try {
    // 设置
    const vault = new Vault(vaultPath);

    // 执行
    const result = await vault.search('keyword');

    // 验证
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  } finally {
    cleanupTestVault(vaultPath);
  }
});
```

### 常见断言

```javascript
// 等值
assert.strictEqual(actual, expected);

// 包含
assert.ok(actual.includes('text'));

// 数组
assert.ok(Array.isArray(result));
assert.strictEqual(result.length, 3);

// 对象
assert.deepStrictEqual(obj, { key: 'value' });

// 错误
assert.throws(() => func(), Error);
```

### 测试 vault 操作

```javascript
import { Vault } from '../src/vault.mjs';

const vault = new Vault(vaultPath);

// 写笔记
await vault.write('my-note.md', {
  title: 'My Note',
  type: 'idea',
  tags: ['test'],
  body: '# Content\n\nSome text'
});

// 读笔记
const note = await vault.read('my-note.md');
console.log(note.title, note.body);

// 搜索
const results = await vault.search('keyword');

// 更新
await vault.updateNote('my-note.md', {
  status: 'archived'
});

// 删除
await vault.delete('my-note.md');

// 获取关系
const related = await vault.findRelated('my-note');

// 获取反向链接
const backlinks = await vault.backlinks('my-note');
```

### 运行测试

```bash
# 所有测试
npm test

# 单个测试文件
npm test -- journal

# 特定测试
npm test -- journal "journal - create today"

# 显示覆盖率
npm test -- --coverage
```

---

## 代码风格

### 命名约定

```javascript
// 文件: 短横线分隔（kebab-case）
// my-command.mjs

// 函数: 驼峰式（camelCase）
async function createNote() {}

// 常量: 大写（UPPER_CASE）
const DEFAULT_LIMIT = 10;

// 类: 帕斯卡式（PascalCase）
class VaultManager {}

// 私有方法: 下划线前缀
async _syncIndices() {}
```

### 注释规范

使用 JSDoc 为所有导出函数添加注释：

```javascript
/**
 * 搜索 vault 中的笔记
 * @param {string} keyword - 搜索关键词
 * @param {object} options - 搜索选项
 * @param {string} [options.type] - 笔记类型过滤
 * @param {string} [options.tag] - 标签过滤
 * @returns {Promise<object[]>} 搜索结果数组
 * @throws {Error} 如果 vault 不存在
 *
 * @example
 * const results = await vault.search('api');
 * // => [{ filename: 'build-api', score: 8.5 }, ...]
 */
async function search(keyword, options = {}) {
  // 实现
}
```

### 错误处理

总是包含有用的错误信息：

```javascript
if (!vaultPath) {
  throw new Error('Vault path required (set OA_VAULT or pass as argument)');
}

if (!note) {
  throw new Error(`Note "${filename}" not found in ${this.root}`);
}
```

### 代码示例

```javascript
// ✅ 好
const notes = results.filter(n => n.score > 0.5);

// ✅ 也好（更清晰）
const filteredNotes = results.filter(note => {
  return note.score > 0.5;
});

// ❌ 不好（过度简化）
const a = r.filter(x => x.s > 0.5);
```

---

## 发布流程

### 版本号规范

遵循 [Semantic Versioning](https://semver.org/)：
- **MAJOR** (x.0.0) — 破坏性改动
- **MINOR** (0.x.0) — 新功能，向后兼容
- **PATCH** (0.0.x) — 错误修复

### 发布检查清单

```bash
# 1. 更新版本号
npm version minor  # 或 major/patch

# 2. 更新 CHANGELOG.md
# 记录：新增功能、改进、修复、已知问题

# 3. 验证测试通过
npm test

# 4. 检查文档
npm run test:docs

# 5. Commit 和 Push
git add -A
git commit -m "Release v2.5.1"
git push origin main

# 6. 标记版本
git tag v2.5.1
git push origin v2.5.1

# 7. 发布到 npm（自动通过 CI/CD）
# 或手动: npm publish
```

### CHANGELOG.md 格式

```markdown
## [2.5.1] - 2026-03-30

### Added
- New command: `smart-suggest` for AI recommendations

### Fixed
- Bug: broken links not detected in nested directories

### Improved
- Performance: search cache now supports 10K+ notes

### Security
- Updated dependencies to latest patches

[2.5.1]: https://github.com/.../compare/v2.5.0...v2.5.1
```

---

## 常见问题

### Q1: 如何添加一个新的笔记类型？

**A:** 修改 `src/types.mjs` 中的枚举：

```javascript
export const NOTE_TYPES = {
  AREA: 'area',
  PROJECT: 'project',
  RESOURCE: 'resource',
  IDEA: 'idea',
  // NEW_TYPE: 'new-type',  // 添加
};
```

然后更新所有引用该类型的命令和验证。

### Q2: 如何添加新的索引类型？

**A:** 编辑 `src/index-manager.mjs`：

```javascript
async rebuildMyIndex() {
  const notes = await this.vault.scanNotes();
  // 构建索引
  const index = {};
  // ...
  await this.vault.write('_my-index.md', {
    title: 'My Index',
    body: this._formatIndex(index),
  });
}
```

### Q3: 如何优化搜索性能？

**A:** 搜索使用 BM25 算法 + 5 分钟缓存。优化建议：

1. **增量索引** — 仅索引改动的笔记
2. **嵌入式搜索** — 对大 vault 使用向量搜索
3. **批处理** — 并行化多个操作

### Q4: 如何处理 macOS 特定功能？

**A:** 使用功能检测：

```javascript
import { execSync } from 'child_process';

function isMacOS() {
  return process.platform === 'darwin';
}

if (isMacOS()) {
  // macOS 专用代码（例如: open in Obsidian）
  execSync(`open -a Obsidian "${notePath}"`);
}
```

### Q5: 如何添加 MCP 工具而不创建 CLI 命令？

**A:** 你可以在 `src/mcp-server.mjs` 中直接定义：

```javascript
const tools = [
  {
    name: 'my-tool',
    description: 'Tool description',
    inputSchema: {
      type: 'object',
      properties: {
        param: { type: 'string' }
      }
    },
    async handler(params) {
      // 实现
    }
  }
];
```

### Q6: 测试时如何模拟文件系统？

**A:** 使用 `tmp` 包创建临时 vault：

```javascript
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

function createTestVault() {
  return mkdtempSync(path.join(tmpdir(), 'clausidian-'));
}

function cleanupTestVault(vaultPath) {
  rmSync(vaultPath, { recursive: true, force: true });
}
```

### Q7: 如何贡献国际化支持？

**A:** 创建 `src/i18n/` 目录：

```javascript
// src/i18n/en.mjs
export const messages = {
  'note-created': 'Note created: {filename}',
  'note-not-found': 'Note "{filename}" not found',
};

// src/i18n/zh-CN.mjs
export const messages = {
  'note-created': '笔记已创建: {filename}',
  'note-not-found': '笔记 "{filename}" 未找到',
};
```

### Q8: 如何处理向后兼容性？

**A:** 始终版本化 API：

```javascript
// 旧 API（保留用于兼容性）
function oldApiName(params) {
  // 调用新 API
  return newApiName(params);
}

// 新 API
function newApiName(params) {
  // 实现
}
```

在 CHANGELOG 中标记为已弃用，给用户迁移时间。

---

## 有用的资源

- **[ARCHITECTURE.md](../ARCHITECTURE.md)** — 系统设计细节
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — 贡献流程
- **[README.md](../README.md)** — 项目概览
- **[API 参考](./API.md)** — CLI 命令完全参考

---

*准备好贡献了吗？创建 PR 到 [GitHub](https://github.com/redredchen01/Clausidian)！*
