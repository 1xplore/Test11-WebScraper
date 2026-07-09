/**
 * 后台 worker —— 自迭代匹配机制的最后一块拼图（Loop 11）
 *
 * 流程：扫 *_error_logs 队列中 resolved=0 的条目，逐条调对应维度的 learnFromMiss。
 * 该服务不需要用户手动点按钮 —— 让系统自己从错例本里学。
 *
 * 当前为"手动触发"形态（POST /api/worker/auto-batch）。
 * 后续可挂 cron（每天 5 点）作为 production scheduler，本服务已对 worker-friendly 设计：
 *   - limit 入参防一次炸太多 token
 *   - skip 不存在的 announcement（announcement 已被删时）
 *   - 局部失败不阻塞队列（loop 内 try/catch 隔离）
 *
 * 失败模式：每条都返 {applied|reason}, 整体返聚合 counts
 */

const storage = require('../storage/adapter');
const scopeAi = require('./scopeAi');
const qualAi = require('./qualAi');
const noticeTypeAi = require('./noticeTypeAi');

const TYPES = {
  scope: {
    label: 'scope',
    listFn: storage.listScopeErrorLogs,
    learnFn: scopeAi.learnFromMiss,
    resolvedFn: storage.resolveScopeError,
  },
  qual: {
    label: 'qual',
    listFn: storage.listQualErrorLogs,
    learnFn: qualAi.learnQualFromMiss,
    resolvedFn: storage.resolveScopeError,  // 结构一致复用
  },
  notice_type: {
    label: 'notice_type',
    listFn: storage.listNoticeTypeErrorLogs,
    learnFn: noticeTypeAi.learnNoticeTypeFromMiss,
    resolvedFn: storage.resolveNoticeTypeError,
  },
};

/**
 * 跑批
 * @param {object} opts
 *   - types:     array<'scope'|'qual'|'notice_type'> 默认全部
 *   - limit:     每类最多处理多少条 默认 5（防 token 超支）
 *   - resolveOnApply: 学成功的 error_log 是否标记 resolved=true（缺省 false —— 让人工审计过再 mark）
 *   - types 选项可数组可缺省
 * @returns {byType: {...}, totals: {processed, applied, errors, skipped}}
 */
async function runAutoBatch(opts = {}) {
  const types = Array.isArray(opts.types) ? opts.types : ['scope', 'qual', 'notice_type'];
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 5;
  const resolveOnApply = !!opts.resolveOnApply;

  const byType = {};
  let processed = 0, applied = 0, errors = 0, skipped = 0;

  for (const t of types) {
    if (!TYPES[t]) {
      byType[t] = { error: `unknown type: ${t}` };
      continue;
    }
    const cfg = TYPES[t];

    let entries;
    try {
      entries = cfg.listFn({ resolved: false, limit });
    } catch (e) {
      byType[t] = { error: `list failed: ${e.message}` };
      continue;
    }

    const typeStats = {
      processed: 0, applied: 0, errors: 0, skipped: 0, items: [],
    };

    for (const entry of entries) {
      typeStats.processed++;
      processed++;

      // 跳过已删 announcement（rootless record）
      const ann = storage.getAnnouncement(entry.announcement_id);
      if (!ann) {
        typeStats.skipped++;
        skipped++;
        typeStats.items.push({ id: entry.id, ann: entry.announcement_id, result: 'skipped:ann_deleted' });
        continue;
      }

      // 调对应维度的 learn
      let r;
      try {
        r = await cfg.learnFn(entry.announcement_id);
      } catch (e) {
        typeStats.errors++;
        errors++;
        typeStats.items.push({ id: entry.id, ann: entry.announcement_id, result: { error: e.message } });
        continue;
      }

      const okReason = r?.applied ? 'applied' : (r?.reason || 'unknown');
      typeStats.items.push({ id: entry.id, ann: entry.announcement_id, result: okReason });

      if (r?.applied) {
        typeStats.applied++;
        applied++;
        if (resolveOnApply && cfg.resolvedFn) {
          // resolveScopeError 类似签名 (id, {ruleId, tag}) —— 没匹配则不传
          cfg.resolvedFn(entry.id, { ruleId: r.rule?.id, tag: r.rule?.tag });
        }
      } else if (r?.reason === 'no_ai_key' || r?.reason === 'announcement_not_found' || r?.reason === 'no_requirement_text') {
        // 这些不算"失败"，是状态
        typeStats.skipped++;
        skipped++;
      } else {
        typeStats.errors++;
        errors++;
      }
    }

    byType[t] = typeStats;
  }

  return {
    byType,
    totals: { processed, applied, errors, skipped },
    options: { types, limit, resolveOnApply },
    ranAt: new Date().toISOString(),
  };
}

/**
 * 队列当前大小（仅 read）—— 前端 dashboard 可轮询
 */
function queueStats() {
  return storage.getErrorLogCounts();  // 已含 scope/qual counts；新增 notice_type
}

module.exports = {
  runAutoBatch,
  queueStats,
};
