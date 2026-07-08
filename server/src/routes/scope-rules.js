/**
 * Scope 规则管理
 */
const express = require('express');
const storage = require('../storage/adapter');

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

module.exports = router;