# 自迭代后台 worker（self-growth auto-batch）

> **原始需求**（loop 11 起，用户原指令"自迭代机制完善后..."的最自然延伸）。
> 同步登记到根 [REQUIREMENT.md §5](../REQUIREMENT.md)。

## 1. 一句话

让"自迭代机制"**不再等用户点按钮**：scrape 完接一段 worker，把 `*_error_logs` 队列里未消化的错例批量交给 AI 学。系统自我进化，不需要人。

## 2. 背景：前 6 个 loop 写了什么 vs 缺什么

| Loop | 解决了 | 缺什么 |
|---|---|---|
| 1+2 (scope) | AI 学一次→沉淀 regex 规则 | 用户必须点"AI 学一下"按钮 |
| 3+4 (qual) | 同上 + announcement 回写 | 同上 |
| 6+7 (notice_type) | 同上 + 前端第三按钮 | 同上 |
| 8 (修债) | F1 BLOCKER + enums 单一源 | — |
| 9 (auth) | 全局鉴权 | — |
| 10 (修债) | req.user 复用 + 401 拦截 | — |
| **11 (worker)** | **手动触发 batch**：POST /api/worker/auto-batch | **没接到 cron，定时跑不起来** |
| **12 (本文件)** | **CLI 入口接到 scheduled.js** | — |

## 3. 设计

### 3.1 两个入口同源

| 入口 | 用途 | 鉴权 |
|---|---|---|
| `POST /api/worker/auto-batch` | UI dashboard / 临时手动触发 | mutationsOnlyAuth |
| `scripts/auto-batch.js` CLI | 定时任务（cron）| 无（本地文件执行，自带 trust）|

两条路径都调 `services/autoBatch.runAutoBatch(opts)`，逻辑单源。

### 3.2 CLI 入参

```
node scripts/auto-batch.js              # 默认 types=[scope,qual,notice_type], limit=5
node scripts/auto-batch.js --limit=20  # 每类最多 20 条
node scripts/auto-batch.js --types=scope,qual  # 只跑指定维度
node scripts/auto-batch.js --resolve    # 学成功的 error_log 自动 mark resolved=true
```

注意：默认 **不自动 mark resolved**，原因见 §3.4。

### 3.3 输出

CLI 输出形如：
```
[auto-batch] start with opts={"limit":10}
[auto-batch] processed=10 applied=0 errors=0 skipped=10
[auto-batch] scope: processed=5 applied=0 errors=0 skipped=5
[auto-batch] qual: processed=5 applied=0 errors=0 skipped=5
[auto-batch] notice_type: processed=0 applied=0 errors=0 skipped=0
[auto-batch] done. ranAt=2026-07-09T21:23:08.086Z
```

`scheduled-YYYY-MM-DD.log` 会保留这些行供 ops 调阅。

### 3.4 失败模式与决策

| 原因 | 计数 | 备注 |
|---|---|---|
| `no_ai_key` | skipped | 用户没填 AI key，正常状态；不影响下一次 |
| `announcement_not_found` | skipped | announcement 被删了，rootless 记录 |
| `no_requirement_text` | skipped | qual 学习要求字段非空 |
| AI call 失败（网络/HTTP/超时） | errors | 写 scope_error_logs / qual_error_logs / notice_type_error_logs；下次再试 |
| AI 返回的 tag 不在白名单 | errors | 同上，写错误日志 |
| `applied` | applied | 真入了规则库；error_log 默认仍 `resolved=0` |

**关键决定：applied 不自动 mark resolved。** 人工/dashboard 看过新沉淀的规则、可信后再 mark，避免 bad AI rule 一入库就"消失"。

### 3.5 跟 scheduler 集成

`scripts/scheduled.js` 修改：
- main.js scrape 完，spawnSync 跑 scripts/auto-batch.js
- 5 分钟 timeout（不会把 cron 卡死）
- worker 失败不影响 scrape 已完成的数据入库
- log 写到同一个 scheduled-YYYY-MM-DD.log

生产 cron 时间表（CLAUDE.md 写的是 5:00 跑 scrape）：
- 5:00 scrape → 5:30 worker → 看 log 决定是否人工 review
- 或 5:00 scrape → 立即 worker（更紧凑，scrape 完才学到）

## 4. 验收

- [x] scripts/auto-batch.js CLI 直跑通（processed=10, applied=0, no_ai_key）
- [x] 接到 scripts/scheduled.js main.js 之后
- [x] 与 services/autoBatch.runAutoBatch 同源
- [x] 端到端 cron 模拟：python spawnSync worker 出 summary
- [x] 失败模式返回合理 counts，不阻塞 main.js

## 5. 后续

- worker 加 queue-stats 时间序列 dashboard
- 接到生产 crontab 文件（CLAUDE.md 提到 5:00 跑 main.js，加 5:30 跑 auto-batch）
- /api/worker/auto-batch 加 rate-limit（同 IP 每分钟 1 次）
- Loop 13+：adapter 三表 CRUD 抽通用层 / dashboard / seed 数据

## 6. 关联

- 通用 worker 服务：[server/src/services/autoBatch.js](../../server/src/services/autoBatch.js)
- HTTP 入口：[server/src/routes/worker.js](../../server/src/routes/worker.js)
- Scheduler hook：[scripts/scheduled.js](../../scripts/scheduled.js)
- 抽象层：[self-growth-rule-learner.md](./self-growth-rule-learner.md)
- 需求登记：[REQUIREMENT.md §5](../REQUIREMENT.md)
