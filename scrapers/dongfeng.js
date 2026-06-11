/**
 * 东风汽车采购招投标交易平台 爬虫 (etp.dfmc.com.cn)
 *
 * 站点: https://etp.dfmc.com.cn — 招标采购 / 非招标采购 / 废旧物资 等多个一级分类
 * 范围: 只抓「招标采购 - 招标公告」（categorynum=004001001），不做 region 过滤
 *
 * 列表（SSR HTML）:
 *   - 第 1 页: GET /jyxx/004001/004001001/trade_info_new.html
 *   - 第 2-6 页: GET /jyxx/004001/004001001/{N}.html
 *   - 第 7+ 页需要图形验证码（无法绕过）；前 6 页 × 10 条 = 60 条满足每日增量
 *   - tbody 行结构: [项目名称(含 href), 招标人, 招标编号, 招标方式, 截止时间, 发布日期]
 *
 * 详情（SSR HTML）:
 *   - URL 形如 /jyxx/004001/004001001/{YYYYMMDD}/{uuid}.html
 *   - <meta name="ArticleTitle"> / <meta name="PubDate"> 提供标题与发布时间
 *   - .article-info 包含完整公告正文（含表格）
 *   - 「招标人：」「招标代理机构：」「投标文件递交截止时间...为：」标签稳定
 *
 * 与 huarun 的相似点：列表/详情都是 HTML，axios + cheerio 直接走，不复用 platform.js 抽象
 */
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const notion = require('../utils/notion');
const { SOURCE_PAGES } = require('../config/notionDatabases');
const { IN_SCOPE, OUT_OF_SCOPE, parseDate } = require('./platform');

const BASE = 'https://etp.dfmc.com.cn';
const CATEGORY_PATH = '/jyxx/004001/004001001';
const MAX_SSR_PAGES = 6;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
  'Referer': `${BASE}/`,
};

// 规则 tag 必须在 utils/notion.js 的 KNOWN_VALUES['招标范围'] 白名单内，否则上传时被跳过。
// 东风以汽车产业链采购为主，标题大多映射到 OUT_OF_SCOPE（设备/施工/EPC/检测）或落入"其他"待人工评估。
const DONGFENG_SCOPE_RULES = [
  { regex: /EPC|设计施工总承包|设计采购施工|交钥匙/, tag: 'EPC', stopOnMatch: true },
  { regex: /监理/, tag: '工程监理', stopOnMatch: true },
  { regex: /勘察设计|岩土勘察|地质勘查|工程勘察/, tag: '工程勘察', stopOnMatch: true },
  { regex: /造价咨询|预算编制|造价跟踪|跟踪造价/, tag: '造价咨询', stopOnMatch: true },
  { regex: /全过程造价|全过程工程咨询/, tag: '全过程工程咨询', stopOnMatch: true },
  { regex: /审计服务|结算审计|决算审计|审计/, tag: '审计', stopOnMatch: true },
  { regex: /招标代理/, tag: '招标代理', stopOnMatch: true },
  { regex: /设计(?!施工总承包|采购施工)/, tag: '工程设计', stopOnMatch: true },
  { regex: /施工(?!总承包)|建设工程|总承包/, tag: '施工', stopOnMatch: true },
  { regex: /检测|监测/, tag: '检测', stopOnMatch: true },
  { regex: /设备|工装|治具|机床|生产线|自动化|改造|搬迁/, tag: '设备采购', stopOnMatch: true },
];

const NOTICE_TYPE_MAP = {
  '004001001': '招标公告',
  '004001002': '变更公告',
  '004001003': '中标候选人公示',
  '004001004': '中标公告',
  '004001005': '异常公示',
};

