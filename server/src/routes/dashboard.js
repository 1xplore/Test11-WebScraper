/**
 * routes/dashboard.js —— Loop 26: 监控自迭代系统全貌的 GET 端点
 *
 * GET /api/dashboard/summary 返回：
 *   - seed_counts: 三套 rule 表的 seed 条数
 *   - ai_learned_counts: 三套 rule 表的 ai-learned 条数
 *   - queue_stats: 三套 *_error_logs 当前未处理数（loop 11 worker 待跑批）
 *   - announcements_by_tags: 957 历史公告中已推断 qual_tags / notice_type_tags 的覆盖数
 *
 * 公开端点（GET），不需 auth —— 数据已聚合、不是单条记录，可给 cron 监控 / 浏览器 dashboard
 * 用；若发现敏感信息可再上 auth（loop 9 audit F3 项目级债已标）
 */
const express = require('express');
const storage = require('../storage/adapter');
const autoBatch = require('../services/autoBatch');
const db = require('../db');  // lazy require for raw SQL（adapter 不暴露 db）

const router = express.Router();

router.get('/summary', (req, res) => {
  // 各类 source='seed' / 'ai-learned' 的统计
  function countBySource(list) {
    const out = { seed: 0, 'ai-learned': 0, manual: 0, imported: 0, other: 0 };
    for (const r of list) {
      out[r.source] = (out[r.source] || 0) + 1;
    }
    return out;
  }
  const scopeCounts = countBySource(storage.listScopeRules());
  const qualCounts = countBySource(storage.listQualRules());
  const noticeCounts = countBySource(storage.listNoticeTypeRules());

  // 公告 tag 覆盖率（957 总）
  const totalAnnouncements = db.prepare('SELECT COUNT(*) AS n FROM announcements').get().n;
  const qualCovered = db.prepare(
    "SELECT COUNT(*) AS n FROM announcements WHERE qual_tags IS NOT NULL AND qual_tags != '[]' AND qual_tags != ''"
  ).get().n;
  const noticeCovered = db.prepare(
    "SELECT COUNT(*) AS n FROM announcements WHERE notice_type_tags IS NOT NULL AND notice_type_tags != '[]' AND notice_type_tags != ''"
  ).get().n;

  res.json({
    generatedAt: new Date().toISOString(),
    rules: {
      scope: scopeCounts,
      qual: qualCounts,
      notice_type: noticeCounts,
    },
    queues: autoBatch.queueStats(),  // { scope_unresolved, qual_unresolved, notice_type_unresolved, scope_total, ... }
    coverage: {
      total_announcements: totalAnnouncements,
      qual_covered: qualCovered,
      qual_covered_pct: totalAnnouncements ? Math.round((qualCovered / totalAnnouncements) * 100) : 0,
      notice_type_covered: noticeCovered,
      notice_type_covered_pct: totalAnnouncements ? Math.round((noticeCovered / totalAnnouncements) * 100) : 0,
    },
  });
});

module.exports = router;
