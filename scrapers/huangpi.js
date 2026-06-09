/**
 * 黄陂区政府采购交易系统 爬虫
 * 站点: http://47.111.115.168:10013 (czy-portal-web, Vue SPA)
 * 列表: GET /czy-portal/content/indexAnnouncementMore?page=N&pageSize=10&info=0&tenantCode=...
 * 详情: GET /czy-portal/content/indexAnnouncementDetail?uuid=...&tenantCode=...
 *
 * 注意：列表只返回 uuid/titleName/fbTime；其余字段全部从详情 HTML 正文解析（复用 utils/parseHtmlContent）
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseHtmlContent, parseQualificationText, extractQualSection } = require('../utils/parseHtmlContent');
const { SOURCE_PAGES, NOTION_TOKEN, SCOPE_ERROR_LOG_DB, QUAL_ERROR_LOG_DB } = require('../config/notionDatabases');
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const BASE = 'http://47.111.115.168:10013';
const LIST_API = '/czy-portal/content/indexAnnouncementMore';
const DETAIL_API = '/czy-portal/content/indexAnnouncementDetail';
const TENANT_CODE = '704156826496442368'; // 黄陂区租户号
const DATA_DIR = path.join(__dirname, '../data');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'http://47.111.115.168:10013/'
};

function buildDetailUrl(uuid) {
  return `http://47.111.115.168:10013/#/infoDetail?id=${uuid}&type=remote`;
}

// 业务匹配规则（与 whzbtbxt / dongxihu 一致）
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

function inferScope(item, demandKeywords = '', scopeRules = null) {
  const title = item.titleName || '';
  const bizText = title + ' ' + demandKeywords;

  if (scopeRules && scopeRules.length > 0) {
    const tags = [];
    for (const rule of scopeRules) {
      if (rule.regex.test(bizText)) {
        tags.push(rule.tag);
        if (rule.stopOnMatch) break;
      }
    }
    return tags.length > 0 ? tags : ['其他'];
  }

  if (/EPC|设计施工总承包|设计采购施工|交钥匙/.test(bizText)) return ['EPC'];
  if (/设备采购|器械采购/.test(bizText)) return ['设备采购'];
  if (/材料采购/.test(bizText)) return ['材料采购'];
  if (/货物采购/.test(bizText)) return ['货物采购'];
  if (/工程监理|建设监理|监理(?!服务)/.test(bizText)) return ['工程监理'];
  if (/工程设计|设计服务|勘察设计|建筑设计/.test(bizText)) return ['建筑设计'];
  if (/造价咨询|预算编制|造价预算/.test(bizText)) return ['造价预算'];
  if (/全过程工程咨询/.test(bizText)) return ['全过程工程咨询'];
  if (/工程项目管理|建设项目管理/.test(bizText)) return ['工程项目管理'];
  if (/结算审核|结算审计|审计服务/.test(bizText)) return ['结算审计'];
  if (/决算审核|决算审计/.test(bizText)) return ['决算审计'];
  if (/工程勘察|岩土勘察|地质勘查/.test(bizText)) return ['工程勘查'];
  return ['其他'];
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

function parseDate(s) {
  if (!s) return null;
  // 允许 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:MM[:SS]" 或 "YYYY-MM-DDTHH:MM[:SS]"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[\sT](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (!m) return null;
  const iso = m[2]
    ? `${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}+08:00`
    : `${m[1]}T00:00:00+08:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function inferProgress(item) {
  const now = new Date();
  const start = parseDate(item.noticeStartDate);
  const end = parseDate(item.noticeEndDate);
  if (end && end <= now) return '报名截止';
  if (start && start <= now && (!end || now < end)) return '公告中';
  return null;
}

async function fetchList(pageNum, pageSize = 10, info = '0') {
  const res = await axios.get(`${BASE}${LIST_API}`, {
    params: {
      page: pageNum,
      pageSize,
      info,
      tenantCode: TENANT_CODE,
      articleName: '',
      planId: '',
      cgrName: '',
      itemName: '',
      stockWay: '',
      startDate: '',
      endDate: ''
    },
    headers: HEADERS,
    timeout: 30000
  });
  // 站点返回 { head, body: { code, msg, success, data: { total, list } } }
  const body = res.data?.body;
  if (!body?.success) {
    throw new Error(`列表 API 返回错误: ${body?.msg || res.data?.head?.msg}`);
  }
  const d = body.data || {};
  return { total: d.total || 0, records: d.list || [] };
}

async function fetchDetail(uuid) {
  const res = await axios.get(`${BASE}${DETAIL_API}`, {
    params: { uuid, tenantCode: TENANT_CODE },
    headers: HEADERS,
    timeout: 30000
  });
  const body = res.data?.body;
  if (!body?.success) {
    throw new Error(`详情 API 返回错误: ${body?.msg || res.data?.head?.msg}`);
  }
  const dl = body.data?.dataList;
  if (!Array.isArray(dl) || !dl[0]) throw new Error('详情 API dataList 为空');
  return dl[0];
}

function mapToNotion(record, scopeRules = null) {
  const htmlParsed = record.content ? parseHtmlContent(record.content, null) : {};
  const plainText = record.content ? record.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '';
  const qualParsed = record.content ? parseQualificationText(plainText) : null;

  const scopeTags = inferScope(record, htmlParsed.demandKeywords, scopeRules);
  const businessMatch = inferBusinessMatch(scopeTags);

  const requirement = (qualParsed && qualParsed.length > 0)
    ? qualParsed.map(q => q.raw).join('\n')
    : null;
  const qualExplicitNone = /特定资格要求[：:]\s*无/i.test(plainText);

  const scopeMatchText = [record.titleName, htmlParsed.demandKeywords || '']
    .filter(Boolean).join(' ');

  // 黄陂区列表只返回 uuid/titleName/fbTime，其余字段都来自 HTML 解析：
  //   noticeStartDate = fbTime（发布日期），noticeEndDate = bidSubmitDeadline（投标截止）
  //   projectCode = noteNumber（采购计划备案号）
  const item = {
    id: record.uuid,
    title: record.titleName,
    projectCode: htmlParsed.noteNumber || null,
    noticeType: htmlParsed.noticeType || null,
    detailUrl: buildDetailUrl(record.uuid),
    noticeStartDate: record.fbTime || null,
    noticeEndDate: htmlParsed.bidSubmitDeadline || null,
    district: '黄陂区',
    tenderCorp: htmlParsed.tenderCorp || null,
    agencyCorp: htmlParsed.agencyCorp || null,
    contractPrice: htmlParsed.contractPrice || null,
    description: null,
    // v2 字段
    scopeTags,
    businessMatch,
    projectProgress: null,
    bidSubmitDeadline: htmlParsed.bidSubmitDeadline || null,
    publicityDate: null,
    resultDate: null,
    offerPrice: htmlParsed.offerPrice || null,
    tenderBond: null,
    requirement,
    noteNumber: htmlParsed.noteNumber || null,
    tenderLinkPhone: htmlParsed.tenderPhone || null,
    tenderLinkMan: htmlParsed.projectContact || null,
    agencyLinkPhone: htmlParsed.agencyPhone || null,
    _raw: record,
    _scopeMatchText: scopeMatchText,
    _qualMatchText: extractQualSection(plainText),
    _qualExplicitNone: qualExplicitNone
  };

  item.projectProgress = inferProgress(item);
  return item;
}

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

async function writeFeedbackLogs(items, results) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = results.details?.[i];
    if (!result || result.status === 'skipped' || result.status === 'error') continue;
    const pageId = result.pageId;

    const scopeUnmatched = item.scopeTags?.length === 1 && item.scopeTags[0] === '其他';
    if (scopeUnmatched) {
      try {
        await createErrorLogPage(SCOPE_ERROR_LOG_DB, {
          '来源招标公告': { relation: [{ id: pageId }] },
          '原始文本': { rich_text: [{ text: { content: item._scopeMatchText || '' } }] },
        });
        console.log(`  [scope反馈] 已写入 ${pageId}`);
      } catch (e) {
        console.error(`  [scope反馈] 写入失败: ${e.message}`);
      }
    }

    if (!item.requirement && !item._qualExplicitNone) {
      try {
        await createErrorLogPage(QUAL_ERROR_LOG_DB, {
          '来源招标公告': { relation: [{ id: pageId }] },
          '原始文本': { rich_text: [{ text: { content: item._qualMatchText || item._scopeMatchText || '' } }] },
        });
        console.log(`  [qual反馈] 已写入 ${pageId}`);
      } catch (e) {
        console.error(`  [qual反馈] 写入失败: ${e.message}`);
      }
    }
  }
}

async function run({ pageCount = 1, pageSize = 10, outputFile = null, onItem = null, scopeRules = null, uploadResults = null } = {}) {
  console.log(`开始爬取黄陂区: ${pageCount} 页 × ${pageSize} 条`);

  const allItems = [];
  for (let p = 1; p <= pageCount; p++) {
    console.log(`\n--- 列表第 ${p}/${pageCount} 页 ---`);
    const listData = await fetchList(p, pageSize);
    console.log(`  总数: ${listData.total}, 当前页 ${listData.records.length} 条`);

    for (const r of listData.records) {
      try {
        const detailData = await fetchDetail(r.uuid);
        // 列表的 fbTime/titleName 是详情没有重复的字段，合并进 record 给 mapToNotion 用
        detailData.uuid = r.uuid;
        detailData.fbTime = detailData.fbTime || r.fbTime;
        detailData.titleName = detailData.titleName || r.titleName;
        const item = mapToNotion(detailData, scopeRules);
        allItems.push(item);
        console.log(`  ✓ ${item.title?.substring(0, 50)} | ${item.projectProgress ?? '?'} | ${item.businessMatch}`);
        if (onItem) onItem(item);
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`  ✗ ${r.titleName || r.uuid}: ${e.message}`);
      }
    }
  }

  if (outputFile) {
    const filePath = path.join(DATA_DIR, outputFile);
    fs.writeFileSync(filePath, JSON.stringify(allItems, null, 2), 'utf-8');
    console.log(`\n已保存 ${allItems.length} 条到 ${filePath}`);
  }

  console.log(`\n爬取完成: ${allItems.length} 条`);
  return { items: allItems, uploadResults };
}

module.exports = {
  run,
  fetchList,
  fetchDetail,
  mapToNotion,
  buildDetailUrl,
  inferScope,
  inferBusinessMatch,
  inferProgress,
  writeFeedbackLogs,
  meta: {
    name: '黄陂区政府采购交易系统',
    homepage: 'http://47.111.115.168:10013/#/remoteList',
    sourcePageId: SOURCE_PAGES.huangpi,
    scriptId: 'wuhan_huangpi_district'
  }
};

if (require.main === module) {
  run({ pageCount: 1, pageSize: 5, outputFile: 'huangpi_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
