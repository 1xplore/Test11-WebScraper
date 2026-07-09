/**
 * 资质规则管理 + 自迭代资质匹配入口
 * 与 routes/scope-rules.js 平行：CRUD + learn-from-miss
 */
const express = require('express');
const storage = require('../storage/adapter');
const qualAi = require('../services/qualAi');

const router = express.Router();

// GET /api/qual-rules
router.get('/', (req, res) => {
  res.json(storage.listQualRules({ enabledOnly: req.query.enabledOnly === 'true' }));
});

// POST /api/qual-rules
router.post('/', (req, res) => {
  const { priority, tag, keywords, enabled, source } = req.body || {};
  if (!priority || !tag || !keywords) {
    return res.status(400).json({ error: 'priority, tag, keywords are required' });
  }
  res.json(storage.createQualRule({ priority, tag, keywords, enabled, source }));
});

// PATCH /api/qual-rules/:id
router.patch('/:id', (req, res) => {
  const updated = storage.patchQualRule(parseInt(req.params.id, 10), req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// POST /api/qual-rules/learn-from-miss   body: { announcementId }
// 触发 AI 学一次：调 LLM → 验证资质关键词字面命中 → 沉淀规则
router.post('/learn-from-miss', async (req, res) => {
  const { announcementId } = req.body || {};
  if (!announcementId) {
    return res.status(400).json({ error: 'announcementId is required' });
  }
  try {
    const result = await qualAi.learnQualFromMiss(parseInt(announcementId, 10));
    res.json(result);
  } catch (e) {
    res.status(500).json({ applied: false, error: e.message });
  }
});

module.exports = router;
