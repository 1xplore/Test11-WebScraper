/**
 * 错误日志查看（scope + qual）
 */
const express = require('express');
const storage = require('../storage/adapter');

const router = express.Router();

// GET /api/error-logs?kind=scope|qual&resolved=true|false&limit=50
router.get('/', (req, res) => {
  const kind = req.query.kind === 'qual' ? 'qual' : 'scope';
  const resolved = req.query.resolved === undefined
    ? null
    : req.query.resolved === 'true' || req.query.resolved === '1';
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
  const list = kind === 'scope'
    ? storage.listScopeErrorLogs({ resolved, limit })
    : storage.listQualErrorLogs({ resolved, limit });
  res.json({ kind, items: list, counts: storage.getErrorLogCounts() });
});

// POST /api/error-logs/:id/resolve  body: { ruleId?, tag? } 标记 scope 错误已解决
router.post('/:id/resolve', (req, res) => {
  const updated = storage.resolveScopeError(parseInt(req.params.id, 10), req.body || {});
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

module.exports = router;