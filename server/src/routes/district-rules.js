/**
 * routes/district-rules.js —— Loop 32 第四套 self-growth 端点
 *
 * 平行 notice-rules.js / qual-rules.js
 * GET /api/district-rules                     列表
 * POST /api/district-rules                    新建（admin 用）
 * PATCH /api/district-rules/:id               编辑
 * POST /api/district-rules/learn-from-miss     触发 AI 学一次（mutationsOnlyAuth 保护）
 */
const express = require('express');
const storage = require('../storage/adapter');
const districtAi = require('../services/districtAi');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(storage.listDistrictRules({ enabledOnly: req.query.enabledOnly === 'true' }));
});

router.post('/', (req, res) => {
  const { priority, tag, keywords, enabled, source } = req.body || {};
  if (!priority || !tag || !keywords) {
    return res.status(400).json({ error: 'priority, tag, keywords are required' });
  }
  res.json(storage.createDistrictRule({ priority, tag, keywords, enabled, source }));
});

router.patch('/:id', (req, res) => {
  const updated = storage.patchDistrictRule(parseInt(req.params.id, 10), req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.post('/learn-from-miss', async (req, res) => {
  const { announcementId } = req.body || {};
  if (!announcementId) {
    return res.status(400).json({ error: 'announcementId is required' });
  }
  try {
    const result = await districtAi.learnDistrictFromMiss(parseInt(announcementId, 10));
    res.json(result);
  } catch (e) {
    res.status(500).json({ applied: false, error: e.message });
  }
});

module.exports = router;
