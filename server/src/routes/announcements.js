/**
 * 公告 CRUD + 审核动作 + AI 复核
 */
const express = require('express');
const storage = require('../storage/adapter');
const matching = require('../services/matching');

const router = express.Router();

// GET /api/announcements?...
router.get('/', (req, res) => {
  const {
    q, businessMatch, reviewStatus, progress, platformId, scopeTag, district,
    minContractPrice, maxContractPrice, dateFrom, dateTo,
    sortBy, sortDir, page, pageSize,
  } = req.query;
  const result = storage.listAnnouncements({
    q: q || null,
    businessMatch: businessMatch || null,
    reviewStatus: reviewStatus || null,
    progress: progress || null,
    platformId: platformId ? parseInt(platformId, 10) : null,
    scopeTag: scopeTag || null,
    district: district || null,
    minContractPrice: minContractPrice ? parseFloat(minContractPrice) : null,
    maxContractPrice: maxContractPrice ? parseFloat(maxContractPrice) : null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    sortBy: sortBy || 'notice_start_date',
    sortDir: sortDir || 'DESC',
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 50,
  });
  res.json(result);
});

// GET /api/announcements/:id
router.get('/:id', (req, res) => {
  const item = storage.getAnnouncement(parseInt(req.params.id, 10));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// PATCH /api/announcements/:id/review  body: { reviewStatus, reviewNote, reviewedBy }
router.patch('/:id/review', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reviewStatus, reviewNote, reviewedBy } = req.body || {};
  const updated = storage.patchAnnouncementReview(id, { reviewStatus, reviewNote, reviewedBy });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// POST /api/announcements/:id/reviewed   标记已审核
router.post('/:id/reviewed', (req, res) => {
  const updated = storage.markReviewed(parseInt(req.params.id, 10));
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// POST /api/announcements/:id/ai-match   触发 AI 复核（不写库，仅返回新结果）
router.post('/:id/ai-match', async (req, res) => {
  const item = storage.getAnnouncement(parseInt(req.params.id, 10));
  if (!item) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await matching.matchAnnouncement({
      title: item.title,
      description: item.description || item.raw_text,
      item,
      useAI: true,
    });
    res.json({ previous: { scope_tags: item.scope_tags, match_score: item.match_score }, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;