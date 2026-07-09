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
    sortBy, sortDir, page, pageSize, format,
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
    pageSize: format === 'csv' ? 10000 : (pageSize ? parseInt(pageSize, 10) : 50),
  });

  if (format === 'csv') {
    const headers = [
      'id', 'title', 'notice_id', 'project_code', 'notice_type',
      'notice_start_date', 'notice_end_date', 'bid_submit_deadline',
      'publicity_date', 'result_date', 'district', 'tender_corp', 'agency_corp',
      'contract_price', 'offer_price', 'tender_bond', 'total_investment',
      'description', 'requirement', 'business_match', 'project_progress',
      'match_score', 'review_status', 'review_note', 'detail_url',
    ];
    const rows = result.items.map((i) => headers.map((h) => {
      let v = i[h];
      if (Array.isArray(v)) v = v.join('、');
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""').replace(/\n/g, ' ');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    }).join(','));
    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="announcements-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  }

  res.json(result);
});

// GET /api/announcements/:id
router.get('/:id', (req, res) => {
  const item = storage.getAnnouncement(parseInt(req.params.id, 10));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// PATCH /api/announcements/:id/review  body: { reviewStatus, reviewNote, reviewedBy? }
// requireAuth 已挂上路由（server.js），req.user 一定存在；不再二次 resolve token
router.patch('/:id/review', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reviewStatus, reviewNote, reviewedBy } = req.body || {};
  const finalReviewedBy = reviewedBy || req.user.username;
  const updated = storage.patchAnnouncementReview(id, { reviewStatus, reviewNote, reviewedBy: finalReviewedBy });
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