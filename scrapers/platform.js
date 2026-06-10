/**
 * 招标公告平台爬虫抽象基座
 *
 * 三个站点（whzbtbxt / dongxihu / huangpi）共享同一套流程：
 *   fetchList → fetchDetail → 解析 HTML → mapToNotion → 写 Notion + 反馈日志
 * 把共享部分抽出来，每个站点仅提供声明性 config 描述其差异。
 *
 * 用法：
 *   const platform = createPlatform({
 *     meta,            // { name, homepage, sourcePageId, scriptId }
 *     http,            // { base, list: {...}, detail: {...} } - HTTP 调用方式
 *     fields,          // { id, title, ... } - 原始 record → Notion 字段映射
 *     parseHtml,       // { useContent, stockWay } - HTML 解析开关
 *     inferScope,      // 可选: 自定义 scope 推断函数（覆盖默认 regex 引擎）
 *     inferScopeRules, // 可选: regex 规则数组 [{ regex, tag, stopOnMatch }]
 *     detailDelayMs,   // 详情请求间隔，默认 300ms
 *   });
 *   module.exports = platform;
 *
 * 设计原则：
 *   - 业务规则（IN_SCOPE / inferBusinessMatch / inferProgress / writeFeedbackLogs）单点维护
 *   - 字段映射以函数形式声明（fields 是 dict of functions）
 *   - HTTP 调用方式以 config 声明（query/body/headers/unwrap）
 *   - 单站"小钩子"（fields 内的复杂 lambda、http.unwrap 等）总和 ≤ 30 行
 *     声明性 config（URL、字段名、regex 数组）不计入
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const {
  parseHtmlContent,
  parseQualificationText,
  extractQualSection
} = require('../utils/parseHtmlContent');
const {
  NOTION_TOKEN,
  SCOPE_ERROR_LOG_DB,
  QUAL_ERROR_LOG_DB
} = require('../config/notionDatabases');
const { getLastSeenAnnouncementForSource } = require('../utils/scrapeLog');

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DATA_DIR = path.join(__dirname, '../data');

// === 共享业务规则 ===

const WUHAN_DISTRICTS = [
  '江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区',
  '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区',
  '经开区', '东湖高新区', '东湖风景区', '长江新区', '武汉市'
];

const IN_SCOPE = new Set([
  '招标代理', '手续代办',
  '工程监理', '工程设计', '工程勘察', '造价咨询', '全过程工程咨询',
  '设计', '监理', '勘察', '设计服务', '初步设计', '勘察设计',
  '造价', '全过程造价', '全过程造价控制',
  '审计', '审计服务', '决算审计',
  '投资咨询', '咨询服务'
]);

const OUT_OF_SCOPE = new Set([
  '施工', 'EPC', '工程总承包', '专业分包', '材料设备采购', '设备采购', '检测'
]);

function extractDistrict(address, fallback = null) {
  if (!address) return fallback;
  for (const d of WUHAN_DISTRICTS) {
    if (address.includes(d)) return d;
  }
  return fallback;
}

function parseDate(s) {
  if (!s) return null;
  // 兼容 "YYYY-MM-DD"、"YYYY-MM-DD HH:MM[:SS]"、"YYYY-MM-DDTHH:MM[:SS]"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[\sT](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (!m) return null;
  const iso = m[2]
    ? `${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}+08:00`
    : `${m[1]}T00:00:00+08:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function inferBusinessMatch(scopeTags) {
  if (!scopeTags || scopeTags.length === 0) return '待评估';
  const hasIn = scopeTags.some(t => IN_SCOPE.has(t));
  const hasOut = scopeTags.some(t => OUT_OF_SCOPE.has(t));
  if (hasOut && !hasIn) return '不可做';
  if (hasIn && !hasOut) return '主营业务可做';
  if (hasIn && hasOut) return '部分可做';
  return '待评估';
}

function inferProgress(item) {
  const now = new Date();
  const start = parseDate(item.noticeStartDate);
  const end = parseDate(item.noticeEndDate);
  const pub = parseDate(item.publicityDate);
  const result = parseDate(item.resultDate);
  if (result && result <= now) return '已中标';
  if (pub && pub <= now) return '中标公示';
  if (end && end <= now) return '报名截止';
  if (start && start <= now && (!end || now < end)) return '公告中';
  return null;
}

// === 共享错误日志 ===

function errorLogHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

async function createErrorLogPage(databaseId, properties) {
  const res = await axios.post(`${NOTION_API}/pages`, {
    parent: { database_id: databaseId },
    properties
  }, { headers: errorLogHeaders() });
  return res.data;
}

async function writeFeedbackLogs(items, results, meta) {
  if (!results) return { scopeIds: [], qualIds: [] };
  const scopeIds = [];
  const qualIds = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = results.details?.[i];
    if (!result || result.status === 'skipped' || result.status === 'error') continue;
    const pageId = result.pageId;

    const scopeUnmatched = item.scopeTags?.length === 1 && item.scopeTags[0] === '其他';
    if (scopeUnmatched && SCOPE_ERROR_LOG_DB) {
      try {
        const page = await createErrorLogPage(SCOPE_ERROR_LOG_DB, {
          '来源招标公告': { relation: [{ id: pageId }] },
          '原始文本': { rich_text: [{ text: { content: item._scopeMatchText || '' } }] },
        });
        scopeIds.push(page.id);
        console.log(`  [scope反馈] 已写入 ${page.id}`);
      } catch (e) {
        console.error(`  [scope反馈] 写入失败: ${e.message}`);
      }
    }

    if (!item.requirement && !item._qualExplicitNone && QUAL_ERROR_LOG_DB) {
      try {
        const page = await createErrorLogPage(QUAL_ERROR_LOG_DB, {
          '来源招标公告': { relation: [{ id: pageId }] },
          '原始文本': { rich_text: [{ text: { content: item._qualMatchText || item._scopeMatchText || '' } }] },
        });
        qualIds.push(page.id);
        console.log(`  [qual反馈] 已写入 ${page.id}`);
      } catch (e) {
        console.error(`  [qual反馈] 写入失败: ${e.message}`);
      }
    }
  }
  return { scopeIds, qualIds };
}

// === HTTP 抽象 ===

async function callEndpoint(spec, base, pageOrId, size, timeRange) {
  const pathStr = typeof spec.path === 'function'
    ? spec.path(pageOrId, size, timeRange)
    : spec.path;
  const url = `${base}${pathStr}`;
  const query = typeof spec.query === 'function'
    ? spec.query(pageOrId, size, timeRange)
    : spec.query || null;
  const body = typeof spec.body === 'function'
    ? spec.body(pageOrId, size, timeRange)
    : spec.body || null;

  const opts = { headers: spec.headers, timeout: 30000 };
  if (query) opts.params = query;

  if (process.env.DEBUG_HTTP) {
    console.log(`[DEBUG_HTTP] ${spec.method} ${url} query=${JSON.stringify(query)} body=${JSON.stringify(body)}`);
  }

  if (spec.method === 'GET') {
    const res = await axios.get(url, opts);
    return res.data;
  }
  // POST: 默认 form-encoded；spec.bodyType='json' 则发 JSON
  if (body) {
    if (spec.bodyType === 'json') {
      opts.data = JSON.stringify(body);
    } else {
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v != null) form.append(k, String(v));
      }
      opts.data = form.toString();
    }
  } else {
    opts.data = '';
  }
  const res = await axios.post(url, opts.data, opts);
  return res.data;
}

// === 默认 inferScope（regex 引擎） ===

function makeRegexInferScope(rules) {
  return function inferScope(item, demandKeywords = '', dynamicRules = null) {
    const effectiveRules = (dynamicRules && dynamicRules.length > 0) ? dynamicRules : rules;
    if (!effectiveRules || effectiveRules.length === 0) return ['其他'];
    const title = (item && (item.titleName || item.title)) || '';
    const bizText = title + ' ' + (demandKeywords || '');
    const tags = [];
    for (const rule of effectiveRules) {
      if (rule.regex.test(bizText)) {
        tags.push(rule.tag);
        if (rule.stopOnMatch) break;
      }
    }
    return tags.length > 0 ? tags : ['其他'];
  };
}

// === 平台工厂 ===

function createPlatform({
  meta,
  http,
  fields,
  parseHtml = { useContent: false },
  inferScope,
  inferScopeRules,
  detailDelayMs = 300,
  outputDir = DATA_DIR
}) {
  if (!meta) throw new Error('createPlatform: meta is required');
  if (!http) throw new Error('createPlatform: http is required');
  if (!http.base) throw new Error('createPlatform: http.base is required');
  if (!http.list) throw new Error('createPlatform: http.list is required');
  if (!http.detail) throw new Error('createPlatform: http.detail is required');
  if (!fields) throw new Error('createPlatform: fields is required');
  if (!fields.id) throw new Error('createPlatform: fields.id is required');
  if (!fields.title) throw new Error('createPlatform: fields.title is required');
  if (!inferScope && !inferScopeRules) {
    throw new Error('createPlatform: inferScope 或 inferScopeRules 必须提供一个');
  }

  const inferScopeFn = inferScope || makeRegexInferScope(inferScopeRules);

  async function fetchList(pageNum, pageSize, timeRange) {
    const res = await callEndpoint(http.list, http.base, pageNum, pageSize, timeRange);
    return http.list.unwrap(res);
  }

  async function fetchDetail(id, listRecord) {
    const res = await callEndpoint(http.detail, http.base, id);
    return http.detail.unwrap(res, listRecord);
  }

  function mapToNotion(record, scopeRules = null) {
    let htmlParsed = {};
    let plainText = '';
    let qualParsed = null;

    if (parseHtml.useContent && record && record.content) {
      const stockWay = typeof parseHtml.stockWay === 'function'
        ? parseHtml.stockWay(record)
        : (parseHtml.stockWay || null);
      htmlParsed = parseHtmlContent(record.content, stockWay) || {};
      plainText = record.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      qualParsed = parseQualificationText(plainText);
    }

    const item = { _raw: record };
    for (const [key, fn] of Object.entries(fields)) {
      try {
        const value = fn(record, htmlParsed, qualParsed, plainText);
        if (value !== undefined) item[key] = value;
      } catch (e) {
        // 字段映射失败不阻塞其他字段
        item[key] = null;
      }
    }

    // HTML 模式下自动填充反馈日志需要的内部字段（供 writeFeedbackLogs 使用）
    if (parseHtml.useContent) {
      const title = record.titleName || record.title || '';
      if (item._scopeMatchText === undefined) {
        item._scopeMatchText = [title, htmlParsed.demandKeywords || ''].filter(Boolean).join(' ');
      }
      if (item._qualMatchText === undefined) {
        item._qualMatchText = extractQualSection(plainText);
      }
      if (item._qualExplicitNone === undefined) {
        item._qualExplicitNone = /特定资格要求[：:]\s*无/i.test(plainText);
      }
    }

    item.scopeTags = inferScopeFn(record, htmlParsed.demandKeywords || '', scopeRules);
    item.businessMatch = inferBusinessMatch(item.scopeTags);
    item.projectProgress = inferProgress(item);
    return item;
  }

  async function run({ pageCount = 1, pageSize = 10, outputFile = null, onItem = null, scopeRules = null, uploadResults = null, timeRange = null, maxPages = 50 } = {}) {
    const supportsTimeFilter = http.list.supportsTimeFilter !== false;
    const maxPageCap = Math.max(pageCount, maxPages);

    // watermark 兜底：仅在 list API 不支持时间过滤时启用
    let watermarkId = null;
    if (!supportsTimeFilter && meta.sourcePageId && timeRange) {
      const wm = await getLastSeenAnnouncementForSource(meta.sourcePageId);
      watermarkId = wm?.id || null;
      if (watermarkId) {
        console.log(`[watermark] ${meta.name} 上次已抓最新公告 ${watermarkId}，将分页直到命中`);
      }
    }

    console.log(`开始爬取 ${meta.name}: ${maxPageCap} 页 × ${pageSize} 条 (time-filter=${supportsTimeFilter})`);

    const allItems = [];
    let stopReason = 'max_pages';
    let pageNum = 1;
    while (pageNum <= maxPageCap) {
      console.log(`\n--- 列表第 ${pageNum} 页 ---`);
      const listData = await fetchList(pageNum, pageSize, timeRange);
      const records = listData.records || [];
      const total = listData.total ?? records.length;
      // actualPageSize: 服务端真实返回条数（unwrap 内已做过滤时与 records.length 不一致）
      const actualSize = listData.actualPageSize ?? records.length;
      console.log(`  总数: ${total}, 当前页 ${records.length} 条 (raw=${actualSize})`);

      if (actualSize === 0) {
        stopReason = 'empty_page';
        break;
      }

      let pageShouldStop = false;
      for (const r of records) {
        if (watermarkId && r[http.list.idKey] === watermarkId) {
          console.log(`  [watermark] 命中上次已抓记录 ${watermarkId}，停止分页`);
          stopReason = 'watermark_hit';
          pageShouldStop = true;
          break;
        }
        if (!supportsTimeFilter && timeRange?.from) {
          const pubStr = r.noticeStartDate || r.fbTime || r.startDate || r.inputDate;
          if (pubStr) {
            const pub = new Date(pubStr.replace(' ', 'T'));
            if (!isNaN(pub.getTime()) && pub < timeRange.from) {
              console.log(`  [time-window] 记录 ${r[http.list.idKey]} 早于 dateBegin，停止分页`);
              stopReason = 'time_window_passed';
              pageShouldStop = true;
              break;
            }
          }
        }
        try {
          const id = r[http.list.idKey];
          const record = await fetchDetail(id, r);
          const item = mapToNotion(record, scopeRules);
          allItems.push(item);
          console.log(`  ✓ ${(item.title || '').substring(0, 50)} | ${item.projectProgress ?? '?'} | ${item.businessMatch}`);
          if (onItem) onItem(item);
          await new Promise(resolve => setTimeout(resolve, detailDelayMs));
        } catch (e) {
          const label = r.titleName || r.title || r.tenderPrjName || r[http.list.idKey] || '?';
          console.error(`  ✗ ${label}: ${e.message}`);
        }
      }
      if (pageShouldStop) break;
      if (actualSize < pageSize) {
        stopReason = 'last_page';
        break;
      }
      pageNum++;
    }

    console.log(`\n[${meta.name}] 停止原因: ${stopReason}, 命中 ${allItems.length} 条`);

    if (outputFile) {
      const filePath = path.join(outputDir, outputFile);
      fs.writeFileSync(filePath, JSON.stringify(allItems, null, 2), 'utf-8');
      console.log(`已保存 ${allItems.length} 条到 ${filePath}`);
    }

    console.log(`爬取完成: ${allItems.length} 条`);
    return { items: allItems, uploadResults, stopReason };
  }

  function getWriteFeedbackLogs(meta) {
    return (items, results) => writeFeedbackLogs(items, results, meta);
  }

  return {
    meta,
    run,
    fetchList,
    fetchDetail,
    mapToNotion,
    inferScope: inferScopeFn,
    inferBusinessMatch,
    inferProgress,
    writeFeedbackLogs: getWriteFeedbackLogs(meta)
  };
}

module.exports = {
  createPlatform,
  WUHAN_DISTRICTS,
  IN_SCOPE,
  OUT_OF_SCOPE,
  extractDistrict,
  parseDate,
  inferBusinessMatch,
  inferProgress,
  writeFeedbackLogs
};
