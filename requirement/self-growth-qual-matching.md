# 自迭代资质匹配（self-growth qual matching）

> **原始需求**（来源：用户在 loop 3 凌晨会话提出"拓展到资质匹配"）。
> 同步登记到根 [REQUIREMENT.md §5](../REQUIREMENT.md) 跟踪状态。

## 1. 一句话

继 scope 自迭代（业务能不能做）之后，把 AI 沉淀能力扩展到 **qual 维度**（公司有没有资质做）—— 算法匹配失败的资质要求文本让 AI 判断应归入哪个资质类别，沉淀成 regex 规则，下次同类公告自动命中。

## 2. 与 scope 自迭代的差异

| 维度 | scope | qual |
|---|---|---|
| 触发文本 | 标题 + 描述（或 raw_text 兜底）| **requirement 字段**（资质要求正文）|
| 已存在的 schema | scope_rules 表已用 | qual_rules 表存在但**未被任何代码读取** |
| 白名单 | matching.IN_SCOPE（业务主营）| QUAL_SCOPE 27 项（业内常见资质类别）|
| 自迭代后回写 | announcements.scope_tags / business_match | announcements.**qual_tags**（loop 4 加的列）|
| 是否全栈可用 | ✓ loop 1+2 已上线 | ✓ loop 3+4 上线 |

## 3. 设计

### 3.1 流程（与 scope 同形态，多了 qual_tags 回写）

```
[scraper] → announcement.requirement 字段非空
                                  ↓
            [qual_error_logs] 或 用户手动点 "AI 学资质"
                                  ↓
            POST /api/qual-rules/learn-from-miss {announcementId}
                                  ↓
            [qualAi.learnQualFromMiss()]
                                  ↓
            call AI (system_settings.ai_api_key)
                                  ↓
            verify keywords ⊂ requirement text
                                  ↓
            reconcile tag → QUAL_SCOPE ∪ existingTags 白名单
                                  ↓
            checkAlreadyCovered (matchExisting 尊重)
                                  ↓
                            INSERT qual_rules (priority=999, source='ai-learned')
                                  ↓
                            patchAnnouncementQual(ann.id, inferQual(...))
                                  ↓
                            返回 UI：applied=true, rule, qualTags
```

### 3.2 复用通用层（loop 5）

`qualAi.learnQualFromMiss` 通过 `services/ruleLearner.js` 调用 8 个工具：
- `callOpenAI` — 统一 OpenAI-compatible chat
- `verifyKeywords` — 长度≥2 + 字面命中（防 AI 幻觉）
- `reconcileWithWhitelist` — 强制 QUAL_SCOPE ∪ existingTags（防 tag 字典污染）
- `checkAlreadyCovered` — 尊重 `ai.matchExisting`（不重复写）
- `compileKeywords / buildDynamicRules` — regex 编译
- `tagNormalize` — NFKC 归一（修繁/简/全角半角）

### 3.3 prompt 设计要点

- system 提示列 QUAL_SCOPE 27 项作为白名单参考
- 关键词要求 2~8 字（资质名词较长，留余量）
- 用户提示用 `[requirement 字段]` 前缀结构化（运维经验，未上 prompt injection 严格防御）

### 3.4 沉淀规则

```sql
INSERT INTO qual_rules (priority, tag, keywords, enabled, source, updated_at)
VALUES (999, <ai.tag>, <verified_keywords as | joined>, 1, 'ai-learned', datetime('now'));
```

- `priority=999`：最低优先级（系统已有规则全跑完后才匹配）
- `source='ai-learned'`：UI 区分 tag、便于审计（与 scopeRules 同模式）
- 部分唯一索引 `uniq_ai_learned_qual_tag_kw` 兜底并发去重

### 3.5 触发入口

- **手动**：`POST /api/qual-rules/learn-from-miss { announcementId }` —— 前端在公告详情页加"AI 学资质"按钮（loop 3 已加）
- **后台 worker**（未来 loop）：cron 扫 `qual_error_logs` 队列批量调用

## 4. 数据流图

```
[scraper] → POST /announcements (requirement 字段)
       ↓
[qual_error_logs]   ←——(条件: requirement 空)
       ↓
[AnnouncementDetail UI] "AI 学资质" 按钮  ← trigger
       ↓
POST /api/qual-rules/learn-from-miss {announcementId}
       ↓
[qualAi.learnQualFromMiss()]
       ↓
[L1] ruleLearner.callOpenAI + verify + reconcile + checkAlreadyCovered
       ↓
[L2] adapter.createQualRule (UNIQUE 兜底)
       ↓
[L3] patchAnnouncementQual(ann.id, inferQual(...))
       ↓
返回 UI：applied, rule, qualTags
```

## 5. 验收（首版）

- [x] 后端 `services/qualAi.js#learnQualFromMiss` 端到端跑通
- [x] `POST /api/qual-rules/learn-from-miss` 路由返回 JSON
- [x] `qual_rules.source` 新增 `'ai-learned'` 取值，老数据兼容
- [x] 关键词为 0 时写 `qual_error_logs`、不写规则
- [x] `announcements.qual_tags` 列 + 回写闭环
- [x] `requirements` 字段为空走 no_requirement_text 路径
- [x] White-list 检查（QUAL_SCOPE ∪ existingTags）
- [x] subagent 审计 + 修 + push

## 6. 后续拓展

- `qual_rules` seed 数据（loop 16 18 条 + loop 21 扩 19 项行业子领域 = 35 条，loop 22 删 2 项 OUT_OF_SCOPE 防污染：PPP咨询资质 / 工程总承包资质）
- 后台 worker 自动批跑 `qual_error_logs`
- 资质规则的命中率 dashboard
- /api/enums 暴露 QUAL_SCOPE 给前端（避免重复定义）

## 7. 关联

- 通用抽象：[self-growth-rule-learner.md](./self-growth-rule-learner.md)
- scope 自迭代：[self-growth-scope-matching.md](./self-growth-scope-matching.md)
- 需求登记：[REQUIREMENT.md §5](../REQUIREMENT.md#5-自迭代匹配机制)
- 设计用户原话："我希望关键词匹配的智能优化机制完善后，你还能基于这个功能拓展到 资质的匹配上"
