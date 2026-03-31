# HR Bot Phase 2 — 完整规划文档

**版本**: v2.0.0-PLAN
**计划开始**: 2026-04-01
**计划完成**: 2026-06-30
**总工作量**: 195-200 小时
**优先级分布**: P0(132h)、P1(44h)、P2(35h)

---

## 执行摘要

HR Bot v1.0.0 已完成核心基础设施（Telegram bot、数据库、基本命令）。Phase 2 的目标是扩展到**企业级HR管理系统**，引入 5 个全新业务组件，实现高级薪资处理、绩效评估、招聘管理、培训管理和合规报告。

**预期成果**：
- 5 个新组件（Recruitment、Performance、Training、Benefits、Compliance）
- 50+ 个新功能（F1-F50+）
- 100+ 单元测试 + 集成测试
- REST API 完整层（与 Telegram 并行）
- Web 仪表板（基础版）
- >80% 代码覆盖率

---

## Phase 1 (v1.0.0) 回顾

### 当前状态

**已完成模块** (13 个文件，1,793 行)：
- `bot.py` (408 行) — Telegram 命令处理器 + 11 个命令
- `database.py` (270 行) — SQLAlchemy ORM，8 个数据库表
- `payroll.py` (233 行) — 薪资计算引擎（累进税率、社保）
- `mcp_server.py` (368 行) — Claude Agent 集成接口
- `tests/test_bot.py` (174 行) — 基础单元测试
- 配置 + 文档

**支持的 11 个命令**：
1. `/start` — 初始化和欢迎
2. `/help` — 帮助和命令列表
3. `/status` — 系统状态
4. `/profile` — 查看员工档案
5. `/leave` — 请假申请
6. `/payroll` — 薪资查询
7. `/attendance` — 考勤记录
8. `/admin` — 管理员命令
9. `/review` — 绩效评分（占位）
10. `/reports` — 报告生成
11. `/backup` — 数据备份

**核心数据库表** (8 个)：
| 表名 | 目的 | 行数 |
|-----|------|------|
| Employee | 员工档案 | 含薪资、部门、职位 |
| LeaveRequest | 请假申请 | 流程：待审 → 批准/拒绝 |
| AttendanceRecord | 考勤记录 | 每日签到/签出 |
| PayrollRecord | 薪资记录 | 月度处理，状态：草稿→已处理→已支付 |
| PerformanceReview | 绩效评估 | 1-5 评分系统 |
| Document | 文件存储 | 合同、证件 |
| AuditLog | 审计日志 | 合规追踪 |
| BenefitEnrollment | 福利登记 | 占位 |

**薪资计算**：
- 税率：5%, 10%, 20%, 30%（累进制）
- 社保：国家 8.65% + 健康 3.30% + 劳动 1.00%
- 支持月度/年度计算

---

## Phase 2 架构设计

### 5 个新组件

#### 1️⃣ **招聘管理 (Recruitment Management)** — P0 优先级
**工作量**: 44 小时
**目标**: 从招聘启事到入职的完整流程

**子模块**:
- `recruitment_models.py` (120 行) — JobPosting、Candidate、Application、Offer 表
- `recruitment_service.py` (180 行) — 候选人评分、筛选、offer 管理
- `recruitment_handlers.py` (140 行) — Telegram 命令：`/job_post`、`/apply`、`/candidates`、`/offer`
- `recruitment_api.py` (120 行) — REST 端点
- `tests/test_recruitment.py` (200 行) — 15+ 测试用例

**核心功能** (F1-F9):
- F1: 创建招聘启事（职位、薪资范围、技能要求）
- F2: 候选人申请（简历、自荐信、技能自评）
- F3: 自动简历筛选（关键词匹配、评分）
- F4: 筛选工作流（初筛→面试1→面试2→offer）
- F5: Offer 管理和追踪
- F6: 入职检查清单生成
- F7: 招聘报表（漏斗分析、耗时统计）
- F8: 与 Discord/Slack 的招聘通知集成
- F9: 批量操作（导出候选人列表、发送通知）

**数据模型**:
```sql
JobPosting(id, title, description, salary_min, salary_max, department,
           required_skills[], status, created_at, posted_at, closed_at)
Candidate(id, name, email, phone, resume_url, skills[], years_exp,
          created_at, reviewed_by)
Application(id, job_posting_id, candidate_id, status, score,
           cover_letter, reviewed_at, reviewer_id)
Offer(id, candidate_id, job_posting_id, salary, start_date,
      status, accepted_at, rejected_at)
```

