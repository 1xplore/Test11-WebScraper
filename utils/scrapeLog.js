/**
 * 抓取行为记录工具
 *
 * 每天 cron 跑完后在抓取统计数据库写 1 条记录，关联当次：
 *   - 抓取时间 / 时间窗
 *   - 所有跑过的平台（来源数据库 relation）
 *   - 所有创建/更新的公告（登记数据库 relation）
 *   - 所有错误日志（scope / qual 错误日志库 relation）
 *
 * 设计：
 *   - getLastScrapeTime() 读全局最新 1 条（所有站共用同一个时间窗）
 *   - getLastSeenAnnouncementForSource() 仍 per-station（watermark 兜底用）
 *   - createScrapeLog() 一次写满所有字段（包括全部 relations）
 */
const axios = require('axios');
const {
  NOTION_TOKEN,
  NOTICE_DB,
  SCRAPE_LOG_DB,
  SCRAPE_LOG_RELATION_FIELD
} = require('../config/notionDatabases');

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function notionHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

/**
 * 取抓取统计库最新 1 条记录的抓取时间（全局，不区分站点）
 * @returns {Promise<Date|null>}
 */
async function getLastScrapeTime() {
  try {
    const res = await axios.post(
      `${NOTION_BASE}/databases/${SCRAPE_LOG_DB}/query`,
      {
        page_size: 1,
        sorts: [{ property: '抓取时间', direction: 'descending' }]
      },
      { headers: notionHeaders(), timeout: 20000 }
    );
    const page = res.data.results[0];
    if (!page) return null;
    const iso = page.properties?.['抓取时间']?.date?.start;
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    console.warn(`[scrapeLog] getLastScrapeTime 失败: ${e.response?.data?.message || e.message}`);
    return null;
  }
}

/**
 * 取某 sourcePageId 在登记数据库中最新一条公告（用于 watermark 兜底）
 * @param {string} sourcePageId
 * @returns {Promise<{id: string, noticeStartDate: Date}|null>}
 */
async function getLastSeenAnnouncementForSource(sourcePageId) {
  try {
    const res = await axios.post(
      `${NOTION_BASE}/databases/${NOTICE_DB}/query`,
      {
        page_size: 1,
        filter: {
          property: '公告发布平台',
          relation: { contains: sourcePageId }
        },
        sorts: [{ property: '公告发布日期', direction: 'descending' }]
      },
      { headers: notionHeaders(), timeout: 20000 }
    );
    const page = res.data.results[0];
    if (!page) return null;
    const iso = page.properties?.['公告发布日期']?.date?.start;
    return {
      id: page.id,
      noticeStartDate: iso ? new Date(iso) : null
    };
  } catch (e) {
    console.warn(`[scrapeLog] getLastSeenAnnouncementForSource 失败: ${e.response?.data?.message || e.message}`);
    return null;
  }
}

/**
 * 写 1 条抓取日志（每天 1 条，跨所有站点）
 * @param {Object} args
 * @param {Date}   args.scrapeTime
 * @param {Date}   args.dateBegin
 * @param {Date}   args.dateEnd
 * @param {string[]} args.platformPageIds        来源数据库的 pageId 列表
 * @param {string[]} args.announcementPageIds    登记数据库的 pageId 列表
 * @param {string[]} args.scopeErrorPageIds      scope 错误日志库的 pageId 列表
 * @param {string[]} args.qualErrorPageIds       qual 错误日志库的 pageId 列表
 * @returns {Promise<string|null>} 新建页面的 pageId，失败返回 null
 */
async function createScrapeLog({
  scrapeTime,
  dateBegin,
  dateEnd,
  platformPageIds = [],
  announcementPageIds = [],
  scopeErrorPageIds = [],
  qualErrorPageIds = []
}) {
  const timeLabel = scrapeTime.toISOString().slice(0, 16).replace('T', ' ');
  const properties = {
    'Name': { title: [{ type: 'text', text: { content: `抓取统计 ${timeLabel}` } }] },
    '抓取时间': { date: { start: scrapeTime.toISOString() } },
    '抓取时间窗口开始': { date: { start: dateBegin.toISOString() } },
    '抓取时间窗口结束': { date: { start: dateEnd.toISOString() } },
    '抓取平台': { relation: platformPageIds.map(id => ({ id })) },
    '关联公告记录': { relation: announcementPageIds.map(id => ({ id })) },
    '关联Scope错误日志': { relation: scopeErrorPageIds.map(id => ({ id })) },
    '关联Qual错误日志': { relation: qualErrorPageIds.map(id => ({ id })) }
  };

  try {
    const res = await axios.post(
      `${NOTION_BASE}/pages`,
      { parent: { database_id: SCRAPE_LOG_DB }, properties },
      { headers: notionHeaders(), timeout: 20000 }
    );
    console.log(`[scrapeLog] 写入抓取记录 ${res.data.id}（${timeLabel}）：平台 ${platformPageIds.length} / 公告 ${announcementPageIds.length} / scope错误 ${scopeErrorPageIds.length} / qual错误 ${qualErrorPageIds.length}）`);
    return res.data.id;
  } catch (e) {
    console.error(`[scrapeLog] 写入失败: ${e.response?.data?.message || e.message}`);
    return null;
  }
}

module.exports = {
  getLastScrapeTime,
  getLastSeenAnnouncementForSource,
  createScrapeLog,
  SCRAPE_LOG_RELATION_FIELD
};
