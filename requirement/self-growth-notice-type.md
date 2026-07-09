# 自迭代公告类型匹配（self-growth notice-type）

> **原始需求**（loop 6 用户原意："研究还有什么也可以适应这种'自主生长'的机制"）。
> 同步登记到根 [REQUIREMENT.md §5](../REQUIREMENT.md)。

## 1. 一句话

第三套自迭代维度：算法目前硬塞 `announcements.notice_type`（'采购公告'/'招标公告'/'资格预审公告'/...），让 AI 学习公告文本里表达类型的关键词，沉淀成 regex 规则，下次同类公告自动命中并回写到 `announcements.notice_type_tags` 字段。

## 2. 业务背景

scraper 已经在 announcements 表硬塞 `notice_type`（8 项 enum），但实际公告里充斥大量变体称呼：
- "公开招标公告" vs "公开招标" vs "招标公告" —— 都属"招标公告"
- "资格预审公告" vs "资审公告" vs "预审公告" —— 都属"资格预审公告"
- "竞争性磋商公告" vs "竞争性磋商" vs "磋商公告"

**当前痛点**：scraper 写死的判断逻辑错估 / 漏判；维护依赖 scraper 代码改动。本服务让 AI 从实战中自我沉淀规则，无须改 scraper。

## 3. 与 scope / qual 自迭代的差异

| 维度 | scope | qual | **notice_type** |
|---|---|---|---|
| 触发文本 | 标题 + 描述 | requirement 字段 | **标题 + 描述（侧重标题）** |
| ENUM 来源 | matching.IN_SCOPE（业务主营）| QUAL_SCOPE 自定义常量 | **`/api/enums` 已存在的 8 项列表** |
| 回写字段 | scope_tags / business_match | qual_tags | **notice_type_tags**（loop 6 新加）|
| 自迭代后是否改主字段 | ✓ 改 scope_tags | ✗ 只追加 qual_tags | **✗ 只追加 notice_type_tags**（主字段 notice_type 由 scraper 决定，不被 AI 覆写避免噪音）|
| 表是否存在 | ✓ loop 1 | ✓ 已有但未被用 | **loop 6 新建 notice_type_rules** |

## 4. 设计

### 4.1 复用抽象（loop 5）

`noticeTypeAi.learnNoticeTypeFromMiss` 通过 `services/ruleLearner.js` 调用 8 个工具（同 scope/qual）。

### 4.2 NOTICE_TYPE_SCOPE 白名单

`server/src/services/noticeTypeAi.js` 内：
```js
const NOTICE_TYPE_SCOPE = new Set([
  '采购公告', '招标公告', '资格预审公告', '竞争性磋商公告',
  '公开招标', '公开公告', '竞争性磋商', '其他',
]);
```

⚠️ **dev debt**：当前跟 `server/src/server.js#/api/enums` 的 `notice_type` 项**两份独立维护**。未来 loop 应抽到 `constants/enums.js` 单一源。

### 4.3 不覆写主字段（重要的设计决定）

`announcements.notice_type` 是当前业务直接消费的字段（domain-specific），由 scraper 写死。本服务**不**改它，避免引入 AI 跟 scraper 判断不一致时把 scraper 的正确判断覆盖掉。

新增 `announcements.notice_type_tags` 列（JSON array）作为 **辅助**：用户在前端 AI 学习后能看到 AI 给的判断（"按 AI 看，公告像是：XXX"），但**业务排序 / 导出 / 报表仍以 scraper 写的主字段为准**。

未来如要并入主字段的逻辑，可把 notice_type_tags 跟 notice_type 投票合并，或直接用 notice_type_tags 替代。

## 5. 数据流图

```
[scraper] → POST /announcements (硬塞 notice_type)
       ↓
[AnnouncementDetail UI] "AI 学类型" 按钮
       ↓
POST /api/notice-rules/learn-from-miss {announcementId}
       ↓
[noticeTypeAi.learnNoticeTypeFromMiss()]
       ↓
call AI → verify → reconcile (whitelist NOTICE_TYPE_SCOPE) → checkAlreadyCovered
       ↓
INSERT notice_type_rules (priority=999, source='ai-learned')
       ↓
patchAnnouncementNoticeType(ann.id, inferNoticeType(...))
       ↓
返回 UI：applied, rule, noticeTypeTags
```

## 6. 验收（首版 / loop 6）

- [x] schema.sql 加 notice_type_rules 表 + UNIQUE partial index
- [x] db/index.js 增量 ALTER 兼容老库
- [x] adapter：list/create/patchNoticeTypeRule + cache invalidator registry + patchAnnouncementNoticeType
- [x] matching.js：inferNoticeType + 30s cache + register invalidator
- [x] services/noticeTypeAi.js：learnNoticeTypeFromMiss（100% 复用 ruleLearner）
- [x] routes/notice-rules.js：GET / POST / PATCH / learn-from-miss
- [x] server.js 注册 /api/notice-rules
- [x] Frontend 公告详情"AI 学一下（公告类型）"按钮（loop 7 加）

## 7. 验收（loop 7 前端）

- [x] lib/api.js learnNoticeTypeFromMiss fetcher
- [x] AnnouncementDetail.jsx 第三 banner（含三层互斥 loading + refresh + feedback）
- [x] 前端 build 通过

## 8. 后续拓展

- NOTICE_TYPE_SCOPE 跟 server.js enums 共享单一源（项目级 refactor）
- notice_type_rules seed 数据（loop 16 ✅ 已落：7 条覆盖 enum 8 项（缺 '其他'——兜底无需关键词），UNIQUE 索引防 boot 重复 INSERT）
- 后台 worker 自动批跑
- 命中率 dashboard
- 与 scraper 当前主字段 notice_type 投票合并（远期）

## 9. 关联

- 通用抽象：[self-growth-rule-learner.md](./self-growth-rule-learner.md)
- scope 自迭代：[self-growth-scope-matching.md](./self-growth-scope-matching.md)
- qual 自迭代：[self-growth-qual-matching.md](./self-growth-qual-matching.md)
- 需求登记：[REQUIREMENT.md §5](../REQUIREMENT.md#5-自迭代匹配机制)
- 设计用户原话："你觉得还有什么也可以适应这种'自主生长'的机制，也欢迎研究研究，尝试尝试"