---

#### 2️⃣ **绩效评估系统 (Performance Management)** — P0 优先级
**工作量**: 48 小时
**目标**: 360 度评估、目标管理、反馈循环

**子模块**:
- `performance_models.py` (140 行) — Goal、Feedback、PerformanceReview 增强
- `performance_service.py` (200 行) — 评分引擎、360 度聚合、排名
- `performance_handlers.py` (150 行) — `/set_goal`、`/feedback`、`/review_summary`
- `performance_api.py` (130 行) — REST 端点
- `tests/test_performance.py` (220 行) — 18+ 测试用例

**核心功能** (F10-F19):
- F10: 设置 OKR/KPI 目标
- F11: 定期反馈收集（同事、主管、直属报告）
- F12: 360 度评估聚合（N 个反馈源）
- F13: 自动评分排名（百分位数）
- F14: 评估模板管理（通用、部门定制）
- F15: 反馈匿名化处理
- F16: 绩效历史追踪
- F17: 改进计划生成（低分员工）
- F18: 绩效激励建议（晋升、加薪、培训）
- F19: 导出评估报告（含可视化）

**数据模型**:
```sql
Goal(id, employee_id, title, description, weight, target,
     quarter, status, created_at, updated_at)
Feedback(id, from_employee_id, to_employee_id, category,
         score, comment, anonymous, created_at)
PerformanceReview_Enhanced(id, employee_id, period,
                          overall_score, score_breakdown{},
                          reviewer_comments, improvement_plan)
```

---

#### 3️⃣ **员工培训系统 (Training Management)** — P1 优先级
**工作量**: 40 小时
**目标**: 学习路径、技能发展、合规培训

**子模块**:
- `training_models.py` (110 行) — Course、Enrollment、Certificate 表
- `training_service.py` (170 行) — 学习路径推荐、进度追踪、认证颁发
- `training_handlers.py` (130 行) — `/find_course`、`/enroll`、`/progress`、`/certificate`
- `training_api.py` (120 行) — REST 端点
- `tests/test_training.py` (200 行) — 15+ 测试用例

**核心功能** (F20-F28):
- F20: 课程目录管理（外部 LMS 集成：Coursera、Udacity）
- F21: 学习路径推荐（基于岗位、技能差距）
- F22: 员工自主选课
- F23: 培训进度追踪（完成度、成绩）
- F24: 必修课程强制通知
- F25: 认证颁发和管理
- F26: 培训成本分析
- F27: 技能矩阵更新（完成课程后自动）
- F28: 合规培训报告（安全、伦理、法规）

**数据模型**:
```sql
Course(id, title, provider, category, skill_tags[],
       duration_hours, cost, required_for[], created_at)
Enrollment(id, employee_id, course_id, status,
          completion_date, score, certificate_id)
SkillGap(employee_id, skill, current_level, target_level,
        recommended_courses[])
```

---

#### 4️⃣ **福利管理系统 (Benefits Management)** — P1 优先级
**工作量**: 36 小时
**目标**: 福利计划选择、成本预算、合规

**子模块**:
- `benefits_models.py` (100 行) — BenefitPlan、Enrollment、Claim 表
- `benefits_service.py` (150 行) — 福利选择建议、成本计算、发票处理
- `benefits_handlers.py` (120 行) — `/benefits`、`/enroll_plan`、`/file_claim`
- `benefits_api.py` (110 行) — REST 端点
- `tests/test_benefits.py` (180 行) — 14+ 测试用例

**核心功能** (F29-F37):
- F29: 福利计划定义（医疗、牙科、眼科、401k、HSA）
- F30: 开放选择期（年度、变更事件）
- F31: 员工自助报名
- F32: 福利成本估计（员工成本、公司成本）
- F33: 理赔处理流程
- F34: 福利年度支出报告
- F35: 福利合规检查（HIPAA、ACA）
- F36: 家属管理
- F37: 福利对比工具（计划建议）

**数据模型**:
```sql
BenefitPlan(id, name, type, employer_cost, employee_cost,
           coverage_details, plan_year)
Enrollment(id, employee_id, plan_id, beneficiary_id[],
          enrollment_date, effective_date, waived)
Claim(id, employee_id, plan_id, amount, service_date,
     status, submitted_at)
```

---

#### 5️⃣ **合规和报告系统 (Compliance & Reporting)** — P0 优先级
**工作量**: 52 小时
**目标**: 监管报告、审计跟踪、数据治理

