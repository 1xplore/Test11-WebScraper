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
    qual_tags: fromJsonArray(row.qual_tags),
    notice_type_tags: fromJsonArray(row.notice_type_tags),
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

/**
 * 仅回写 AI 自动重算的字段（不影响 review_status / review_note 等人工字段）
 * scope_tags 写成 JSON 字符串以匹配 toJsonArray 格式
 */
function patchAnnouncementScope(id, { scope_tags, business_match, match_score } = {}) {
  const updates = [];
  const params = [];
  if (scope_tags !== undefined) {
    updates.push('scope_tags = ?');
    params.push(toJsonArray(scope_tags));
  }
  if (business_match !== undefined) {
    updates.push('business_match = ?');
    params.push(business_match);
  }
  if (match_score !== undefined) {
    updates.push('match_score = ?');
    params.push(match_score);
  }
  if (updates.length === 0) return null;
  updates.push('updated_at = datetime(\'now\')');
  params.push(id);
  db.prepare(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getAnnouncement(id);
}

/**
 * 仅写 announcements.qual_tags —— 自迭代资质匹配用
 * 不影响业务字段（业务匹配用 scope_tags + business_match；qual_tags 是辅助标签）
 */
function patchAnnouncementQual(id, qualTags) {
  if (qualTags === undefined) return null;
  db.prepare(
    'UPDATE announcements SET qual_tags = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(toJsonArray(qualTags), id);
  return getAnnouncement(id);
}

/**
 * 写 announcements.notice_type_tags —— 第三套自迭代（Loop 6）回写
 */
function patchAnnouncementNoticeType(id, noticeTypeTags) {
  if (noticeTypeTags === undefined) return null;
  db.prepare(
    'UPDATE announcements SET notice_type_tags = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(toJsonArray(noticeTypeTags), id);
  return getAnnouncement(id);
}

/**
 * Loop 18：backfill 旧 announcement 的 qual_tags + notice_type_tags
 * 调 matching.inferQual / inferNoticeType 推断后写入
 * 幂等：已有非空标签的行跳过（避免覆盖 loop 3+4 AI 沉淀的版本）
 *
 * @returns {updated, skipped, failed} 计数
 */
function backfillAnnouncementTags({ batchSize = 200, dryRun = false } = {}) {
  const matching = require('../services/matching');
  const ruleLearner = require('../services/ruleLearner');
  const qualRules = listQualRules({ enabledOnly: true });
  const noticeRules = listNoticeTypeRules({ enabledOnly: true });
  const districtRules = listDistrictRules({ enabledOnly: true });
  const qualDyn = ruleLearner.buildDynamicRules(qualRules);
  const noticeDyn = ruleLearner.buildDynamicRules(noticeRules);
  const districtDyn = ruleLearner.buildDynamicRules(districtRules);

  let updated = 0, skipped = 0, failed = 0;
  const total = db.prepare('SELECT COUNT(*) AS n FROM announcements').get().n;
  let offset = 0;
  while (offset < total) {
    const rows = db.prepare(
      `SELECT id, title, description, requirement, raw_text, address, qual_tags, notice_type_tags, district
       FROM announcements ORDER BY id LIMIT ? OFFSET ?`
    ).all(batchSize, offset);

    for (const a of rows) {
      // 三个 tag 都非空才 skip（避免覆盖 AI 学出/人工修过）
      const qualEmpty = !a.qual_tags || a.qual_tags === '[]' || a.qual_tags === '';
      const noticeEmpty = !a.notice_type_tags || a.notice_type_tags === '[]' || a.notice_type_tags === '';
      // announcements.district 之前字段是 JSON array 但常 '[]' / 空 / NULL
      // 视为空用：原值不存在 / '[]' / ''
      const districtVal = a.district;
      let districtEmpty = !districtVal || districtVal === '[]' || districtVal === '';
      try {
        // parse 一下 JSON 数组（之前 backfill 写过的可能 '["xxx"]'）
        const parsed = districtVal ? JSON.parse(districtVal) : [];
        if (Array.isArray(parsed) && parsed.length > 0) districtEmpty = false;
      } catch (_) { /* JSON parse fail = keep empty */ }
      if (qualEmpty && noticeEmpty && districtEmpty) { skipped++; continue; }

      let updates, params;
      try {
        const qualText = (a.requirement || '').trim() || (a.raw_text || '').slice(0, 800);
        const noticeText = `${a.title || ''}\n${a.description || a.raw_text || ''}`.slice(0, 1000);
        const districtText = `${a.address || ''} ${a.title || ''}`.trim();

        updates = [];
        params = [];
        if (qualEmpty && qualText) {
          const qualTags = matching.inferQual(qualText, qualDyn);
          if (qualTags.length && !(qualTags.length === 1 && qualTags[0] === '未匹配')) {
            updates.push('qual_tags = ?');
            params.push(toJsonArray(qualTags));
          }
        }
        if (noticeEmpty && noticeText.trim()) {
          const noticeTags = matching.inferNoticeType(noticeText, noticeDyn);
          if (noticeTags.length) {
            updates.push('notice_type_tags = ?');
            params.push(toJsonArray(noticeTags));
          }
        }
        if (districtEmpty && districtText) {
          const districtTags = matching.inferDistrict(districtText, districtDyn);
          if (districtTags.length) {
            updates.push('district = ?');
            params.push(toJsonArray(districtTags));
          }
        }
        if (updates.length === 0) { skipped++; continue; }
      } catch (e) {
        failed++;
        continue;
      }
      if (dryRun) { updated++; continue; }
      updates.push('updated_at = datetime(\'now\')');
      params.push(a.id);
      db.prepare(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      updated++;
    }
    offset += batchSize;
  }
  return { total, updated, skipped, failed };
}

// ---------- 反馈日志 ----------

function writeScopeErrorLog(announcementId, rawText) {
  return db.prepare(
    'INSERT INTO scope_error_logs (announcement_id, raw_text) VALUES (?, ?)'
  ).run(announcementId, rawText).lastInsertRowid;
}

// Notice_type 错误日志（Loop 8 与 scope/qual 平行）
function writeNoticeTypeErrorLog(announcementId, rawText) {
  return db.prepare(
    'INSERT INTO notice_type_error_logs (announcement_id, raw_text) VALUES (?, ?)'
  ).run(announcementId, rawText).lastInsertRowid;
}

function writeQualErrorLog(announcementId, rawText) {
  return db.prepare(
    'INSERT INTO qual_error_logs (announcement_id, raw_text) VALUES (?, ?)'
  ).run(announcementId, rawText).lastInsertRowid;
}

// Loop 31: AI 学成功历史（dashboard 时序数据源）
function recordAILearnedHistory(ruleType, tag, announcementId) {
  return db.prepare(
    'INSERT INTO ai_learned_history (rule_type, tag, announcement_id) VALUES (?, ?, ?)'
  ).run(ruleType, tag, announcementId || null).lastInsertRowid;
}

// 查最近 N 天每天每类 AI 学习数（按天+rule_type GROUP BY）
function getAILearnedHistory({ days = 7 } = {}) {
  return db.prepare(`
    SELECT
      date(learned_at) AS day,
      rule_type,
      COUNT(*) AS n
    FROM ai_learned_history
    WHERE learned_at >= datetime('now', '-' || ? || ' days')
    GROUP BY day, rule_type
    ORDER BY day DESC, rule_type
  `).all(days);
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

function listNoticeTypeErrorLogs({ resolved = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (resolved !== null) { where.push('resolved = ?'); params.push(resolved ? 1 : 0); }
  const sql = `
    SELECT ntel.*, a.title AS announcement_title
    FROM notice_type_error_logs ntel
    LEFT JOIN announcements a ON a.id = ntel.announcement_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ntel.created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit);
}

function resolveNoticeTypeError(id, { ruleId, tag } = {}) {
  db.prepare(
    `UPDATE notice_type_error_logs SET resolved = 1, resolved_rule_id = ?, resolved_tag = ?
     WHERE id = ?`
  ).run(ruleId || null, tag || null, id);
  return db.prepare('SELECT * FROM notice_type_error_logs WHERE id = ?').get(id);
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
    notice_type_unresolved: db.prepare('SELECT COUNT(*) AS n FROM notice_type_error_logs WHERE resolved = 0').get().n,
    notice_type_total: db.prepare('SELECT COUNT(*) AS n FROM notice_type_error_logs').get().n,
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
// Loop 14 抽通用层 _ruleOpsFactory —— 三套（scope/qual/notice_type）共用
// 注意：保留同名导出 listXxxRules / patchXxxRule / createXxxRule 不破坏 matching.js / scopeAi / qualAi / noticeTypeAi / routes/* 的调用点

function _ruleOpsFactory(tableName, { allowedCols, boolCols = ['enabled'] } = {}) {
  const insertCols = allowedCols.filter((c) => c !== 'id');  // id 是自增
  // boolSet 留作未来扩展位（按 col 名 selective 归一）；当前 toBoolInt 是全局 boolean→0/1
  const _boolSet = new Set(boolCols || []);
  let invalidator = () => {};
  function registerCacheInvalidator(fn) {
    if (typeof fn === 'function') invalidator = fn;
  }
  function invalidateCache() {
    try { invalidator(); } catch (_) { /* bootstrap 静默 */ }
  }

  function list({ enabledOnly = false } = {}) {
    const sql = enabledOnly
      ? `SELECT * FROM ${tableName} WHERE enabled = 1 ORDER BY priority ASC`
      : `SELECT * FROM ${tableName} ORDER BY priority ASC`;
    return db.prepare(sql).all();
  }

  function patch(id, patch) {
    // 仅当 value 非 undefined 且 key 在白名单内（filter 掉 undefined 以避免 SQL 不必要的覆盖）
    const fields = Object.entries(patch)
      .filter(([k, v]) => allowedCols.includes(k) && v !== undefined);
    if (fields.length === 0) return null;
    const setClauses = fields.map(([k]) => `${k} = ?`).join(', ');
    const sql = `UPDATE ${tableName} SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`;
    db.prepare(sql).run(...fields.map(([, v]) => toBoolInt(v)), id);
    invalidateCache();
    return db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
  }

  function create(fields) {
    // 仅取 caller 明确传的非 undefined 字段；schema DEFAULT 兜底其余（fix loop 15 audit F1）
    const colsToInsert = insertCols.filter((c) => fields[c] !== undefined);
    if (colsToInsert.length === 0) {
      throw new Error(`create(${tableName}): no insertable columns provided`);
    }
    const placeholders = colsToInsert.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${colsToInsert.join(', ')}) VALUES (${placeholders})`;
    const info = db.prepare(sql).run(...colsToInsert.map((c) => toBoolInt(fields[c])));
    invalidateCache();
    return db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(info.lastInsertRowid);
  }

  return { list, patch, create, registerCacheInvalidator, invalidateCache };
}

// boolean 列 (stop_on_match / enabled) 存 INTEGER 0/1；callers 当前直接传数字
// 这里仅做兜底：意外传 boolean 时归一（fix loop 15 audit F2）
function toBoolInt(value) {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

const scopeRulesOps = _ruleOpsFactory('scope_rules', {
  allowedCols: ['priority', 'tag', 'keywords', 'stop_on_match', 'enabled', 'source'],
  hasStopOnMatch: true,
  boolCols: ['stop_on_match', 'enabled'],
});
const listScopeRules = scopeRulesOps.list;
const patchScopeRule = scopeRulesOps.patch;
const createScopeRule = scopeRulesOps.create;
const registerScopeRulesCacheInvalidator = scopeRulesOps.registerCacheInvalidator;
const invalidateScopeRulesCache = scopeRulesOps.invalidateCache;

const qualRulesOps = _ruleOpsFactory('qual_rules', {
  allowedCols: ['priority', 'tag', 'keywords', 'enabled', 'source'],
  boolCols: ['enabled'],
});
const listQualRules = qualRulesOps.list;
const patchQualRule = qualRulesOps.patch;
const createQualRule = qualRulesOps.create;
const registerQualRulesCacheInvalidator = qualRulesOps.registerCacheInvalidator;
const invalidateQualRulesCache = qualRulesOps.invalidateCache;

// Loop 32: 第四套 self-growth（district）
const districtRulesOps = _ruleOpsFactory('district_rules', {
  allowedCols: ['priority', 'tag', 'keywords', 'enabled', 'source'],
  boolCols: ['enabled'],
});
const listDistrictRules = districtRulesOps.list;
const patchDistrictRule = districtRulesOps.patch;
const createDistrictRule = districtRulesOps.create;
const registerDistrictRulesCacheInvalidator = districtRulesOps.registerCacheInvalidator;
const invalidateDistrictRulesCache = districtRulesOps.invalidateCache;

// district infer（regex 匹配 address 文本）
function inferDistrict(text, dynamicRules = null) {
  const rules = dynamicRules || (() => {
    const cached = storage.getActiveDistrictRules?.() || listDistrictRules({ enabledOnly: true });
    return cached;
  })();
  if (!rules || !rules.length) return [];
  const tags = [];
  for (const r of rules) {
    if (r.regex.test(text)) tags.push(r.tag);
  }
  return tags;
}

function writeDistrictErrorLog(announcementId, rawText) {
  return db.prepare(
    'INSERT INTO district_error_logs (announcement_id, raw_text) VALUES (?, ?)'
  ).run(announcementId, rawText).lastInsertRowid;
}

function listDistrictErrorLogs({ resolved = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (resolved !== null) { where.push('resolved = ?'); params.push(resolved ? 1 : 0); }
  const sql = `
    SELECT del.*, a.title AS announcement_title
    FROM district_error_logs del
    LEFT JOIN announcements a ON a.id = del.announcement_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY del.created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit);
}

const noticeTypeRulesOps = _ruleOpsFactory('notice_type_rules', {
  allowedCols: ['priority', 'tag', 'keywords', 'enabled', 'source'],
  boolCols: ['enabled'],
});
const listNoticeTypeRules = noticeTypeRulesOps.list;
const patchNoticeTypeRule = noticeTypeRulesOps.patch;
const createNoticeTypeRule = noticeTypeRulesOps.create;
const registerNoticeTypeRulesCacheInvalidator = noticeTypeRulesOps.registerCacheInvalidator;
const invalidateNoticeTypeRulesCache = noticeTypeRulesOps.invalidateCache;

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
  // Loop 30: 新建 user 时记 token_created_at（TTL 防御）
  const info = db.prepare(
    'INSERT INTO users (username, display_name, token, token_created_at) VALUES (?, ?, ?, datetime(\'now\'))'
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

// ---------- 系统设置 ----------
// 单租户，不做 per-tenant override；调用方负责 key 白名单。
// secrets 类 key（ai_api_key）：GET 不返原值，setSetting 由路由 call。

const SECRET_KEYS = new Set(['ai_api_key']);

function getSetting(key) {
  const row = db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get(key);
  if (!row) return null;
  return row.setting_value || '';
}

function listSettings() {
  return db.prepare('SELECT setting_key, setting_value, updated_at FROM system_settings ORDER BY setting_key').all()
    .map((r) => ({
      key: r.setting_key,
      value: SECRET_KEYS.has(r.setting_key) ? '' : r.setting_value,  // 真值不返
      hasValue: !!(r.setting_value && r.setting_value.length > 0),
      updatedAt: r.updated_at,
      isSecret: SECRET_KEYS.has(r.setting_key),
    }));
}

function setSetting(key, value, userId = null) {
  db.prepare(
    `INSERT INTO system_settings (setting_key, setting_value, description, updated_at, updated_by)
     VALUES (?, ?, NULL, datetime('now'), ?)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at    = datetime('now'),
       updated_by    = excluded.updated_by`
  ).run(key, value ?? '', userId);
}

function deleteSetting(key) {
  db.prepare('DELETE FROM system_settings WHERE setting_key = ?').run(key);
}

function maskApiKey(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length <= 8) return '****';
  return `${s.slice(0, 3)}...${s.slice(-4)}`;
}

module.exports = {
  // platforms
  getPlatformByScriptId, listPlatforms, updatePlatformStatus, patchPlatform,
  // announcements
  findExisting, upsertAnnouncement, listAnnouncements, getAnnouncement,
  patchAnnouncementReview, patchAnnouncementScope, markReviewed,
  // feedback logs
  writeScopeErrorLog, writeQualErrorLog, writeNoticeTypeErrorLog, writeDistrictErrorLog, writeFeedbackLogs,
  listScopeErrorLogs, listQualErrorLogs, resolveScopeError, getErrorLogCounts,
  // Loop 31: AI 学习历史 + 时序查询
  recordAILearnedHistory, getAILearnedHistory,
  // scope rules
  listScopeRules, patchScopeRule, createScopeRule,
  // cache invalidator registry
  registerScopeRulesCacheInvalidator, invalidateScopeRulesCache,
  // qual rules
  listQualRules, patchQualRule, createQualRule,
  registerQualRulesCacheInvalidator, invalidateQualRulesCache,
  // notice_type rules
  listNoticeTypeRules, patchNoticeTypeRule, createNoticeTypeRule,
  registerNoticeTypeRulesCacheInvalidator, invalidateNoticeTypeRulesCache,
  // Loop 32: district rules
  listDistrictRules, patchDistrictRule, createDistrictRule,
  registerDistrictRulesCacheInvalidator, invalidateDistrictRulesCache,
  // announcement tag patches
  patchAnnouncementQual, patchAnnouncementNoticeType,
  // backfill (loop 18)
  backfillAnnouncementTags,
  // feedback logs
  writeScopeErrorLog, writeQualErrorLog, writeNoticeTypeErrorLog, writeDistrictErrorLog, writeFeedbackLogs,
  listScopeErrorLogs, listQualErrorLogs, listNoticeTypeErrorLogs, listDistrictErrorLogs,
  resolveScopeError, resolveNoticeTypeError, getErrorLogCounts,
  // Loop 31: AI 学习历史（dashboard 时序）
  recordAILearnedHistory, getAILearnedHistory,
  // scrape runs
  getLastScrapeTime, createScrapeRun, listScrapeRuns,
  // users
  findOrCreateUser, getUserByToken, listUsers,
  // stats
  getStats,
  // util
  rowToAnnouncement, fromJsonArray,
  // settings
  getSetting, listSettings, setSetting, deleteSetting, maskApiKey,
};