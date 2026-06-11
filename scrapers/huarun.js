/**
 * 华润守正采购交易平台 爬虫 (szecp.com.cn)
 *
 * 站点: https://www.szecp.com.cn/ (Tencent EdgeOne WAF, 但服务器 IP 不被拦)
 * 列表: GET /rcms-external-rest/content/getSZExtData?channelIds={id}&pageNo={n}&pageSize={size}
 *       通道 26909 = 招标公告, 26915 = 采购公告
 * 详情: GET <相对 url，来自列表 ../first_zbgg/2026-MM-DD/{contentId}.html>
 *
 * 与其他站点的关键差异：
 *   - 列表 API 一次只返一个 channel；本 scraper 并行抓 2 个 channel 然后合并去重
 *   - 平台是全国性的：日均 12-20 条公告里湖北/武汉相关通常 0-3 条；
 *     用 title 含 "武汉/湖北" 关键词做粗过滤，避免给每条都拉详情
 *   - 列表 API 自身就含 项目编号(number)、采购类型(purchaseType)、投标截止(deadline)、
 *     发布时间(publishDate)、businessUnit、contentId —— 详情页主要补 招标人/代理/预算/资质
 *   - 不复用 createPlatform：双 channel + 列表层 region 过滤是 platform.js 抽象之外的
 *     直接用 axios + cheerio，mapToNotion 仍走 utils/notion.buildPageProperties 同款字段
 *   - 详情 HTML 模板较老（"项目基本情况"段落式），用 cheerio 抠含公告正文的 div
 *     然后走 .text() 解码 &nbsp; + regex 抽取字段
 */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const notion = require('../utils/notion');
const { SOURCE_PAGES } = require('../config/notionDatabases');
const { IN_SCOPE, OUT_OF_SCOPE, extractDistrict, parseDate } = require('./platform');

const BASE = 'https://www.szecp.com.cn';
const CHANNELS = [
  { id: 26909, name: '招标公告', referer: `${BASE}/first_zbgg/index.html` },
  { id: 26915, name: '采购公告', referer: `${BASE}/first_cggg/index.html` },
];
const REGION_KEYWORDS = ['武汉', '湖北'];

/**
 * 用 curl 而非 axios/https：EdgeOne WAF 对 Node.js 的 TLS 指纹（JA3）返回 567，
 * 但对 curl 放行。绕路最直接：shell out curl。
 *   - 列表 API 用 curl 走 JSON
 *   - 详情 HTML 用 curl 走 text
 */
function curlGet(url, { referer, accept = '*/*' } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-sS', '-L', '--max-time', '30',
      '-H', `Accept: ${accept}`,
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    if (referer) args.push('-H', `Referer: ${referer}`);
    args.push(url);
    execFile('/usr/bin/curl', args, (err, stdout, stderr) => {
      if (err) return reject(new Error(`curl ${url} failed: ${err.message} ${stderr || ''}`));
      resolve(stdout);
    });
  });
}

const HUARUN_SCOPE_RULES = [
  { regex: /EPC|设计施工总承包|设计采购施工|交钥匙/, tag: 'EPC', stopOnMatch: true },
  { regex: /设备采购|器械采购/, tag: '设备采购', stopOnMatch: true },
  { regex: /材料采购/, tag: '材料采购', stopOnMatch: true },
  { regex: /货物采购|备件/, tag: '货物采购', stopOnMatch: true },
  { regex: /运维服务/, tag: '运维服务', stopOnMatch: true },
  { regex: /运维(?!服务)/, tag: '运维', stopOnMatch: true },
  { regex: /环卫/, tag: '环卫', stopOnMatch: true },
  { regex: /养护/, tag: '养护', stopOnMatch: true },
  { regex: /物业(?!服务)/, tag: '物业', stopOnMatch: true },
  { regex: /物业服务/, tag: '物业服务', stopOnMatch: true },
  { regex: /餐饮/, tag: '餐饮外包', stopOnMatch: true },
  { regex: /安保/, tag: '安保', stopOnMatch: true },
  { regex: /保洁/, tag: '保洁', stopOnMatch: true },
  { regex: /管护/, tag: '管护', stopOnMatch: true },
  { regex: /清淤/, tag: '清淤', stopOnMatch: true },
  { regex: /软件开发|系统集成|信息化平台/, tag: '软件开发', stopOnMatch: true },
  { regex: /信息化(?!平台)|智慧社区|智慧城市/, tag: '信息化服务', stopOnMatch: true },
  { regex: /污染调查|环境调查/, tag: '环境调查', stopOnMatch: true },
  { regex: /安全评估/, tag: '安全评估', stopOnMatch: true },
  { regex: /监理/, tag: '工程监理', stopOnMatch: true },
  { regex: /勘察设计|岩土勘察|地质勘查|工程勘察/, tag: '工程勘察', stopOnMatch: true },
  { regex: /设计(?!施工总承包|采购施工|服务)/, tag: '工程设计', stopOnMatch: true },
  { regex: /造价咨询|预算编制|造价预算|造价跟踪|跟踪造价/, tag: '造价咨询', stopOnMatch: true },
  { regex: /全过程造价|全过程工程咨询/, tag: '全过程工程咨询', stopOnMatch: true },
  { regex: /工程项目管理|建设项目管理/, tag: '工程项目管理', stopOnMatch: true },
  { regex: /结算审核|结算审计|审计服务|决算审计/, tag: '结算审计', stopOnMatch: true },
  { regex: /招标代理/, tag: '招标代理', stopOnMatch: true },
  { regex: /施工(?!总承包)/, tag: '施工', stopOnMatch: true },
  { regex: /检测|监测/, tag: '检测', stopOnMatch: true },
];