function detectNoticeTypeFromUrl(url) {
  const m = (url || '').match(/\/004001\/(004001\d{3})\//);
  return m ? (NOTICE_TYPE_MAP[m[1]] || '招标公告') : '招标公告';
}

function absolutizeUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${BASE}${url}`;
  return `${BASE}/${url}`;
}

function extractUuidFromUrl(url) {
  const m = (url || '').match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.html$/i);
  return m ? m[1] : null;
}

async function fetchListPage(pageNum) {
  const url = pageNum === 1
    ? `${BASE}${CATEGORY_PATH}/trade_info_new.html`
    : `${BASE}${CATEGORY_PATH}/${pageNum}.html`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 30000 });
  return parseListPage(res.data);
}

function parseListPage(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('#table-list tr').each((_, tr) => {
    const $tr = $(tr);
    const $link = $tr.find('a.title');
    const detailHref = $link.attr('href');
    if (!detailHref) return;
    const title = ($link.attr('title') || $link.text() || '').trim();
    const tds = $tr.find('td');
    const tenderCorp = $(tds[1]).attr('title') || $(tds[1]).text().trim();
    const projectCode = $(tds[2]).attr('title') || $(tds[2]).text().trim();
    const zbfs = $(tds[3]).text().trim();
    const deadline = $(tds[4]).attr('data-deadline') || $(tds[4]).attr('title') || '';
    const publishDate = $(tds[5]).text().trim();
    items.push({
      id: extractUuidFromUrl(detailHref),
      title,
      projectCode,
      noticeType: detectNoticeTypeFromUrl(detailHref),
      detailUrl: absolutizeUrl(detailHref),
      tenderCorpListing: tenderCorp,
      bidMethod: zbfs,
      bidSubmitDeadline: deadline || null,
      noticeStartDate: publishDate || null,
      noticeEndDate: deadline ? deadline.slice(0, 10) : null,
    });
  });
  return items;
}

async function fetchDetail(record) {
  const res = await axios.get(record.detailUrl, { headers: HEADERS, timeout: 30000 });
  return parseDetail(res.data, record);
}

function parseDetail(html, listRecord) {
  const $ = cheerio.load(html);
  const pubDate = $('meta[name="PubDate"]').attr('content') || null;
  const articleTitle = $('meta[name="ArticleTitle"]').attr('content') || listRecord.title;
  const $content = $('.article-info').first();
  const contentHtml = $content.length ? ($content.html() || '') : '';
  const plainBodyText = $content.length
    ? $content.text().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  return {
    ...listRecord,
    title: articleTitle || listRecord.title,
    publishDateTime: pubDate,
    noticeStartDate: pubDate ? pubDate.slice(0, 10) : listRecord.noticeStartDate,
    contentHtml,
    plainBodyText,
  };
}

function rgx(text, pattern, fallback = null) {
  if (!text) return fallback;
  const m = text.match(pattern);
  return m ? m[1].trim() : fallback;
}

function parseBidSubmitDeadline(plain) {
  // 「投标文件递交截止时间（同投标截止时间）为：2026年07月03日 09时30分」
  const m = plain.match(/投标(?:文件)?(?:递交)?截止时间[^：:]*[：:为]\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})时(\d{1,2})分/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')} ${h.padStart(2, '0')}:${mi.padStart(2, '0')}:00`;
}

function parseQualSection(plain) {
  // 「3.投标人资格要求」到「4.招标文件的获取」之间的段
  const m = plain.match(/3\.\s*投标人资格要求([\s\S]{0,3000}?)\s*4\.\s*招标文件/);
  return m ? m[1].trim() : null;
}

