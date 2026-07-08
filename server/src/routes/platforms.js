/**
 * 平台配置管理
 */
const express = require('express');
const storage = require('../storage/adapter');

const router = express.Router();

// GET /api/platforms
router.get('/', (req, res) => {
  const enabledOnly = req.query.enabledOnly === 'true';
  res.json(storage.listPlatforms({ enabledOnly }));
});

// PATCH /api/platforms/:scriptId   body: { status?, name?, homepage?, enabled? }
router.patch('/:scriptId', (req, res) => {
  const updated = storage.patchPlatform(req.params.scriptId, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

module.exports = router;