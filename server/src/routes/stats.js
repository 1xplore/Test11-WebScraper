/**
 * GET /api/stats
 */
const express = require('express');
const storage = require('../storage/adapter');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(storage.getStats());
});

module.exports = router;