function isWuhanHubei(item) {
  return REGION_KEYWORDS.some(k => (item.title || '').includes(k));
}

function detectNoticeType(title) {
  if (/资格预审/.test(title)) return '资格预审公告';
  if (/招标公告/.test(title)) return '招标公告';
  if (/采购公告/.test(title)) return '采购公告';
  if (/更正公告/.test(title)) return '更正公告';
  if (/变更公告/.test(title)) return '变更公告';
  if (/终止公告/.test(title)) return '终止公告';
  if (/结果公告|中标公告/.test(title)) return '结果公告';
  if (/计划公告/.test(title)) return '计划公告';
  return null;
}

function absolutizeUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('..')) return `${BASE}${url.slice(2)}`;
  if (url.startsWith('/')) return `${BASE}${url}`;
  return `${BASE}/${url}`;
}

function mapListItem(item, channelName) {
  return {
    id: String(item.contentId),
    title: item.title,
    projectCode: item.number || null,
    noticeType: detectNoticeType(item.title) || channelName,
    detailUrl: absolutizeUrl(item.url),
    noticeStartDate: item.publishDate ? item.publishDate.slice(0, 10) : null,
    noticeEndDate: item.deadline ? item.deadline.slice(0, 10) : null,
    bidSubmitDeadline: item.deadline || null,
    purchaseType: item.purchaseType || null,
    businessUnit: item.businessUnit || null,
    contentHtml: null,
    plainBodyText: null,
  };
}

async function fetchListPage(channel, pageNo, pageSize) {
  const url = `${BASE}/rcms-external-rest/content/getSZExtData?channelIds=${channel.id}&pageNo=${pageNo}&pageSize=${pageSize}`;
  const body = await curlGet(url, { referer: channel.referer, accept: 'application/json, text/plain, */*' });
  let res;
  try { res = JSON.parse(body); } catch (e) { throw new Error(`列表 API 返回非 JSON: ${body.slice(0, 200)}`); }
  if (res.code !== 'S1A00000') {
    throw new Error(`列表 API 返回错误: ${res.msg || 'unknown'}`);
  }
  return res.data; // { pageNo, pageSize, totalCount, data: [...] }
}

async function fetchDetail(record) {
  const html = await curlGet(record.detailUrl, { referer: `${BASE}/`, accept: 'text/html,application/xhtml+xml,*/*' });
  return parseDetail(html, record);
}

function parseDetail(html, listRecord) {
  const $ = cheerio.load(html);
  // 抠出含公告正文的 div：szb-* 系列；退回最长的"含公告关键词"的 div
  let $content = $('.szb-content-item, .szb-content, .szb-detailMain, .szb-detail').first();
  if ($content.length === 0) {
    let best = null, bestLen = 0;
    $('div').each((_, el) => {
      const t = $(el).text();
      if (t.length > bestLen && /招标|采购|项目基本情况|投标人资格|资格预审/.test(t) && t.length < 30000) {
        best = el; bestLen = t.length;
      }
    });
    $content = best ? $(best) : $('body');
  }
  const contentHtml = $content.html() || '';
  const plainBodyText = $content.text().replace(/\s+/g, ' ').trim();
  return { ...listRecord, contentHtml, plainBodyText };
}

function rgx(text, pattern, fallback = null) {
  if (!text) return fallback;
  const m = text.match(pattern);
  return m ? m[1].trim() : fallback;
}

function parseBudget(text, label) {
  if (!text) return null;
  const m = text.match(new RegExp(`${label}[（(]\\s*万元\\s*[）)][：:]\\s*([0-9.]+)`))
    || text.match(new RegExp(`${label}[：:]\\s*([0-9.]+)\\s*[（(]\\s*万元`));
  return m ? parseFloat(m[1]) : null;
}

