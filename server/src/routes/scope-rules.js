/**
 * Scope 规则管理 + 自迭代匹配入口
 */
const express = require('express');
const storage = require('../storage/adapter');
const scopeAi = require('../services/scopeAi');

const router = express.Router();

// GET /api/scope-rules
router.get('/', (req, res) => {
  res.json(storage.listScopeRules({ enabledOnly: req.query.enabledOnly === 'true' }));
});

// POST /api/scope-rules
router.post('/', (req, res) => {
  const { priority, tag, keywords, stop_on_match, enabled } = req.body || {};
  if (!priority || !tag || !keywords) {
    return res.status(400).json({ error: 'priority, tag, keywords are required' });
  }
  res.json(storage.createScopeRule({ priority, tag, keywords, stop_on_match, enabled }));
});

// PATCH /api/scope-rules/:id
router.patch('/:id', (req, res) => {
  const updated = storage.patchScopeRule(parseInt(req.params.id, 10), req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// POST /api/scope-rules/learn-from-miss   body: { announcementId }
// 触发 AI 学一次：调 LLM → 验证关键词 → 沉淀规则 → 回写公告 scope_tags
router.post('/learn-from-miss', async (req, res) => {
  const { announcementId } = req.body || {};
  if (!announcementId) {
    return res.status(400).json({ error: 'announcementId is required' });
  }
  try {
    const result = await scopeAi.learnFromMiss(parseInt(announcementId, 10));
    res.json(result);
  } catch (e) {
    res.status(500).json({ applied: false, error: e.message });
  }
});

module.exports = router;