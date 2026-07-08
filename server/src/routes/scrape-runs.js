/**
 * 抓取运行日志
 */
const express = require('express');
const storage = require('../storage/adapter');

const router = express.Router();

// GET /api/scrape-runs?limit=30
router.get('/', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 30;
  const runs = storage.listScrapeRuns({ limit });
  // JSON 字段已在 row 中是字符串，让前端解析
  res.json(runs);
});

// GET /api/scrape-runs/last  上次抓取时间（供 cron 决定时间窗）
router.get('/last', (req, res) => {
  const t = storage.getLastScrapeTime();
  res.json({ last_scrape_time: t ? t.toISOString() : null });
});

module.exports = router;