function inferScopeFn(record) {
  const text = (record.title || '') + ' ' + (record.plainBodyText || '');
  for (const rule of HUARUN_SCOPE_RULES) {
    if (rule.regex.test(text)) return [rule.tag];
  }
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

function inferProgress(item) {
  const now = new Date();
  const start = parseDate(item.noticeStartDate);
  const end = parseDate(item.noticeEndDate);
  if (end && end <= now) return '报名截止';
  if (start && start <= now && (!end || now < end)) return '公告中';
  return null;
}

function mapToNotion(record) {
  const t = record.title || '';
  const plain = record.plainBodyText || '';
  const item = {
    _raw: record,
    id: record.id,
    title: t,
    projectCode: record.projectCode,
    noticeType: record.noticeType,
    detailUrl: record.detailUrl,
    noticeStartDate: record.noticeStartDate,
    noticeEndDate: record.noticeEndDate,
    district: extractDistrict(t) || (/武汉/.test(t) ? '武汉市' : '湖北省'),
    tenderCorp: rgx(plain, /招标人[：:]\s*([^\s（(|｜]{2,40})/)
      || rgx(plain, /采购人[：:]\s*([^\s（(|｜]{2,40})/),
    agencyCorp: rgx(plain, /招标代理机构[：:]\s*([^\s（(|｜]{2,40})/)
      || rgx(plain, /采购代理机构[：:]\s*([^\s（(|｜]{2,40})/),
    contractPrice: parseBudget(plain, '预算金额') || parseBudget(plain, '招标控制价'),
    offerPrice: parseBudget(plain, '最高限价'),
    bidSubmitDeadline: record.bidSubmitDeadline,
    requirement: rgx(plain, /(?:特定资格要求|资格要求)[：:][\s\S]{0,500}?(?=[一二三四五六七八九十]、|$)/),
  };
  item.scopeTags = inferScopeFn(record);
  item.businessMatch = inferBusinessMatch(item.scopeTags);
  item.projectProgress = inferProgress(item);
  return item;
}

async function run({ pageCount = 2, pageSize = 20, outputFile = null, timeRange = null } = {}) {
  console.log(`开始爬取 华润守正 (huarun): 每通道 ${pageCount} 页 × ${pageSize} 条`);

  // 1. 列表：两通道并行抓（先 1 页，过滤 region 后不够再拉第 2 页）
  const seen = new Set();
  const filtered = [];
  let stopReason = 'no_region_match';

  for (const channel of CHANNELS) {
    for (let p = 1; p <= pageCount; p++) {
      const data = await fetchListPage(channel, p, pageSize);
      const items = (data?.data) || [];
      if (items.length === 0) break;
      console.log(`  [${channel.name} p${p}] 拿到 ${items.length} 条`);
      let allBefore = true;
      for (const it of items) {
        if (!isWuhanHubei(it)) continue;
        if (seen.has(String(it.contentId))) continue;
        seen.add(String(it.contentId));
        filtered.push(mapListItem(it, channel.name));
      }
      // time window 早于 from 则该通道停止
      if (timeRange?.from && items[items.length - 1]?.publishDate) {
        const last = new Date(items[items.length - 1].publishDate.replace(' ', 'T'));
        if (!isNaN(last.getTime()) && last < timeRange.from) {
          console.log(`  [${channel.name} p${p}] 末条 ${items[items.length - 1].publishDate} 早于 dateBegin，停止该通道`);
          allBefore = false;
          break;
        }
      }
      if (items.length < pageSize) break;
      if (!allBefore) break;
      // WAF 友好：分页/通道间停顿（EdgeOne 对突发请求敏感）
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n[华润守正] 湖北/武汉相关 ${filtered.length} 条，开始拉详情`);
  stopReason = filtered.length === 0 ? 'no_region_match' : 'complete';

  // 2. 详情
  const items = [];
  for (const r of filtered) {
    try {
      const detail = await fetchDetail(r);
      const item = mapToNotion(detail);
      items.push(item);
      console.log(`  ✓ ${item.title.slice(0, 50)} | ${item.projectProgress ?? '?'} | ${item.businessMatch}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      console.error(`  ✗ ${r.title.slice(0, 50)}: ${e.message}`);
    }
  }

  if (outputFile) {
    const out = path.join(__dirname, '../data', outputFile);
    fs.writeFileSync(out, JSON.stringify(items, null, 2), 'utf-8');
    console.log(`已保存 ${items.length} 条到 ${out}`);
  }

  console.log(`\n[华润守正] 停止原因: ${stopReason}, 命中 ${items.length} 条`);
  return { items, stopReason };
}

module.exports = {
  meta: {
    name: '华润守正采购交易平台',
    homepage: 'https://www.szecp.com.cn/',
    sourcePageId: SOURCE_PAGES.huarun,
    scriptId: 'huarun',
  },
  run,
  mapToNotion,
  inferScope: inferScopeFn,
  inferBusinessMatch,
  inferProgress,
  writeFeedbackLogs: () => ({ scopeIds: [], qualIds: [] }),
};

if (require.main === module) {
  module.exports.run({ pageCount: 2, pageSize: 20, outputFile: 'huarun_test.json' })
    .then(() => process.exit(0))
    .catch(e => { console.error('失败:', e); process.exit(1); });
}
