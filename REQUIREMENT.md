# REQUIREMENT.md

> **需求 / 想法 / 功能点完整记录**（唯一权威）。按业务域分组。
> 老想法不删除、保留状态变更轨迹（`[ ]` / `[x]` / `[~]`）。
> 行长度 ≤ 20 unit（详见 [DOCS.md §5](./DOCS.md#5-格式约定)）。

## §0. 文档元信息

- 用途：所有需求 / 想法 / 待办的**唯一权威来源**
- 配套：原始快照在 [/requirement/](./requirement/) 各文件中（如 [self-growth-scope-matching.md](./requirement/self-growth-scope-matching.md)）
- 状态：与实现同步 —— [x] = 已上线，[ ] = 待办/未开始，[~] = 进行中

---

## §1. 抓取层（scrapers）

- [x] 三大平台接入（武汉 / 东西湖 / 黄陂）
- [x] 平台可关停开关（cron 跳过）
- [x] Notion 兼容写入（已并入主流程）
- [x] 脱离 Notion，全栈本地化

## §2. 匹配引擎（matching）

- [x] 27 条 scope regex 规则（本地算法兜底）
- [x] AI 复核（gpt-4o-mini 一次性打分）
- [x] AI 配置 UI（Settings modal + DB 持久化）
- [ ] 自迭代匹配机制（见 /requirement）

## §3. 持久化与查询（storage）

- [x] SQLite 替代 Notion 主库
- [x] 30 字段存档 + 索引
- [x] CSV 导出
- [x] 错误日志表（scope / qual）

## §4. Web UI（frontend）

- [x] Dashboard 列表 + 筛选 + 排序
- [x] 平台管理 / 错误日志 / 抓取日志页
- [x] AI 配置 + 测试连接 modal
- [x] 多用户登录 + token
- [x] match_score + 聚合视图
- [x] UI 设计系统重构（token 闭环）
- [ ] 详情页 AI 学一下按钮（前端）

## §5. 自迭代匹配机制

> 详情：[requirement/self-growth-scope-matching.md](./requirement/self-growth-scope-matching.md)
> 状态随提交更新，已完项附 commit hash 日期

- [x] scopeAi 服务（AI 提关键词）(f2b1a5a, 2026-07-10)
- [x] 路由 POST /scope-rules/learn (f2b1a5a, 2026-07-10)
- [x] source='ai-learned' + 部分唯一索引 (f2b1a5a, 2026-07-10)
- [x] 关键词字面验证（防幻觉） (f2b1a5a, 2026-07-10)
- [x] 详情页 AI 学一下按钮 (f2b1a5a, 2026-07-10)
- [x] 真待评估公告端到端冒烟 (f2b1a5a, 2026-07-10)
- [x] subagent 审计 + 缓存下沉 (f2b1a5a, 2026-07-10)
- [x] qual 服务（学习 + 白名单）(bb89745, 2026-07-10)
- [x] qual_tags 回写（announcement）(pending-commit, 2026-07-10)
- [x] qual 前端"AI 学资质"按钮 (bb89745, 2026-07-10)
- [x] qual 审计修复（Loop 4）(9277eaf, 2026-07-10)
- [x] ruleLearner 抽象层（通用）(5b67a95, 2026-07-10)
- [x] ruleLearner 审计修 + 单一源(loop6 commit, 2026-07-10)
- [x] notice_type 第三套自迭代 (loop6 commit, 2026-07-10)
- [ ] 后台 worker 自动批跑
- [ ] dashboard 看 AI 沉淀规则命中率

## §6. 部署 / 运维（deployment）

- [x] 阿里云 47.122.112.224 + nginx + certbot
- [x] bid.1xplore.cn HTTPS 上线
- [x] Express :4002 + 前端静态文件代理

## §7. 业务缺口 / 跨域

- [ ] **资审 / 抽签 / 现场竞价** 等边缘类型 schema 拓展
- [ ] **多企业隔离**（当前单租户）
- [ ] **公告原文落库 + 全文检索**
- [ ] **跨平台去重**（同一公告在多平台发布）