function inferScopeFn(record) {
  // 东风车厂的公告标题已明确表达业务类型（装修/设备/采购/系统），
  // 而正文里「监理」「设计」是作为其它角色名（招标人/监理人/项目经理）出现，干扰强；
  // 因此只用标题做匹配。
  const text = record.title || '';
  for (const rule of DONGFENG_SCOPE_RULES) {
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
  const tenderFromBody = rgx(plain, /招标人[：:]\s*([^\s（(|｜，,。]{2,40})/);
  const agencyFromBody = rgx(plain, /招标代理机构[：:]\s*([^\s（(|｜，,。]{2,40})/);
  const item = {
    _raw: record,
    id: record.id,
    title: t,
    projectCode: record.projectCode,
    noticeType: record.noticeType,
    detailUrl: record.detailUrl,
    noticeStartDate: record.noticeStartDate,
    noticeEndDate: record.noticeEndDate,
    district: null,
    tenderCorp: tenderFromBody || record.tenderCorpListing || null,
    agencyCorp: agencyFromBody || null,
    bidSubmitDeadline: parseBidSubmitDeadline(plain) || record.bidSubmitDeadline,
    requirement: parseQualSection(plain),
  };
  item.scopeTags = inferScopeFn(record);
  item.businessMatch = inferBusinessMatch(item.scopeTags);
  item.projectProgress = inferProgress(item);
  return item;
}

async function run({ pageCount = 1, pageSize = 10, outputFile = null, timeRange = null } = {}) {
  const pagesToFetch = Math.min(pageCount, MAX_SSR_PAGES);
  console.log(`开始爬取 东风汽车 (dongfeng): ${pagesToFetch} 页 × ${pageSize} 条 (SSR 上限 ${MAX_SSR_PAGES} 页)`);

  const seen = new Set();
  const filtered = [];
  let stopReason = 'max_pages';

  for (let p = 1; p <= pagesToFetch; p++) {
    let listItems;
    try {
      listItems = await fetchListPage(p);
    } catch (e) {
      console.error(`  ✗ 列表第 ${p} 页失败: ${e.message}`);
      stopReason = 'list_error';
      break;
    }
    if (listItems.length === 0) {
      console.log(`  第 ${p} 页空，停止`);
      stopReason = 'empty_page';
      break;
    }
    console.log(`  [p${p}] 拿到 ${listItems.length} 条`);

    let pageShouldStop = false;
    for (const it of listItems) {
      if (!it.id || seen.has(it.id)) continue;
      seen.add(it.id);
      if (timeRange?.from && it.noticeStartDate) {
        const pub = new Date(it.noticeStartDate.replace(' ', 'T'));
        if (!isNaN(pub.getTime()) && pub < timeRange.from) {
          console.log(`  [time-window] ${it.id} 早于 dateBegin，停止分页`);
          stopReason = 'time_window_passed';
          pageShouldStop = true;
          break;
        }
      }
      filtered.push(it);
    }
    if (pageShouldStop) break;
    if (listItems.length < pageSize) {
      stopReason = 'last_page';
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n[东风汽车] 列表过滤后 ${filtered.length} 条，开始拉详情`);

  const items = [];
  for (const r of filtered) {
    try {
      const detail = await fetchDetail(r);
      const item = mapToNotion(detail);
      items.push(item);
      console.log(`  ✓ ${(item.title || '').slice(0, 50)} | ${item.projectProgress ?? '?'} | ${item.businessMatch}`);
      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (e) {
      console.error(`  ✗ ${(r.title || '').slice(0, 50)}: ${e.message}`);
    }
  }

  if (outputFile) {
    const out = path.join(__dirname, '../data', outputFile);
    fs.writeFileSync(out, JSON.stringify(items, null, 2), 'utf-8');
    console.log(`已保存 ${items.length} 条到 ${out}`);
  }

  console.log(`\n[东风汽车] 停止原因: ${stopReason}, 命中 ${items.length} 条`);
  return { items, stopReason };
}

module.exports = {
  meta: {
    name: '东风汽车采购招投标交易平台',
    homepage: 'https://etp.dfmc.com.cn',
    sourcePageId: SOURCE_PAGES.dongfeng,
    scriptId: 'dongfeng',
  },
  run,
  mapToNotion,
  inferScope: inferScopeFn,
  inferBusinessMatch,
  inferProgress,
  writeFeedbackLogs: () => ({ scopeIds: [], qualIds: [] }),
};

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 10, outputFile: 'dongfeng_test.json' })
    .then(() => process.exit(0))
    .catch(e => { console.error('失败:', e); process.exit(1); });
}
