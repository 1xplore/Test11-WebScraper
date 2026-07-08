# BidIntel — 招标线索本地全栈系统

脱离 Notion，自建端到端本地化方案：**21 个爬虫 → SQLite → Express API → React/Vite 前端看板**。

---

## 快速开始

```bash
# 1. 安装依赖（一次性）
npm install
cd frontend && npm install && cd ..

# 2. 启动 SQLite + 植入种子数据（21 平台 + 27 scope 规则）
node server/src/db/seed.js

# 3. 启动后端 API（端口 4001）
node server/src/server.js

# 4. 另开终端，启动前端 dev server（端口 5173）
cd frontend && npm run dev

# 浏览器打开 http://localhost:5173
```

---

## 架构

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 21 scrapers  │ → │  storage     │ → │  SQLite DB   │
│ (whzbtbxt/   │   │  adapter     │   │  (scraper.db)│
│  dongxihu/…) │   │  (server/)   │   │              │
└──────────────┘   └──────┬───────┘   └──────────────┘
                          ↓
                  ┌──────────────┐
                  │ Express API  │ ← http://localhost:4001
                  │ (server/)    │
                  └──────┬───────┘
                         ↓ (proxy /api/*)
                  ┌──────────────┐
                  │ Vite + React │ ← http://localhost:5173
                  │  (frontend/) │
                  └──────────────┘
```

**核心目录：**

```
├── server/
│   ├── src/
│   │   ├── db/                  SQLite schema + seed + 连接管理
│   │   ├── storage/adapter.js   存储适配层（upsert 保护人工审核字段）
│   │   ├── services/matching.js 业务匹配（算法 + AI 混合）
│   │   ├── routes/*.js          5 个路由文件
│   │   └── server.js            Express 入口
│   └── test/seed-announcements.js  本地开发 seed
├── frontend/
│   └── src/
│       ├── pages/               Dashboard / Platforms / ScopeRules / ScrapeRuns
│       ├── components/          Card / Detail / FilterBar / StatStrip / AppShell
│       ├── components/ui/       9 个 shadcn 组件
│       └── lib/                 axios api + cn util
├── scrapers/                    21 个爬虫（**未改**，复用 platform.js 抽象层）
├── utils/storageRouter.js       Notion ↔ SQLite 切换层
├── utils/notion*.js             Notion 兼容代码（保留以备回退）
└── main.js                      入口，加了 --storage=sqlite|notion 参数
```

---

## 数据模型（SQLite 8 表）

| 表 | 替代的 Notion 库 | 说明 |
|---|---|---|
| `announcements` | 招标线索登记库 | 主表 42 列，含业务匹配 tag、人工审核状态 |
| `platforms` | 招标线索来源库 | 21 个抓取源 + 启用/停用状态 |
| `scope_rules` | 招标线索业务数据库 | 27 条 regex 匹配规则，可手动调整 |
| `scope_error_logs` | 业务匹配错误日志库 | scope_tags=其他 时记录 |
| `qual_error_logs` | 资质匹配错误日志库 | 资质缺失时记录 |
| `scrape_runs` | 抓取行为记录库 | 每天 1 条跨站点日志 |
| `qual_rules` | 资质规则库（预留） | 表已建但未使用 |

**关键设计：**
- `upsertAnnouncement()` 写时不覆盖 `review_status / scrape_status / review_note / reviewed_at / reviewed_by` —— 保护人工审核字段
- `business_match` 由 `inferBusinessMatch(scope_tags)` 自动推断（不在 scraper 里硬编码）
- `project_progress` 由 `inferProgress(item)` 根据日期字段自动推断

---

## API（http://localhost:4001）

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（返回 `ai_enabled` 标志） |
| GET | `/api/enums` | 所有枚举值（business_match / review_status / platform_status…） |
| GET | `/api/stats` | 看板 KPI 数据（总公告数 / 按业务匹配分组 / 按审核状态分组 / 按平台分组） |
| GET | `/api/announcements` | 列表（q / businessMatch / reviewStatus / progress / platformId / district / scopeTag / minContractPrice / maxContractPrice / dateFrom / dateTo / sortBy / sortDir / page / pageSize） |
| GET | `/api/announcements/:id` | 详情 |
| PATCH | `/api/announcements/:id/review` | 更新审核状态 `{ reviewStatus, reviewNote, reviewedBy }` |
| POST | `/api/announcements/:id/reviewed` | 标记已审核（COALESCE 保护 reviewed_at） |
| POST | `/api/announcements/:id/ai-match` | 触发 AI 复核（不写库，返回建议） |
| GET | `/api/platforms` | 平台列表（`?enabledOnly=true` 仅启用） |
| PATCH | `/api/platforms/:scriptId` | 更新平台状态 `{ status, name, homepage, last_error }` |
| GET | `/api/scope-rules` | scope 规则列表 |
| POST | `/api/scope-rules` | 新增规则 |
| PATCH | `/api/scope-rules/:id` | 更新规则 |
| GET | `/api/scrape-runs` | 抓取日志列表 |
| GET | `/api/scrape-runs/last` | 上次抓取时间 |

---

## 运行模式

### SQLite（默认）
```bash
node main.js whzbtbxt --pages 1 --size 10
node main.js --all                                  # 跑所有"已配置运行中"平台
node main.js --all --no-upload                      # 仅爬取，不入库
node main.js --all --no-skip-existing --since-days 3
STORAGE=sqlite node main.js --all
```

### Notion（兼容旧行为）
```bash
STORAGE=notion node main.js whzbtbxt --pages 1 --size 10
# 需要 NOTION_TOKEN 环境变量
```

---

## 业务匹配算法

**算法层**（无 LLM 也能用）：
- 27 条 `scope_rules` 用 regex 跑"标题 + 描述"，命中即得 tag（如 `工程监理` / `造价预算` / `EPC`）
- `inferBusinessMatch()` 根据 IN_SCOPE / OUT_OF_SCOPE 集合判定：主营业务可做 / 部分可做 / 不可做 / 待评估
- `computeLocalScore()` 综合算出 0~1 分

**AI 层**（可选，按环境变量启用）：
- 配 `OPENAI_API_KEY` 后，`POST /api/announcements/:id/ai-match` 调用 LLM 做语义复核
- 综合分 = 0.5 × 算法分 + 0.5 × AI 分
- 不配置时静默降级到本地算法
- 可选 `OPENAI_BASE_URL`（默认 `https://api.openai.com/v1`）/ `OPENAI_MODEL`（默认 `gpt-4o-mini`）/ `AI_MATCH_TIMEOUT_MS`（默认 8000）

**IN_SCOPE 集合**（约 50 个 tag，覆盖造价跟踪 / 结算审计 / 工程验收 等）：
招标代理 / 工程监理 / 工程设计 / 工程勘察 / 造价咨询 / 全过程工程咨询 / 审计 / 投资咨询 / 工程验收 / 安全评估 …

**OUT_OF_SCOPE 集合**（约 25 个 tag）：
施工 / EPC / 工程总承包 / 专业分包 / 材料采购 / 软件开发 / 物业运维 / 环卫养护 / 餐饮外包 …

---

## 与 Notion 旧版的差异

| 维度 | Notion | SQLite |
|---|---|---|
| 数据库 | 7 个 Notion DB | 8 张 SQLite 表 |
| 字段类型 | multi_select / status / rich_text | TEXT (JSON) / REAL / INTEGER / TEXT |
| 关系字段 | 4 个 relation（依赖反向 relation） | 显式外键 + 关联查询 |
| 写入并发 | Notion 5 req/s 限流 | 本地无限制 |
| 查询 | Notion API 反查 | SQLite 索引直接查 |
| AI 匹配 | 仅关键词 | 算法 + 可选 LLM |
| 审核字段保护 | `buildPageProperties` 显式剥离 | `upsertAnnouncement` 不写入这些列 |

---

## 部署

**阿里云服务器 `47.122.112.224` 的部署流程保持不变** —— `scrapers/` 和 `utils/notion*.js` 没动，可以无缝切回 Notion 模式。

```bash
git push gitee master
ssh admin@47.122.112.224 \
  "cd /home/admin/scraper/Test11-WebScraper && \
   git fetch gitee && git reset --hard gitee/master && \
   (git diff HEAD@{1} HEAD --name-only | grep -q package.json && npm install || true)"
```

部署后服务器需要：
- 安装新依赖：`npm install`（多了 better-sqlite3 / express / cors / morgan / dotenv）
- 跑 `node server/src/db/seed.js` 初始化 SQLite
- 默认 `STORAGE=sqlite`，无需 NOTION_TOKEN

---

## 常用命令

```bash
# 看当前 SQLite 内容
node -e "const db=require('./server/src/db'); console.log(db.prepare('SELECT COUNT(*) AS n FROM announcements').get());"

# 重置数据库（开发用）
rm -f data/scraper.db data/scraper.db-shm data/scraper.db-wal
node server/src/db/seed.js

# 测试 API
curl http://localhost:4001/api/health
curl 'http://localhost:4001/api/announcements?pageSize=2' | python3 -m json.tool
curl 'http://localhost:4001/api/stats' | python3 -m json.tool

# 启动前端
cd frontend && npm run dev
```

---

## Roadmap（后续可拓展）

- [ ] 错误日志查看页（`/error-logs`）—— 闭环 scope/qual 匹配错误
- [ ] scope 规则 Web 编辑（前端 inline 编辑 keywords / priority / enabled）
- [ ] 前端"立即抓取"按钮（spawn `node main.js <site>` + 轮询 scrape_runs 进度）
- [ ] AI 匹配端到端联调（OPENAI_API_KEY）
- [ ] 看板增强（收藏 / 倒计时 / CSV 导出 / 按区域聚合）
- [ ] 多用户与认证（token + reviewed_by 真实记录）
- [ ] cron 改造（保持 5:00 AM，加 SQLite 存储结果查询接口）

---

## 关键文件指针

- 后端入口：`server/src/server.js`
- 存储层：`server/src/storage/adapter.js`
- 匹配引擎：`server/src/services/matching.js`
- 前端入口：`frontend/src/main.jsx` → `App.jsx` → `pages/Dashboard.jsx`
- 路由切换：`utils/storageRouter.js`
- main.js：`main.js`（已加 `--storage` 参数）