**子模块**:
- `compliance_models.py` (130 行) — ComplianceRule、Audit、Report 表
- `compliance_service.py` (220 行) — 报告生成、违规检测、审计日志
- `compliance_handlers.py` (150 行) — `/compliance_status`、`/generate_report`、`/audit_log`
- `compliance_api.py` (130 行) — REST 端点
- `tests/test_compliance.py` (240 行) — 20+ 测试用例

**核心功能** (F38-F50+):
- F38: 法规库维护（GDPR、CCPA、HIPAA、SOX、本地劳法）
- F39: 自动化合规检查（数据保留、隐私、薪资平等）
- F40: 违规告警和补救工作流
- F41: 完整审计日志（谁、什么、何时、为什么）
- F42: 定期合规报告（月度、季度、年度）
- F43: 数据治理仪表板（敏感数据、访问权限）
- F44: 员工培训完成度验证
- F45: 性别/薪资平等报告
- F46: 残疾员工平等机会追踪
- F47: 工作场所安全事件日志
- F48: 合规文件管理（保留期、自动删除）
- F49: 第三方审计支持（数据导出、证明）
- F50: 监管变更通知（订阅）
- F51: 多语言报告（支持国际化）

**数据模型**:
```sql
ComplianceRule(id, code, name, category, requirement,
              effective_date, jurisdiction)
AuditLog_Enhanced(id, user_id, action, resource_type,
                 resource_id, old_values, new_values,
                 ip_address, timestamp)
ComplianceReport(id, period, regulations[], findings[],
                status, generated_at, signed_by)
```

---

### 数据库扩展

**新增表** (13 个):
```
Recruitment: JobPosting, Candidate, Application, Offer
Performance: Goal, Feedback_Enhanced, SkillGap
Training: Course, Enrollment, Certificate, SkillMatrix
Benefits: BenefitPlan, BenefitEnrollment_Enhanced, Claim
Compliance: ComplianceRule, AuditLog_Enhanced, ComplianceReport
```

**修改现有表**:
- `Employee`: 添加 `skills[]`, `certifications[]`, `benefit_plans[]`
- `PayrollRecord`: 添加福利扣除 `benefit_deductions{}`
- `AuditLog`: 扩展字段，添加索引优化

**总表数量**: 8 (v1) → 21 (v2)

---

### API 扩展设计

**现有** (v1):
- `/employees` — CRUD
- `/leave` — 申请、批准
- `/payroll` — 计算、查询

**新增** (v2):
```
[Recruitment]
  POST   /jobs — 创建招聘启事
  GET    /jobs/:id/candidates — 列出候选人
  POST   /candidates/:id/offer — 发送 offer

[Performance]
  POST   /goals — 设置目标
  POST   /feedback — 提交反馈
  GET    /reviews/:employee_id — 获取评估汇总

[Training]
  GET    /courses — 搜索课程
  POST   /enrollments — 报名课程
  GET    /skill-gaps/:employee_id — 技能差距分析

[Benefits]
  GET    /plans — 列出福利计划
  POST   /enrollments — 选择计划
  GET    /estimates/:employee_id — 成本预估

[Compliance]
  GET    /audit-logs — 审计日志查询
  GET    /reports/:type — 生成合规报告
  POST   /compliance-check/:employee_id — 单人合规检查
```

**总 API 数量**: ~15 (v1) → ~45 (v2)

---

## 实现时间线

### Week 1-2: 基础设施和模型 (32h)
- [ ] 数据库迁移脚本 (Alembic) — 8h
- [ ] 新表创建和索引 — 6h
- [ ] ORM 模型定义 (所有 5 个组件) — 10h
- [ ] 单元测试骨架 — 8h

### Week 3-5: 招聘和绩效 (44h)
- [ ] Recruitment 完整实现 — 20h
- [ ] Performance 完整实现 — 24h
- [ ] 集成测试 — 12h
- [ ] 文档和示例 — 8h

### Week 6-8: 培训和福利 (36h)
- [ ] Training 完整实现 — 18h
- [ ] Benefits 完整实现 — 18h
- [ ] 集成测试 — 8h
- [ ] 文档 — 4h

### Week 9-11: 合规和 API 层 (64h)
- [ ] Compliance 完整实现 — 24h
- [ ] REST API 层（所有组件) — 24h
- [ ] 集成测试 — 10h
- [ ] API 文档（OpenAPI/Swagger） — 6h

### Week 12: 仪表板 + 优化 (24h)
- [ ] 基础 Web 仪表板 — 12h
- [ ] 性能优化 — 6h
- [ ] 端到端测试 — 4h
- [ ] 生产就绪检查 — 2h

