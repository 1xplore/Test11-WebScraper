# DOCS.md

> 本规范约束所有文档的创建、更新与引用方式，确保信息单一权威、无重复，Agent 必须遵守。
> 改任何 doc 之前先看 [§4 Agent 自动维护规则](#4-agent-自动维护规则)。

---

## 1. 文档清单与职责

| 文件 | 文件夹 | 职责 |
|------|------|------|
| `CLAUDE.md` | 根 | Agent 入口：全局文档索引、开发规则、技术栈、目录树、关联项目，并指向本规范 |
| `README.md` | 根 | 人类入口：项目定位、当前状态摘要、快速开始入口、文档导航 |
| `ARCHITECTURE.md` | 根 | 开发阶段划分与功能实现跟踪（§路线图 进度唯一权威） |
| `REQUIREMENT.md` | 根 | 需求 / 想法 / 功能点完整记录（按业务域分组） |
| `DATABASE.md` | 根 | 数据库结构权威（30 张表清单 + 3 ER 图 + 业务规则） |
| `db-schema/*.md` | `db-schema/` | DATABASE 详表：30 张表按 业务 / 主数据 / 平台 三组拆分 |
| `DEPLOYMENT.md` | 根 | 服务器 / Nginx / SSL / 生产部署 / 监控备份（环境变量权威） |
| `CONTRIBUTING.md` | 根 | 开发流程 / Git 规范 / 测试 / 安全 / 文档同步 |
| `SKILL.md` | 根 | 项目经验索引（27 个 gotcha 入口） |
| `skills/gotcha-XX-*.md` | `skills/` | 27 个 gotcha 详情（按时间编号） |
| `DOCS.md` | 根 | 文档角色/权威边界/同步触发规则（本文件，v2.0） |
| `LICENSE.md` | 根 | MIT 许可证 |
| `docs/README.md` | `docs/` | 历史归档 + NDA 区说明 |
| `requests/request-XXX.md` | `requests/` | 原始需求快照（已并入 REQUIREMENT.md） |

- `CLAUDE.md` 专供 Agent 读取，`README.md` 面向人类，其余文档不标注读者。

---

## 2. 各文档权威内容边界

### 2.1 `CLAUDE.md`
- **包含**：全局文档索引（列出所有文档及作用，链接到本规范 `DOCS.md`）、开发规则（命名、架构约束、禁止事项）、技术栈清单（语言、框架、关键库版本）、完整目录树（唯一来源，其他文档不重复）、关联的其他项目（如有）
- **不包含**：环境变量、构建状态、易踩坑要点、部署步骤、需求或进度。
- **必须包含**：指向 `DOCS.md` 的引用，确保 Agent 执行文档操作前先查阅本规范。
- **更新时机**：技术栈变化、目录结构变化、开发规则调整、关联项目变更。

### 2.2 `README.md`
- **包含**：项目定位（一段文字，无代码）、当前开发状态与已实现功能摘要（与 `ARCHITECTURE.md` 进度同步，但只做文字概括，不列 checkbox）、快速开始（指向 `DEPLOYMENT.md` 或 `CONTRIBUTING.md`）、文档导航（与 `CLAUDE.md` 中的索引一致，面向人类表述）
- **不包含**：技术细节、环境变量、目录树、进度 checkbox、需求列表。
- **更新时机**：项目定位变化、整体功能集重大更新、入口文档调整。

### 2.3 `ARCHITECTURE.md`
- **包含**：按开发阶段组织（如 `## §路线图` → `### Phase 1` 等）。每行一个功能，格式：`- [ ] / [x] 功能描述`（≤ 20 unit，见 §5）。明确标注状态：`已完成`、`进行中`、`未开始`。已完成条目附带 commit/PR 和完成日期
- **不包含**：架构设计、目录树、数据流图、环境变量、部署信息。
- **更新时机**：新功能开始、完成、阶段调整。

### 2.4 `REQUIREMENT.md`
- **包含**：所有需求 / 想法 / 功能点，每条 `- [ ] / [x]` checkbox（≤ 20 unit）。按业务域分组（合同/视图/催收/审计/业务缺口/跨域等）。老想法不删除。
- **不包含**：实现细节、技术方案、迁移历史、架构图。
- **更新时机**：新需求提出、需求状态变更、需求完成。

### 2.5 `CONTRIBUTING.md`
- **包含**：开发环境准备（可引用 `DEPLOYMENT.md` 的环境变量或 `CLAUDE.md` 的技术栈）、开发流程（分支策略、commit message 规范）、测试要求：3 个 smoke test + 手动验证清单、文档同步表（改动类型 → 必改文件）、安全注意事项
- **不包含**：完整 env 列表、部署步骤、架构进度。

### 2.6 `DEPLOYMENT.md`
- **包含**（环境变量权威来源）：**环境变量清单**（名称、用途、示例值，不同环境分别列出）、本地与服务器部署步骤、端口分配（精确区分，防止误杀）、关联服务的启停命令、生产数据备份与恢复、部署相关踩坑记录（可链接到 `SKILL.md` §X 或具体 `skills/gotcha-*.md`）、监控备份**当前真实状态**（定期核对）
- **不包含**：技术栈、目录树、进度。
- **更新时机**：环境变量变化、部署流程变更、端口调整、服务器迁移、新踩坑（同步 SKILL.md）。

### 2.7 `DATABASE.md`
- **包含**：30 张表清单（编号 + 表名 + 简述）、3 张 ER 图（mermaid 块：业务核心 / 平台基础设施 / 主数据）、**业务规则**段（cross-cutting：多企业隔离 / 状态机派生 / 合同归档 / 单发票超额 / 软删策略等）、**维护协议**（修改表结构的标准流程、提交检查清单）、相关文件索引
- **详表**：`db-schema/{business,master,platform}.md`（每张表含 SQL DDL / 列说明 / 索引 / 当前业务规则 / 跨表引用）
- **不包含**：迁移历史（已废弃字段、"原 X 收编为 Y"等）—— 在 `git log backend/src/db/` 和 commit message 里
- **唯一权威**：表结构 schema（含表清单 + 详表）的唯一来源；其他文档引用时必须 link 到此
- **更新时机**：每次 schema 变更后同步更新

### 2.8 `SKILL.md` / `skills/*.md`
- **SKILL.md**：项目踩坑 / 经验陷阱的**索引**（分类 + 一行 + 链接 + 关键词），每条对应 `skills/gotcha-XX-*.md` 一份详情
- **skills/gotcha-XX-*.md**：每条 gotcha 一份独立文件，**自包含**（症状 / 根因 / 修复 / 预防）。§X 编号稳定，按踩坑时间顺序追加
- **不包含**：当前项目状态（应在 ARCHITECTURE.md）、架构 / API 列表（应去 DATABASE.md）

### 2.9 `LICENSE.md`
- 静态文件，记录许可证与授权。

---

## 3. 去重与权威来源表

| 信息类型 | 唯一权威文档 | 其他文档引用方式 |
|----------|-------------|-----------------|
| 文档索引、开发规则、技术栈、目录树 | `CLAUDE.md` | 链接引用 |
| 开发进度（功能完成状态） | `ARCHITECTURE.md`（§路线图） | `README.md` 摘要，`REQUIREMENT.md` 联动 |
| 需求列表 | `REQUIREMENT.md` | `ARCHITECTURE.md` 不重复记录需求 |
| 环境变量、部署步骤、端口 | `DEPLOYMENT.md` | 其他文档仅链接 |
| 数据库结构（表清单 + ER + 业务规则） | `DATABASE.md` | 唯一来源；详表在 `db-schema/*.md` |
| 踩坑 / 经验 | `SKILL.md`（索引）+ `skills/gotcha-XX-*.md`（详情） | 详情按需引用 |
| 文档角色 / 权威边界 | 本 `DOCS.md` | 唯一来源 |

---

## 4. Agent 自动维护规则

> **这是项目所有文档同步的唯一定义**。改任何 doc 之前先查本节。避免"隔几个月大清洗一次"——每次有变更时立即同步。

### 4.1 触发场景 → 必改文件

| 触发场景 | 必改文件 |
|---|---|
| **新功能上线**（commit 合并到 master）| `ARCHITECTURE.md §路线图` 加 `[x] xxx（commit, date）` + `REQUIREMENT.md §功能清单` 改 `[x]` + `README.md` 摘要（如整体功能集变） |
| **新需求 / 需求变更** | `REQUIREMENT.md §功能清单` 加 / 改 checkbox（≤ 20 unit） |
| **DB schema 变更** | `DATABASE.md §1/§2/§3` + `db-schema/*.md` 对应表段 + `backend/src/db/index.js` 迁移 + 如新功能：`ARCHITECTURE.md` + `REQUIREMENT.md` |
| **新踩坑 / bug fix** | `skills/gotcha-XX-*.md` 新文件 + `SKILL.md` 索引 + 引用方文档 |
| **服务器 / 部署变化** | `DEPLOYMENT.md` §0/§1/§4/§5 + 标"核对日期" |
| **开发流程变化** | `CONTRIBUTING.md` §1-§6 + `CLAUDE.md` 硬规则（如适用） |
| **doc 结构变化**（增删 doc / 重命名） | `CLAUDE.md` 索引 + `README.md` 文档导航 + `docs/README.md` + 本 `DOCS.md §1` |

### 4.2 反向索引（改 X → 必改 Y）

| 改了 X | 必改 |
|---|---|
| `ARCHITECTURE.md` | `DATABASE.md §3`（行为变）/ `REQUIREMENT.md`（状态变）/ `CLAUDE.md` 索引 |
| `REQUIREMENT.md` | `ARCHITECTURE.md`（状态变）/ `skills/`（新 gotcha） |
| `DATABASE.md` / `db-schema/*.md` | `ARCHITECTURE.md`（新功能）/ `CLAUDE.md` 硬规则 #4（enterprise_id） |
| `DEPLOYMENT.md` | `CLAUDE.md` 硬规则 #3（SSH pkill）/ `skills/`（新部署 gotcha） |
| `SKILL.md` / `skills/*.md` | 引用方（CLAUDE/ARCHITECTURE/REQUIREMENT） |
| `CLAUDE.md` | `README.md` 索引 / `docs/README.md` / `DOCS.md §1` |
| `README.md` | `docs/README.md` |
| `DOCS.md` | `CLAUDE.md` 索引（如 §1 文档清单变） |

### 4.3 漂移检测（每季度）

- `git log` 与文档对照（特别是新功能 commit 是否同时改了 `ARCHITECTURE.md`）
- grep 旧名（如 `Database.md` 改成 `DATABASE.md` 后 grep 旧名应为 0 结果）
- 旧章节标题 / 旧文件名 / 旧锚点链接

### 4.4 旧版"Agent 自动维护规则"（v1.0）

> v2.0 起被 §4.1 / §4.2 替代。保留作历史参考。

| 事件 | 操作 |
|------|------|
| 用户指示"提交远程"（功能完成） | 1. 勾选 ARCHITECTURE.md 对应功能，补 commit/时间。 2. 同步更新 REQUIREMENT.md 关联需求状态。 3. 若整体功能集变化，更新 README.md 摘要。 |
| 新需求提出 | 1. 在 REQUIREMENT.md 添加条目。 2. 若立即开发，在 ARCHITECTURE.md 建立阶段/条目（状态：未开始）。 |
| 目录结构变化 | 更新 CLAUDE.md 目录树。 |
| 环境变量变化 | 更新 DEPLOYMENT.md 环境变量表。 |
| 部署流程/端口变化 | 更新 DEPLOYMENT.md。 |
| 数据库 schema 变更 | 更新 DATABASE.md。 |
| 新流程或踩坑 | 在 /skills 创建文档，更新 SKILL.md 索引。 |

---

## 5. 格式约定

- Agent 高频读取的文档（`CLAUDE.md`、进度表）多用表格、列表、锚点标题，便于快速扫描。
- 所有链接使用相对路径。
- 每个章节首行可加简短摘要。
- `CLAUDE.md` 必须在开头或固定位置包含：
  `> 所有文档操作前，务必阅读 [DOCS.md](./DOCS.md)。`
- **功能 / 需求 checkbox 行的描述长度限制 ≤ 20 unit**（统一适用于 `REQUIREMENT.md` / `ARCHITECTURE.md` 等所有用 checkbox 行的 doc）：
  - 1 个汉字 = 1 unit
  - 1 个英文单词 = 2 unit（不论字母多少）
  - 数字 / 符号 / 空格 = 1 unit each
  - 行末 `(commit-hash, YYYY-MM-DD)` 注释**不计入**字数
  - 例：`- [x] 多企业账号重构（0d1c77f, 2026-05-19）` 描述"多企业账号重构" = 7 unit ✓
  - 例：`- [x] Per-tenant AI+webhook（a891abe, 2026-06-11）` 描述"Per-tenant AI+webhook" = 8 unit（Per-tenant=2 + +=1 + AI=2 + +=1 + webhook=2）✓
  - 例：`- [x] 发票超额判定 6.5% tolerance（547a8b6, 2026-07-06）` 描述"发票超额判定 6.5% tolerance" = 11 unit ✓

---

## 6. 扩展文档存放

- 需求原始记录：`/requirement/` 目录
- 技能详细流程：`/skills/`
- 架构决策、长篇技术说明：`/docs/decisions/` 或 `.claude/memory/`

主文档仅保留摘要和链接，避免冗余。

---

## 7. 本规范的维护

对文档体系的任何修改（如增减文档、调整权威边界）必须首先更新本 `DOCS.md`，并同步更新 `CLAUDE.md` 的文档索引部分。
