/**
 * 公告类型规则管理 + 自迭代入口
 * 第三套 self-growth (Loop 6) —— 与 routes/scope-rules.js / qual-rules.js 同形
 */
const express = require('express');
const storage = require('../storage/adapter');
const noticeTypeAi = require('../services/noticeTypeAi');

const router = express.Router();

// GET /api/notice-rules
router.get('/', (req, res) => {
  res.json(storage.listNoticeTypeRules({ enabledOnly: req.query.enabledOnly === 'true' }));
});

// POST /api/notice-rules
router.post('/', (req, res) => {
  const { priority, tag, keywords, enabled, source } = req.body || {};
  if (!priority || !tag || !keywords) {
    return res.status(400).json({ error: 'priority, tag, keywords are required' });
  }
  res.json(storage.createNoticeTypeRule({ priority, tag, keywords, enabled, source }));
});

// PATCH /api/notice-rules/:id
router.patch('/:id', (req, res) => {
  const updated = storage.patchNoticeTypeRule(parseInt(req.params.id, 10), req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// POST /api/notice-rules/learn-from-miss   body: { announcementId }
router.post('/learn-from-miss', async (req, res) => {
  const { announcementId } = req.body || {};
  if (!announcementId) {
    return res.status(400).json({ error: 'announcementId is required' });
  }
  try {
    const result = await noticeTypeAi.learnNoticeTypeFromMiss(parseInt(announcementId, 10));
    res.json(result);
  } catch (e) {
    res.status(500).json({ applied: false, error: e.message });
  }
});

module.exports = router;
