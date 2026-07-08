/**
 * 存储路由：根据环境变量 / 参数在 SQLite 与 Notion 之间切换
 *
 * 设计：scraper 输出的统一 mapToNotion 结构对两个后端都适用；
 *       唯一的差异是上传/查重/写日志的实现，本文件统一抽象。
 *
 * 用法：
 *   const store = createStore('sqlite');   // 或 'notion'
 *   await store.uploadItems(items, { platformId, skipExisting });
 *   await store.writeFeedbackLogs(items, uploadDetails);
 *   await store.createScrapeLog({...});
 */
const sqliteAdapter = require('../server/src/storage/adapter');
const sqliteDb = require('../server/src/db');
const notion = require('./notion');

function createStore(kind = 'sqlite') {
  if (kind === 'notion') {
    return {
      kind: 'notion',
      uploadItems: (items, opts) => notion.uploadItems(items, {
        skipExisting: opts.skipExisting,
        sourcePageId: opts.sourcePageId,
      }),
      writeFeedbackLogs: (items, results, meta) =>
        require('./platform').writeFeedbackLogs(items, results, meta),
      createScrapeLog: (opts) => notion.createScrapeLog(opts),
    };
  }

  return {
    kind: 'sqlite',
    uploadItems: (items, opts) => {
      const platformId = opts.platformId;
      const details = [];
      let created = 0, updated = 0, skipped = 0, error = 0;
      for (const item of items) {
        try {
          const status = sqliteAdapter.upsertAnnouncement(item, platformId, {
            forceUpdate: !opts.skipExisting,
          });
          if (status === 'created') created++;
          else if (status === 'updated') updated++;
          else skipped++;
          const ann = sqliteAdapter.findExisting(platformId, item.id ? String(item.id) : null);
          details.push({ id: ann?.id || null, status, noticeId: item.id });
        } catch (e) {
          console.error(`  [sqlite] upsert 失败 (${item.id || '?'}): ${e.message}`);
          error++;
          details.push({ id: null, status: 'error', error: e.message });
        }
      }
      sqliteDb.prepare(
        `UPDATE platforms SET last_run_at = datetime('now'), total_fetched = total_fetched + ? WHERE id = ?`
      ).run(items.length, platformId);
      return { created, updated, skipped, error, details };
    },
    writeFeedbackLogs: (items, results) => sqliteAdapter.writeFeedbackLogs(items, results),
    createScrapeLog: ({ scrapeTime, dateBegin, dateEnd, platformPageIds, announcementPageIds, scopeErrorPageIds, qualErrorPageIds, stats }) =>
      sqliteAdapter.createScrapeRun({
        scrapeTime, dateBegin, dateEnd,
        platformIds: platformPageIds,
        announcementIds: announcementPageIds,
        scopeErrorIds: scopeErrorPageIds,
        qualErrorIds: qualErrorPageIds,
        stats,
      }),
    getPlatformIdByScriptId: (scriptId) => sqliteAdapter.getPlatformByScriptId(scriptId)?.id || null,
    resolvePlatformIdsFromMeta: (entries) =>
      entries.map(([, scraper]) => sqliteAdapter.getPlatformByScriptId(scraper.meta?.scriptId)?.id).filter(Boolean),
  };
}

function getEnabledScriptIdsSqlite() {
  return new Set(
    sqliteDb.prepare('SELECT script_id FROM platforms WHERE enabled = 1').all().map((r) => r.script_id)
  );
}

module.exports = { createStore, getEnabledScriptIdsSqlite };