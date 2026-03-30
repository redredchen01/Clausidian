# clausidian User Guide

日常使用手册 — 从初始化到知识沉淀的完整工作流。

**目录:**
- [快速开始](#快速开始) — 5 分钟上手
- [核心工作流](#核心工作流) — 日常使用场景
- [PARA 系统](#para-系统) — 笔记组织方法
- [最佳实践](#最佳实践) — 高效管理建议
- [常见场景](#常见场景) — 实战示例
- [故障排除](#故障排除) — 常见问题

---

## 快速开始

### 1. 安装

```bash
npm install -g clausidian
```

### 2. 初始化 Vault

```bash
clausidian init ~/my-vault
cd ~/my-vault
```

自动创建的目录结构：
```
my-vault/
├── 00-INBOX           # 捕捉区 — 快速想法
├── 10-AREAS           # 生活领域（工作、健康、学习等）
├── 20-PROJECTS        # 进行中的项目
├── 30-RESOURCES       # 参考资料和工具库
├── 40-IDEAS           # 想法库
├── 50-ARCHIVE         # 完成或废弃的内容
├── _tags.md           # 标签索引（自动生成）
├── _graph.md          # 知识图（自动生成）
└── AGENT.md           # Agent 配置指南
```

### 3. 设置 Claude Code 集成（可选）

```bash
clausidian setup ~/my-vault
```

这样就可以在 Claude Code 中用 `/obsidian` 命令操作 vault。

---

## 核心工作流

### 日常三板斧

#### 📝 晨间日志

每天早上创建日志，记录计划和思考：

```bash
clausidian journal
```

这会创建 `50-JOURNAL/journal-2026-03-30.md` 并在 Obsidian 中打开。

**日志内容示例:**
```markdown
---
title: "Journal 2026-03-30"
type: journal
date: 2026-03-30
tags: [daily, standup]
---

## 📌 Today's Focus
- [ ] Review API design
- [ ] Merge PR #42
- [ ] Write weekly review

## 📚 Learnings
- Vector search is 3x faster than BM25 for large vaults

## 🎯 Tomorrow
- Implement auth
- Update docs

## 📊 Stats
- 5 projects active
- 12 new ideas captured
```

#### 💡 快速捕捉

碰到想法立即记录（不打断工作流）：

```bash
clausidian capture "Use Raft for distributed consensus"
clausidian capture "Refactor search to async" --tags "performance,backend"
```

创建带时间戳的想法，可后续整理。

#### 🔄 周评论

每周生成知识总结：

```bash
clausidian review
```

系统自动分析本周的日志和笔记，生成：
- 完成事项
- 学习收获
- 下周重点

---

## PARA 系统

clausidian 采用 **PARA** 信息管理系统：

| 类型 | 目录 | 用途 | 例子 |
|------|------|------|------|
| **A**rea | 10-AREAS | 长期领域 | "后端开发", "个人成长", "健康管理" |
| **P**roject | 20-PROJECTS | 进行中的项目 | "构建 API", "重构搜索", "学习 Go" |
| **R**esource | 30-RESOURCES | 参考资料 | "Go 最佳实践", "HTTP 规范", "SQL 优化" |
| **I**dea | 40-IDEAS | 想法、灵感 | "未来功能", "优化方案", "学习计划" |

**活跃生命周期:**

```
Capture → Idea → Project → Resource/Archive
   ↓
晨间回顾时捕捉想法
   ↓
想法相关度高 → 升级为 Project
   ↓
项目完成 → 沉淀为 Resource（留作参考）
   ↓
时间久远 → Archive（保存历史）
```

---

## 最佳实践

### 1️⃣ 日常记录规范

**强制约定:**
- 笔记标题清晰简洁（不超过 10 字）
- 每笔记一个 `type`（area/project/resource/idea）
- 标签用小写（便于聚类）
- `status` 字段维护（active/draft/archived）

**示例:**
```yaml
---
title: "Build REST API"
type: project
tags: [backend, api, v1]
status: active
created: 2026-03-30
updated: 2026-03-30
summary: "Core API gateway with auth"
---
```

### 2️⃣ 标签策略

**推荐做法:**
- 一个笔记 3-5 个标签
- 标签代表领域（backend, ml, golang）或状态（urgent, blocked）
- 避免过度标签化（超过 10 个为警告）

**查看所有标签并统计:**
```bash
clausidian tag list
```

**监控标签使用:**
```bash
clausidian suggest     # AI 会建议合并频繁共现的标签
```

### 3️⃣ 链接规范

**自动链接相关笔记:**
```bash
clausidian link --dry-run      # 预览建议
clausidian link                # 应用链接
```

**手动链接语法:**
在笔记正文中写：`[[build-api]]` 引用其他笔记。

**查看反向链接:**
```bash
clausidian backlinks build-api
```

### 4️⃣ 知识沉淀（A1-A5）

clausidian 内置的自动化分析：

- **A1 话题升温** — 在 2+ 天的日志中出现的话题 → 建议升级为项目
- **A2 想法温度** — 新/活跃/冻结(14天)/归档(30天)
- **A3 陈旧检测** — 资源 > 60天未更新？项目 > 30天？
- **A4 总结标记** — 从日志中检测 #conclusion 和 #resolved 标签
- **A5 链接建议** — 共享 2+ 标签但未链接的笔记

**查看自动化建议:**
```bash
clausidian suggest --limit 20
```

### 5️⃣ 定期维护

**每周检查清单:**
```bash
# 检查孤立笔记（无入站链接）
clausidian orphans

# 找出重复笔记
clausidian duplicates --threshold 0.5

# 找出损坏的链接
clausidian broken-links

# 查看 vault 健康分数
clausidian health
```

**定期清理:**
```bash
# 合并重复笔记
clausidian merge draft-api build-api

# 修复链接
clausidian relink --dry-run
clausidian relink              # 执行修复
```

---

## 常见场景

### 场景 1：日常项目管理

```bash
# 1. 创建新项目
clausidian note "Build Auth System" project \
  --tags "backend,security" \
  --summary "OAuth2 + JWT implementation"

# 2. 早上检查任务
clausidian daily

# 3. 添加进展
clausidian patch auth-system --heading "Progress" \
  --append "- Implemented JWT token generation"

# 4. 更新状态
clausidian update auth-system --status active

# 5. 查看相关资源
clausidian neighbors auth-system --depth 2
```

### 场景 2：知识学习

```bash
# 1. 捕捉学习想法
clausidian capture "Learn about Raft consensus algorithm" --tags "distributed,learning"

# 2. 创建学习资源笔记
clausidian note "Raft Consensus Papers" resource \
  --tags "distributed,algorithms" \
  --summary "Collection of Raft algorithm papers and implementations"

# 3. 创建学习项目
clausidian note "Master Distributed Systems" project \
  --tags "golang,distributed,learning" \
  --summary "Deep dive into distributed systems theory and practice"

# 4. 定期回顾
clausidian search "learning" --type project
```

### 场景 3：周总结

```bash
# 1. 生成周评论
clausidian review

# 2. 查看活动时间线
clausidian timeline --days 7

# 3. 统计成就
clausidian stats

# 4. 找出陈旧项目
clausidian suggest --days 7

# 5. 更新相关项目状态
clausidian update old-project --status archived
```

### 场景 4：跨项目协作

```bash
# 1. 导出项目作为参考
clausidian export projects-backup.json --type project

# 2. 分享给队友
# （手动）

# 3. 别人导入笔记
clausidian import contributed-notes.json
```

### 场景 5：检测和修复问题

```bash
# 1. 检查 vault 质量
clausidian validate

# 2. 找出孤立笔记
clausidian orphans

# 3. 找出重复笔记
clausidian duplicates --threshold 0.6

# 4. 修复链接
clausidian relink --dry-run
clausidian relink

# 5. 查看健康分数
clausidian health
```

---

## 与 Claude Code 集成

### 安装集成

```bash
clausidian setup ~/my-vault
```

### 使用 /obsidian 命令

在 Claude Code 中使用 MCP 工具：

```
/obsidian search "API design"
/obsidian create-note "My Idea" idea --tags "ml,optimization"
/obsidian read build-api
/obsidian update my-project --status active
```

### 优势

- **实时访问** — 在编码中快速查看笔记
- **上下文感知** — Claude 自动链接相关笔记
- **快速记录** — 不中断工作流即可添加笔记

---

## 故障排除

### Q1: "vault not found"

**原因:** 目录不存在或不是 vault

**解决:**
```bash
# 检查目录
ls ~/my-vault

# 重新初始化
clausidian init ~/my-vault
```

### Q2: "note not found"

**原因:** 笔记名称错误

**解决:**
```bash
# 列出所有笔记
clausidian list project

# 检查拼写
clausidian search "api"
```

### Q3: 链接损坏

**原因:** 笔记被删除但引用仍存在

**解决:**
```bash
# 检测损坏的链接
clausidian broken-links

# 自动修复
clausidian relink --dry-run
clausidian relink
```

### Q4: 重复笔记

**原因:** 同一内容有多个版本

**解决:**
```bash
# 检测重复
clausidian duplicates --threshold 0.5

# 合并
clausidian merge draft-api build-api
```

### Q5: 标签混乱

**原因:** 标签拼写不一致

**解决:**
```bash
# 列出所有标签
clausidian tag list

# 重命名标签
clausidian tag rename "bckend" "backend"

# 批量修复
clausidian batch tag --tag "old-tag" --remove "old-tag" --add "new-tag"
```

### Q6: 性能慢

**原因:** vault 太大（>10K 笔记）或索引过期

**解决:**
```bash
# 重建索引
clausidian sync

# 清除搜索缓存
# (自动 5 分钟过期)

# 分割 vault
# 考虑将大项目迁出
```

### Q7: 我想导出备份

**原因:** 需要备份或迁移

**解决:**
```bash
# 导出为 JSON
clausidian export vault-backup.json

# 导出为 Markdown
clausidian export --format markdown

# 导入到新 vault
clausidian init ~/new-vault
cd ~/new-vault
clausidian import vault-backup.json
```

---

## 进阶技巧

### 1. 知识图探索

生成可视化的知识图，导入 Obsidian Canvas 或其他工具：

```bash
clausidian graph --format json > knowledge-graph.json

# 在 Markdown 中嵌入
clausidian graph >> weekly-review.md
```

### 2. 活动时间线

追踪 vault 的演变：

```bash
# 最近 30 天的活动
clausidian timeline --days 30

# 仅显示项目活动
clausidian timeline --days 30 --type project
```

### 3. 批量操作

快速应用标签到多个笔记：

```bash
# 为所有项目添加 "review-needed" 标签
clausidian batch tag --type project --add "review-needed"

# 归档所有 "deprecated" 标签的笔记
clausidian batch archive --tag "deprecated"

# 激活所有 "golang" 笔记
clausidian batch update --tag "golang" --set-status active
```

### 4. 收藏管理

标记重要笔记为收藏：

```bash
# 收藏
clausidian pin build-api

# 查看所有收藏
clausidian pin list

# 取消收藏
clausidian unpin build-api
```

### 5. 定期提醒

使用 launchd（macOS）或 cron（Linux）定期运行命令：

```bash
# 每日 9:00 生成日志
clausidian launchd schedule "0 9 * * *" "clausidian journal"

# 每周一 18:00 生成周评论
clausidian launchd schedule "0 18 * * 1" "clausidian review"
```

### 6. 与 Git 集成

将 vault 放在 Git 仓库中：

```bash
cd ~/my-vault
git init
git add .
git commit -m "Initial vault"

# 定期同步
git add -A
git commit -m "Update: new notes and changes"
git push
```

---

## 工作流速查

| 操作 | 命令 |
|------|------|
| 晨间日志 | `clausidian journal` |
| 快速笔记 | `clausidian capture "idea"` |
| 创建项目 | `clausidian note "Title" project --tags "tag1,tag2"` |
| 查看任务 | `clausidian daily` 或 `clausidian agenda` |
| 查找笔记 | `clausidian search "keyword"` |
| 周总结 | `clausidian review` |
| 检查健康 | `clausidian health` |
| 修复链接 | `clausidian relink --dry-run` 然后 `clausidian relink` |
| 备份 vault | `clausidian export vault-backup.json` |

---

*更多详情见 [API 参考](./API.md)。*