---

## 组件优先级和依赖

```
v1 Database/ORM (BLOCKING)
  ├─ Recruitment (P0, 44h)
  │  └─ Performance depends on Recruitment (candidate → performer mapping)
  ├─ Performance (P0, 48h)
  │  └─ Training depends on Performance (技能差距 → 培训推荐)
  ├─ Training (P1, 40h)
  │  └─ Compliance depends on Training (培训完成度验证)
  ├─ Benefits (P1, 36h)
  │  └─ Compliance depends on Benefits (福利合规检查)
  └─ Compliance (P0, 52h) [可与其他并行]

REST API Layer (P0) — depends on all 5 components
Web Dashboard (P1) — depends on REST API
```

**关键路径**: DB Migrations → Recruitment → Performance → Training/Benefits → Compliance → API/Dashboard

---

## 测试策略

### 单元测试 (100+)
- Recruitment: 15 tests (候选人评分、工作流)
- Performance: 18 tests (评分算法、360 度聚合)
- Training: 15 tests (学习路径推荐、认证)
- Benefits: 14 tests (成本计算、冲突检测)
- Compliance: 20 tests (规则检查、报告生成)
- 其他: 18 tests (utils、helpers)

**目标**: 100+ 测试，>80% 覆盖率

### 集成测试 (30+)
- Telegram 命令端到端流程（每个组件 2-3 个）
- API 端到端流程（每个组件 2-3 个）
- 跨组件工作流（招聘→入职→培训→绩效）

### 性能测试
- API 延迟 <200ms (p95)
- 并发支持：100+ 用户
- 数据库查询优化

---

## 代码质量标准

- 类型提示 (Python typing) — 100% 覆盖
- Docstring — 所有公共方法
- 错误处理 — try/except with logging
- 安全 — SQL 注入预防（SQLAlchemy ORM）、日志脱敏
- 风格 — PEP 8 + Black formatter

---

## 交付清单

### 代码交付
- [ ] 5 个组件 (540+ 行新代码)
- [ ] 单元和集成测试 (130+ 测试)
- [ ] REST API 层 (400+ 行)
- [ ] 数据库迁移脚本
- [ ] Web 仪表板 (基础版，200+ 行)

### 文档交付
- [ ] ARCHITECTURE.md (更新）
- [ ] API_SPECIFICATION.md (OpenAPI)
- [ ] MIGRATION_GUIDE.md
- [ ] COMPONENT_GUIDES/ (每个组件 1 个文件)
- [ ] TROUBLESHOOTING.md
- [ ] DEPLOYMENT_GUIDE.md

### 运维交付
- [ ] Docker 更新（包含新依赖）
- [ ] CI/CD 流程 (GitHub Actions)
- [ ] 监控告警配置
- [ ] 备份和恢复策略

---

## 风险和缓解

| 风险 | 影响 | 缓解策略 |
|------|------|--------|
| 数据库性能 | 高 | 提前建立索引、使用分区 |
| 集成复杂性 | 高 | 清晰的模块边界、充分的集成测试 |
| 人员资源 | 高 | 按优先级排序（P0 first） |
| 第三方 API（LMS） | 中 | 事先选定供应商、fallback 方案 |
| 合规变更 | 中 | 灵活的规则引擎设计 |

---

## 成功指标

| 指标 | 目标 |
|-----|------|
| P0 完成度 | 100% (132h 完成) |
| P1 完成度 | 90%+ (44h 中的 40h) |
| 代码覆盖率 | >80% |
| 测试通过率 | 100% |
| API 延迟 (p95) | <200ms |
| 文档完整度 | 100% |
| 生产就绪 | Yes |

---

## 后续阶段 (Phase 3-4)

### Phase 3: 高级功能 (4-6 周)
- 员工自助门户（Web/Mobile UI）
- 高级分析（预测性模型、异常检测）
- 国际化（多语言、多货币）
- 集成（与 accounting、HRIS、payroll 系统）

### Phase 4: 生产优化 (2-4 周)
- 性能微优化
- 安全审计和加固
- 灾备演练
- 用户培训和 go-live 支持

---

**文档生成日期**: 2026-03-31
**计划评审日期**: 2026-03-31
**执行开始日期**: 2026-04-01
**预期完成日期**: 2026-06-30

---

*此文档作为 Phase 2 的权威规划指南，所有实现必须遵循此规划。如有重大变更，需更新此文档。*
