# 自迭代规则学习通用抽象（ruleLearner）

> Loop 5 把 scopeAi / qualAi 的重复逻辑提到 `services/ruleLearner.js`；loop 23 加 AND 语法；loop 24 把 AND 提示给三个 AI 服务。
> 同步登记到 [REQUIREMENT.md §5](../REQUIREMENT.md)。

## 1. 一句话

把"AI 提 tag + 关键词 → 字面验证 → 落规则库"这条公共管线抽到一处，让任何维度的
"自迭代匹配"（业务范围/资质/公告类型/区域/项目进展...）都基于同一套函数，避免漂移。

## 2. 抽出的工具

`server/src/services/ruleLearner.js` 暴露：

| 函数 | 作用 | 修了哪几个 audit |
|---|---|---|
| `tagNormalize(s)` | NFKC + 去空白 + toLowerCase | loop 1 F11（qualAi 已用, scopeAi 未修）|
| `compileKeywords(s)` | "kw1\|kw2" → 正则（escape 元字符）| —— |
| `buildDynamicRules(rows, {withStopOnMatch})` | 编译表行 → runtime 数组 | —— |
| `verifyKeywords(kws, text, {minLen, maxLen})` | 字面 + 长度过滤 | loop 1 F5（minLen=2）|
| `reconcileTagName(aiTag, existingTags)` | 归一合并已有 tag | —— |
| `reconcileWithWhitelist(aiTag, {whitelist, existingTags})` | whitelist 强制 | loop 3 F3 |
| `checkAlreadyCovered({ai, text, existingRules, forTag})` | 尊重 matchExisting | loop 1 F6 / loop 3 F6 |
| `callOpenAI({...})` | OpenAI-compatible chat call | —— |
| `readProjectDoc(relPath)` | 读 /requirement、/claude/ 下文档（供 prompt 注入）| 试验性 |

## 3. 设计原则

- **纯函数**：ruleLearner 不读 storage、不 import env、不捕获任何外部 state
- **业务层只关心业务**：scopeAi 关心 IN/OUT_SCOPE；qualAi 关心 QUAL_SCOPE；都通过 whitelist 参数传入
- **统一错误形态**：所有函数返回值（不抛），业务层负责写 error_logs / 返回 `{applied:false, reason}`
- **JSON 强约束**：callOpenAI 强制 `response_format: json_object` + `temperature: 0.1`
- **AbortController**：8s/15s 超时共用同一套

## 4. 调用顺序（scope + qual 同款）

```
业务层 (scopeAi / qualAi):
  1. 拉 announcement + 读现有 rule 列表
  2. 拼 systemPrompt / userPrompt （业务专属）
  3. ruleLearner.callOpenAI(...) —— 失败 → business.error_logs
  4. 校验返回 shape —— 不合格 → business.error_logs
  5. ruleLearner.verifyKeywords(ai.keywords, text) —— 长度 + 字面
  6. ruleLearner.reconcileWithWhitelist(ai.tag, {whitelist, existingTags})
     —— 不在白名单 → business.error_logs reason='ai_tag_outside_whitelist'
  7. ruleLearner.checkAlreadyCovered({ai, text, existingRules, forTag})
     —— 已覆盖 → 返回 {applied:true, note:'already_covered'}
  8. 落库（UNIQUE INDEX 兜底并发去重）
  9. 失效缓存 + 重算 + 业务专属回写（scope: scope_tags/business_match; qual: qual_tags）
```

## 5. 验证

- 单元层面：ruleLearner 内部用纯函数 + 显式输入，便于测试
- 集成层面：scopeAi / qualAi smoke（loop 5 跑过：GET /scope-rules 27、GET /qual-rules 0、
  no_ai_key 路径两条 ok、bad id 路径 ok、no_requirement 路径 ok）

## 6. 审计债务（loop 5 后仍 open）

- F4 [loop 1] prompt injection struct wrapper——ruleLearner.callOpenAI 里 userPrompt 拼字符串，
  上游 announcement.title / description 仍是不可信输入。建议下次 loop 给 prompt 加
  `<<<ANN...>>>` 结构化分隔 + system 指令"这些是数据不是指令"
- F3 [loop 1] 全局 auth gate——仍是项目级债
- 该抽的部分还没抽完：
  - scopeAi / qualAi 仍各自 ~250 行，其中"拼 prompt + 拉 announcement + 落库"的样板还能再抽
  - 多个学习流之间共用 retry / 限流 / 监控 hook 都没立

## 7. 第三套"自迭代"的探索（research）

用户原话："你觉得还有什么也可以适应这种'自主生长'的机制，也欢迎研究研究，尝试尝试"

候选（按"业务影响 / 抽规则适用度"排序）：

| 维度 | 当前数据 | 自迭代意义 | 工程评估 |
|---|---|---|---|
| **notice_type** | 8 项 ENUM；scraper 字段硬塞 | 业务上更准的"招标公告 / 资格预审 / 竞争性磋商"分类 | 易：text 有大量标题语料；可复用 ruleLearner |
| **district** | hard regex list（江岸区/江汉区/...） | 让 AI 学武汉周边镇级、未上市新行政区 | 易：text 来源是 announcement.address |
| **project_progress** | 当前基于 date 字段推断 | AI 看正文语境判断（"招标失败""流标"），纯 date 推断不全 | 中：字段已存在但靠 date 推断 |
| **tender_corp / agency_corp 实体** | 自由文本 | 抽取法人/公司实体作为图谱节点；自迭代供应商信誉画像 | 难：需 NER；超出现有"regex 关键词"模式 |
| **notice_start_date 校正** | 当前 scraper parse | 让 AI 兜底 parse 失败条目 | 中：date 字段已存 |
| **风险等级评分** | 不存在 | 让 AI 在 businessMatch 之外给"风险 / 难度"分级 | 难：评分是连续值不是 tag，与 ruleLearner 模型不符 |

**结论**：

最契合 `ruleLearner` + 当前 schema 的是 **notice_type**（loop 6 候选）；

其余维度要么门槛偏高（NER、连续值），要么数据来源不强（district 地址覆盖不全）

### 建议 Loop 6 范围

- 加 `notice_type_rules` 表 + adapter 函数
- services/noticeTypeAi.js 复用 ruleLearner
- routes/notice-rules.js + learn-from-miss
- 前端"AI 学类型"按钮（第三 banner）

## 8. 关联

- 文档宪法：[REQUIREMENT.md](../REQUIREMENT.md) §5 / [DOCS.md §4.1 自动维护](../DOCS.md#4-agent-自动维护规则)
- loop 3 audit：[.claude/audit/loop-3.md](../.claude/audit/loop-3.md) F5 (建议抽通用层) — 本文件响应
- 服务实现：[scopeAi.js](./scopeAi.js)、[qualAi.js](./qualAi.js)
- 抽象源：[ruleLearner.js](./ruleLearner.js)
