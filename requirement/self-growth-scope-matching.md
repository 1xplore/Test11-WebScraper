# 自迭代关键词匹配（self-growth scope matching）

> **原始需求**（来源：用户于 2026-07-10 凌晨会话提出）。
> 同步登记到根 [REQUIREMENT.md §5](../REQUIREMENT.md) 跟踪状态。

## 1. 一句话

把 AI 从"一次性的复核员"升级为"持续教学的老师"：算法匹配失败的公告让 AI 判断应归入哪个 tag、需要哪些关键词，并由代码层验证关键词真伪后将规则沉淀入库，**之后算法自动覆盖此类公告、不再调用 AI**。

## 2. 当前痛点（前置上下文）

- `server/src/services/matching.js` 里 `inferScope()` 是纯本地 regex 规则匹配
- 现有 27 条 `scope_rules`（库表）覆盖不全 → 大量新公告落在 `tags = ['其他']` → `business_match = '待评估'`
- 当前 AI 能力（`matching.aiRefine()`）只返一次性的 tags + score，用完即弃，不写库
- 用户视角：每次开 AI 都要花 token，且学不到东西

## 3. 设计

### 3.1 触发条件

`inferScope(text)` 返回 `['其他']` 时即为 miss。`scope_error_logs` 表已经有这个落点（`platform.js#writeFeedbackLogs`），本次机制消费此表。

### 3.2 AI 调用形态

```
入参：
  - announcement: { id, title, description, raw_text }
  - existingRules: [{ tag, keywords }]   限 enabled=1，按 priority ASC
  - IN_SCOPE / OUT_OF_SCOPE 标签集

prompt (system)：你是工程咨询领域专家。给定一条招标公告 + 当前 regex 规则清单，
  决定它应归入哪个 tag，并给出能让算法自动覆盖的关键词。
prompt (user)：标题 / 描述(截 800 字) / 现有规则清单 / IN/OUT_OF_SCOPE 标签。
  要求 JSON 输出：
    matchExisting: true / false
    tag: string         （现有 tag 名 或 新 tag 名）
    keywords: string[]  （每个**字面命中**本公告文本）
    reason: string
  temperature: 0.1, response_format: json_object

出参校验：
  - keywords 全部在 announcement 文本内 → 视为可信
  - 任一 keyword 不在 → 抛弃该 keyword（AI 幻觉防御）
  - 全部 keyword 都不在 → 视为 AI 失败，写 scope_error_logs reason='ai_no_verifiable_keyword'
```

### 3.3 沉淀规则

```sql
INSERT INTO scope_rules (priority, tag, keywords, stop_on_match, enabled, source)
VALUES (999, <ai.tag>, <verified_keywords as | joined>, 0, 1, 'ai-learned');
```

- `priority=999`：最低优先级，系统已有规则全跑完后才匹配（避免覆盖原生）
- `source='ai-learned'`：UI 区分 tag、便于审计 / 批量 disable
- `stop_on_match=0`：AI 规则不阻断后续规则（多 tag 可叠加）

### 3.4 落库后回写

新规则 `loadActiveScopeRules()` 缓存自动失效（30s 过期足够覆盖实时跑批；如需即时生效，下次调用会重新 load）。

调用 `inferScope()` 重算 announcement 的 tags 和 business_match，PATCH 公告字段。

### 3.5 触发入口（首版）

- **手动**：`POST /api/scope-rules/learn-from-miss { announcementId }` —— 前端在公告详情页加"AI 学一下"按钮
- **后台 worker**（后续 loop）：cron 每跑完 scrape，针对 `scope_error_logs` 队列批量 AI 解析

## 4. 数据流图

```
[scraper] → POST /announcements → inferScope() 命中?
                                       │
                                  不命中=['其他']
                                       │
                            [AnnouncementDetail UI]  ← trigger
                                       │
                            POST /scope-rules/learn-from-miss {announcementId}
                                       │
                            [scopeAi.learnFromMiss()]
                                       │
                            call AI (system_settings.ai_api_key)
                                       │
                            verify keywords ⊂ text
                                       │
                                       ↓ 验证通过
                            INSERT scope_rules (priority=999, source='ai-learned')
                                       │
                            PATCH announcement { scope_tags, business_match }
                                       │
                            返回 UI：applied=true, tag, keywords
                                       │
                                       ↓ 验证失败
                            INSERT scope_error_logs {reason='ai_no_verifiable_keyword'}
                                       │
                            返回 UI：applied=false, error
```

## 5. 验收（首版）

- [ ] 后端 `scopeAi.learnFromMiss(annId)` 端到端跑通（含真 AI 调用、真词验证、真入库）
- [ ] `POST /api/scope-rules/learn-from-miss` 路由返回正确 JSON
- [ ] `scope_rules.source` 新增 `'ai-learned'` 取值，Schema 不破坏老数据
- [ ] `scopeAi.learnFromMiss` 关键词为 0 时不写规则、写错误日志
- [ ] 前端 `AnnouncementDetail` 加"AI 学一下"按钮 + 调用 + 反馈
- [ ] 本地手测一条真实"待评估"公告：从算法不命中 → 触发 AI → 规则入库 → 该公告 auto-match
- [ ] subagent 审计过（独立审）
- [ ] Git 提交 + 推送

## 6. 后续拓展（不在首版）

- `qual_rules` 自迭代（资质关键字同样套路）
- 后台 worker 自动批跑（避免每次都手动）
- AI 沉淀规则的去重合并（同 tag 多次沉淀需合并 keyword 集合）
- 沉淀规则命中率 dashboard
- 多 AI 提供方支持

## 7. 关联

- 现有 `server/src/services/matching.js` —— `inferScope` / `aiRefine`
- 现有 `server/src/storage/adapter.js` —— `loadActiveScopeRules` 缓存策略
- 现有 `scope_rules` 表 —— `source` 列已预留 'seed'/'manual'/'imported'
- 需求登记：[REQUIREMENT.md §5](../REQUIREMENT.md#5-自迭代匹配机制)
