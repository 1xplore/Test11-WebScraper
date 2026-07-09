/**
 * 存储适配层：让 scraper 与具体后端（Notion / SQLite）解耦
 *
 * 当前仅实现 SQLite 后端；保留接口形态以便未来切换
 */
const db = require('../db');

const JSON_NULL = '[]';

function toJsonArray(v) {
  if (!v) return JSON_NULL;
  if (Array.isArray(v)) return JSON.stringify(v);
  try { return JSON.stringify(JSON.parse(v)); } catch { return JSON_NULL; }
}

function fromJsonArray(s, fallback = []) {
  if (!s) return fallback;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

function rowToAnnouncement(row) {
  if (!row) return null;
  return {
    ...row,
    scope_tags: fromJsonArray(row.scope_tags),
    district: fromJsonArray(row.district),
  };
}

// ---------- 平台 ----------

function getPlatformByScriptId(scriptId) {
  return db.prepare('SELECT * FROM platforms WHERE script_id = ?').get(scriptId);
}

function listPlatforms({ enabledOnly = false } = {}) {
  const sql = enabledOnly
    ? 'SELECT * FROM platforms WHERE enabled = 1 ORDER BY name'
    : 'SELECT * FROM platforms ORDER BY name';
  return db.prepare(sql).all();
}

function updatePlatformStatus(scriptId, { status, lastError = null, lastRunAt = null } = {}) {
  const enabled = status === '已配置运行中' ? 1 : 0;
  db.prepare(
    `UPDATE platforms
     SET status = ?, enabled = ?, last_run_at = COALESCE(?, last_run_at),
         last_error = COALESCE(?, last_error), updated_at = datetime('now'),
         total_runs = total_runs + ?
     WHERE script_id = ?`
  ).run(status, enabled, lastRunAt, lastError, 1, scriptId);
}

function patchPlatform(scriptId, patch) {
  const allowed = ['name', 'homepage', 'status', 'enabled', 'last_error'];
  const fields = Object.entries(patch).filter(([k]) => allowed.includes(k));
  if (fields.length === 0) return;
  if (fields.some(([k]) => k === 'status')) {
    const s = patch.status;
    fields.push(['enabled', s === '已配置运行中' ? 1 : 0]);
  }
  const sql = `UPDATE platforms SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE script_id = ?`;
  db.prepare(sql).run(...fields.map(([, v]) => v), scriptId);
}

// ---------- 公告 ----------

function findExisting(platformId, noticeId) {
  if (!noticeId) return null;
  return db.prepare(
    'SELECT * FROM announcements WHERE source_platform_id = ? AND notice_id = ?'
  ).get(platformId, String(noticeId));
}

/**
 * 创建或更新公告
 *
 * 关键：更新时**不覆盖** review_status / scrape_status / review_note / reviewed_at / reviewed_by
 *
 * @returns {'created' | 'updated' | 'skipped'}
 */
function upsertAnnouncement(item, platformId, { forceUpdate = false } = {}) {
  const noticeId = item.id != null ? String(item.id) : null;
  const existing = findExisting(platformId, noticeId);
  if (existing && !forceUpdate) return 'skipped';

  const fields = {
    notice_id: noticeId,
    project_code: item.projectCode || null,
    title: item.title || '(无标题)',
    detail_url: item.detailUrl || null,
    notice_type: item.noticeType || null,
    notice_start_date: item.noticeStartDate || null,
    notice_end_date: item.noticeEndDate || null,
    bid_submit_deadline: item.bidSubmitDeadline || null,
    publicity_date: item.publicityDate || null,
    result_date: item.resultDate || null,
    planned_tender_time: item.plannedTenderTime || null,
    district: toJsonArray(item.district),
    tender_corp: item.tenderCorp || null,
    tender_link_man: item.tenderLinkMan || null,
    tender_link_phone: item.tenderLinkPhone || null,
    agency_corp: item.agencyCorp || null,
    agency_link_man: item.agencyLinkMan || null,
    agency_link_phone: item.agencyLinkPhone || null,
    address: item.address || null,
    note_number: item.noteNumber || null,
    contract_price: item.contractPrice ?? null,
    total_investment: item.totalInvestment ?? null,
    offer_price: item.offerPrice ?? null,
    tender_bond: item.tenderBond ?? null,
    planned_period: item.plannedPeriod ?? null,
    description: item.description || null,
    requirement: item.requirement || null,
    raw_text: item.rawText || null,
    scope_tags: toJsonArray(item.scopeTags),
    business_match: item.businessMatch || null,
    project_progress: item.projectProgress || null,
    match_score: item.matchScore ?? null,
    scrape_status: '已抓取',
  };

  if (existing) {
    const sql = `UPDATE announcements SET
      ${Object.keys(fields).map((k) => `${k} = ?`).join(', ')},
      updated_at = datetime('now')
      WHERE id = ?`;
    db.prepare(sql).run(...Object.values(fields), existing.id);
    return 'updated';
  }

  const cols = Object.keys(fields).join(', ');
  const placeholders = Object.keys(fields).map(() => '?').join(', ');
  const sql = `INSERT INTO announcements (source_platform_id, ${cols}) VALUES (?, ${placeholders})`;
  const info = db.prepare(sql).run(platformId, ...Object.values(fields));
  return 'created';
}

function listAnnouncements({
  q = null,
  businessMatch = null,
  reviewStatus = null,
  progress = null,
  platformId = null,
  district = null,
  scopeTag = null,
  minContractPrice = null,
  maxContractPrice = null,
  dateFrom = null,
  dateTo = null,
  sortBy = 'notice_start_date',
  sortDir = 'DESC',
  page = 1,
  pageSize = 50,
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(title LIKE ? OR project_code LIKE ? OR tender_corp LIKE ? OR agency_corp LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (businessMatch) { where.push('business_match = ?'); params.push(businessMatch); }
  if (reviewStatus) { where.push('review_status = ?'); params.push(reviewStatus); }
  if (progress) { where.push('project_progress = ?'); params.push(progress); }
  if (platformId) { where.push('source_platform_id = ?'); params.push(platformId); }
  if (district) { where.push('district LIKE ?'); params.push(`%${JSON.stringify(district)}%`); }
  if (scopeTag) { where.push('scope_tags LIKE ?'); params.push(`%${JSON.stringify(scopeTag)}%`); }
  if (minContractPrice != null) { where.push('contract_price >= ?'); params.push(minContractPrice); }
  if (maxContractPrice != null) { where.push('contract_price <= ?'); params.push(maxContractPrice); }
  if (dateFrom) { where.push('notice_start_date >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('notice_start_date <= ?'); params.push(dateTo); }

  const safeSortBy = ['notice_start_date', 'match_score', 'contract_price', 'created_at', 'updated_at'].includes(sortBy)
    ? sortBy : 'notice_start_date';
  const safeSortDir = sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * pageSize;
  const limit = Math.max(1, Math.min(200, pageSize));

  const total = db.prepare(`SELECT COUNT(*) AS n FROM announcements ${whereSql}`).get(...params).n;
  const rows = db.prepare(
    `SELECT * FROM announcements ${whereSql} ORDER BY ${safeSortBy} ${safeSortDir} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return {
    total,
    page,
    pageSize: limit,
    items: rows.map(rowToAnnouncement),
  };
}

function getAnnouncement(id) {
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  return rowToAnnouncement(row);
}

function patchAnnouncementReview(id, { reviewStatus, reviewNote, reviewedBy }) {
  const allowed = { reviewStatus: 'review_status', reviewNote: 'review_note', reviewedBy: 'reviewed_by' };
  const updates = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if ({ reviewStatus, reviewNote, reviewedBy }[key] !== undefined) {
      updates.push(`${col} = ?`);
      params.push({ reviewStatus, reviewNote, reviewedBy }[key]);
    }
  }
  if (updates.length === 0) return null;
  updates.push('reviewed_at = datetime(\'now\')');
  updates.push('updated_at = datetime(\'now\')');
  params.push(id);
  db.prepare(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getAnnouncement(id);
}

function markReviewed(id) {
  // reviewed_at 用 COALESCE：只在还没审核过时才更新，避免覆盖人工初次审核的时间戳
  db.prepare(
    `UPDATE announcements SET scrape_status = '已审核',
       reviewed_at = COALESCE(reviewed_at, datetime('now')),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);
  return getAnnouncement(id);
}

// ---------- 反馈日志 ----------

function writeScopeErrorLog(announcementId, rawText) {
  return db.prepare(
    'INSERT INTO scope_error_logs (announcement_id, raw_text) VALUES (?, ?)'
  ).run(announcementId, rawText).lastInsertRowid;
}

function writeQualErrorLog(announcementId, rawText) {
  return db.prepare(
    'INSERT INTO qual_error_logs (announcement_id, raw_text) VALUES (?, ?)'
  ).run(announcementId, rawText).lastInsertRowid;
}

function listScopeErrorLogs({ resolved = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (resolved !== null) { where.push('resolved = ?'); params.push(resolved ? 1 : 0); }
  const sql = `
    SELECT sel.*, a.title AS announcement_title, a.business_match
    FROM scope_error_logs sel
    LEFT JOIN announcements a ON a.id = sel.announcement_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY sel.created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit);
}

function listQualErrorLogs({ resolved = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (resolved !== null) { where.push('resolved = ?'); params.push(resolved ? 1 : 0); }
  const sql = `
    SELECT qel.*, a.title AS announcement_title
    FROM qual_error_logs qel
    LEFT JOIN announcements a ON a.id = qel.announcement_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY qel.created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit);
}

function resolveScopeError(id, { ruleId, tag } = {}) {
  db.prepare(
    `UPDATE scope_error_logs SET resolved = 1, resolved_rule_id = ?, resolved_tag = ?
     WHERE id = ?`
  ).run(ruleId || null, tag || null, id);
  return db.prepare('SELECT * FROM scope_error_logs WHERE id = ?').get(id);
}

function getErrorLogCounts() {
  return {
    scope_unresolved: db.prepare('SELECT COUNT(*) AS n FROM scope_error_logs WHERE resolved = 0').get().n,
    scope_total: db.prepare('SELECT COUNT(*) AS n FROM scope_error_logs').get().n,
    qual_unresolved: db.prepare('SELECT COUNT(*) AS n FROM qual_error_logs WHERE resolved = 0').get().n,
    qual_total: db.prepare('SELECT COUNT(*) AS n FROM qual_error_logs').get().n,
  };
}

/**
 * 批量写反馈日志（按 item + result）
 * @returns { scopeIds: number[], qualIds: number[] }
 */
function writeFeedbackLogs(items, results) {
  const scopeIds = [];
  const qualIds = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = results.details?.[i];
    if (!result || (result.status !== 'created' && result.status !== 'updated')) continue;
    const annId = result.id;
    if (!annId) continue;

    const scopeUnmatched = item.scopeTags?.length === 1 && item.scopeTags[0] === '其他';
    if (scopeUnmatched) {
      const id = writeScopeErrorLog(annId, item._scopeMatchText || item.title || '');
      scopeIds.push(id);
    }

    if (!item.requirement && !item._qualExplicitNone) {
      const id = writeQualErrorLog(annId, item._qualMatchText || item._scopeMatchText || item.title || '');
      qualIds.push(id);
    }
  }
  return { scopeIds, qualIds };
}

// ---------- Scope 规则 ----------

function listScopeRules({ enabledOnly = false } = {}) {
  const sql = enabledOnly
    ? 'SELECT * FROM scope_rules WHERE enabled = 1 ORDER BY priority ASC'
    : 'SELECT * FROM scope_rules ORDER BY priority ASC';
  return db.prepare(sql).all();
}

function patchScopeRule(id, patch) {
  const allowed = ['priority', 'tag', 'keywords', 'stop_on_match', 'enabled'];
  const fields = Object.entries(patch).filter(([k]) => allowed.includes(k));
  if (fields.length === 0) return null;
  const sql = `UPDATE scope_rules SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`;
  db.prepare(sql).run(...fields.map(([, v]) => v), id);
  return db.prepare('SELECT * FROM scope_rules WHERE id = ?').get(id);
}

function createScopeRule({ priority, tag, keywords, stop_on_match = 0, enabled = 1, source = 'manual' }) {
  const info = db.prepare(
    'INSERT INTO scope_rules (priority, tag, keywords, stop_on_match, enabled, source) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(priority, tag, keywords, stop_on_match ? 1 : 0, enabled ? 1 : 0, source);
  return db.prepare('SELECT * FROM scope_rules WHERE id = ?').get(info.lastInsertRowid);
}

// ---------- 抓取运行日志 ----------

function getLastScrapeTime() {
  const row = db.prepare('SELECT scrape_time FROM scrape_runs ORDER BY scrape_time DESC LIMIT 1').get();
  if (!row) return null;
  const t = new Date(row.scrape_time);
  return isNaN(t.getTime()) ? null : t;
}

function createScrapeRun({ scrapeTime, dateBegin, dateEnd, platformIds, announcementIds, scopeErrorIds, qualErrorIds, stats }) {
  const info = db.prepare(
    `INSERT INTO scrape_runs
     (scrape_time, date_begin, date_end, platform_ids, announcement_ids, scope_error_ids, qual_error_ids,
      total_created, total_updated, total_skipped, total_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    scrapeTime instanceof Date ? scrapeTime.toISOString() : scrapeTime,
    dateBegin instanceof Date ? dateBegin.toISOString() : dateBegin,
    dateEnd instanceof Date ? dateEnd.toISOString() : dateEnd,
    toJsonArray(platformIds),
    toJsonArray(announcementIds),
    toJsonArray(scopeErrorIds),
    toJsonArray(qualErrorIds),
    stats?.created || 0,
    stats?.updated || 0,
    stats?.skipped || 0,
    stats?.error || 0,
  );
  return db.prepare('SELECT * FROM scrape_runs WHERE id = ?').get(info.lastInsertRowid);
}

function listScrapeRuns({ limit = 30 } = {}) {
  return db.prepare('SELECT * FROM scrape_runs ORDER BY scrape_time DESC LIMIT ?').all(limit);
}

// ---------- users（最简版：用户名 + token，无密码） ----------
function findOrCreateUser(username, displayName = null) {
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user) {
    db.prepare('UPDATE users SET last_seen_at = datetime(\'now\') WHERE id = ?').run(user.id);
    return user;
  }
  const token = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const info = db.prepare(
    'INSERT INTO users (username, display_name, token) VALUES (?, ?, ?)'
  ).run(username, displayName || username, token);
  user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return user;
}

function getUserByToken(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM users WHERE token = ?').get(token);
}

function listUsers() {
  return db.prepare('SELECT id, username, display_name, created_at, last_seen_at FROM users ORDER BY id').all();
}

// ---------- 统计 ----------

function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM announcements').get().n;
  const byBusiness = db.prepare(
    "SELECT business_match AS k, COUNT(*) AS n FROM announcements GROUP BY business_match"
  ).all();
  const byReview = db.prepare(
    "SELECT review_status AS k, COUNT(*) AS n FROM announcements GROUP BY review_status"
  ).all();
  const byProgress = db.prepare(
    "SELECT project_progress AS k, COUNT(*) AS n FROM announcements GROUP BY project_progress"
  ).all();
  const byPlatform = db.prepare(
    `SELECT p.name AS platform, COUNT(a.id) AS n
     FROM platforms p LEFT JOIN announcements a ON a.source_platform_id = p.id
     GROUP BY p.id ORDER BY n DESC`
  ).all();
  const byDistrict = db.prepare(
    `SELECT json_each.value AS k, COUNT(*) AS n
     FROM announcements, json_each(district)
     WHERE json_each.value IS NOT NULL AND json_each.value != ''
     GROUP BY json_each.value
     ORDER BY n DESC`
  ).all();
  const recent7d = db.prepare(
    "SELECT COUNT(*) AS n FROM announcements WHERE notice_start_date >= date('now', '-7 days')"
  ).get().n;
  const lastRun = db.prepare('SELECT scrape_time FROM scrape_runs ORDER BY scrape_time DESC LIMIT 1').get();

  return {
    total,
    recent_7d: recent7d,
    last_run_at: lastRun?.scrape_time || null,
    by_business_match: byBusiness,
    by_review_status: byReview,
    by_progress: byProgress,
    by_platform: byPlatform,
    by_district: byDistrict,
  };
}

module.exports = {
  // platforms
  getPlatformByScriptId, listPlatforms, updatePlatformStatus, patchPlatform,
  // announcements
  findExisting, upsertAnnouncement, listAnnouncements, getAnnouncement,
  patchAnnouncementReview, markReviewed,
  // feedback logs
  writeScopeErrorLog, writeQualErrorLog, writeFeedbackLogs,
  listScopeErrorLogs, listQualErrorLogs, resolveScopeError, getErrorLogCounts,
  // scope rules
  listScopeRules, patchScopeRule, createScopeRule,
  // scrape runs
  getLastScrapeTime, createScrapeRun, listScrapeRuns,
  // users
  findOrCreateUser, getUserByToken, listUsers,
  // stats
  getStats,
  // util
  rowToAnnouncement, fromJsonArray,
};