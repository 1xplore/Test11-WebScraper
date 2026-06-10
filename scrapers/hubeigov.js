/**
 * 湖北省政府采购网 爬虫
 *
 * 站点: https://www.ccgp-hubei.gov.cn/ (纯静态 HTML，无 API)
 * 列表: GET /notice/cggg/pzbgg/index_{N}.html       — 采购公告频道
 * 详情: GET <相对 href，来自列表 a@href>
 *
 * 与其他站点的关键差异：
 *   - 列表是 HTML，每页 15 条；用 cheerio 解析 ul.news-list-content > li
 *   - 不支持 startDate/endDate URL 参数（supportsTimeFilter: false）
 *     时间窗依赖 平台 loop 内的 fbTime 比较 + watermark
 *   - 全省公告全量抓取；标题含"武汉"或区名时 district 优先显示该区，否则 '湖北省'
 *   - 详情正文在 .art_con 下；第一个子 div 是 meta 行（发布日期/单位/截止）
 *     剩余 children 是正文；按 parseHtmlContent 的纯文本正则提取字段
 */
const cheerio = require('cheerio');
const { createPlatform, extractDistrict } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'https://www.ccgp-hubei.gov.cn';
const CHANNEL = 'pzbgg'; // 采购公告（招标/磋商/谈判/竞争性磋商混合频道）
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://www.ccgp-hubei.gov.cn/'
};

const HUBEIGOV_SCOPE_RULES = [
  { regex: /EPC|设计施工总承包|设计采购施工|交钥匙/, tag: 'EPC', stopOnMatch: true },
  { regex: /设备采购|器械采购/, tag: '设备采购', stopOnMatch: true },
  { regex: /材料采购/, tag: '材料采购', stopOnMatch: true },
  { regex: /货物采购/, tag: '货物采购', stopOnMatch: true },
  { regex: /运维服务/, tag: '运维服务', stopOnMatch: true },
  { regex: /运维/, tag: '运维', stopOnMatch: true },
  { regex: /环卫/, tag: '环卫', stopOnMatch: true },
  { regex: /养护/, tag: '养护', stopOnMatch: true },
  { regex: /物业(?!服务)/, tag: '物业', stopOnMatch: true },
  { regex: /物业服务/, tag: '物业服务', stopOnMatch: true },
  { regex: /餐饮外包/, tag: '餐饮外包', stopOnMatch: true },
  { regex: /安保/, tag: '安保', stopOnMatch: true },
  { regex: /保洁/, tag: '保洁', stopOnMatch: true },
  { regex: /管护/, tag: '管护', stopOnMatch: true },
  { regex: /清淤/, tag: '清淤', stopOnMatch: true },
  { regex: /软件开发|系统集成/, tag: '软件开发', stopOnMatch: true },
  { regex: /信息化|智慧社区|智慧城市/, tag: '信息化服务', stopOnMatch: true },
  { regex: /污染调查|环境调查/, tag: '环境调查', stopOnMatch: true },
  { regex: /安全评估/, tag: '安全评估', stopOnMatch: true },
  { regex: /工程设计|设计服务|勘察设计|建筑设计/, tag: '建筑设计', stopOnMatch: true },
  { regex: /工程监理|建设监理|监理(?!服务)/, tag: '工程监理', stopOnMatch: true },
  { regex: /造价咨询|预算编制|造价预算/, tag: '造价预算', stopOnMatch: true },
  { regex: /工程项目管理|建设项目管理/, tag: '工程项目管理', stopOnMatch: true },
  { regex: /结算审核|结算审计|审计服务/, tag: '结算审计', stopOnMatch: true },
  { regex: /决算审核|决算审计/, tag: '决算审计', stopOnMatch: true },
  { regex: /全过程造价|造价跟踪|跟踪造价/, tag: '造价跟踪', stopOnMatch: true },
  { regex: /工程勘察|岩土勘察|地质勘查/, tag: '工程勘查', stopOnMatch: true },
  { regex: /全过程工程咨询/, tag: '全过程工程咨询', stopOnMatch: true },
];

function parseList(html) {
  const $ = cheerio.load(html);
  const raw = [];
  $('ul.news-list-content > li').each((_, el) => {
    const $li = $(el);
    const $a = $li.find('a').first();
    const href = ($a.attr('href') || '').trim();
    if (!href) return;
    const $font = $a.find('font').first();
    const noticeType = $font.text().replace(/[\[\]【】]/g, '').trim() || null;
    const titleFull = $a.text().trim();
    const title = titleFull.replace(/^\[[^\]]+\]\s*/, '').trim();
    const fbDate = ($li.find('span').last().text() || '').trim();
    // 列表只给日期；补成当日 23:59 以避免 platform.js 的时间窗误把"今天发布"判为过期
    const fbTime = /^\d{4}-\d{2}-\d{2}$/.test(fbDate) ? `${fbDate} 23:59` : fbDate;
    raw.push({ uuid: href, title, fbTime, noticeType, detailUrl: BASE + href });
  });
  const records = raw;
  const totalMatch = html.match(/(\d+)\s*条记录/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : raw.length;
  return { total, records, actualPageSize: raw.length };
}

function parseDetail(html, listRecord) {
  const $ = cheerio.load(html);
  const ac = $('.art_con');
  if (ac.length === 0) throw new Error('详情页缺少 .art_con 容器');
  const metaDiv = ac.children().first();
  const metaText = metaDiv.text().replace(/\s+/g, ' ').trim();
  metaDiv.remove();
  // cheerio.text() 解码 &nbsp; 等实体；platform 默认 plainText 走 regex 剥标签，残留实体不可靠
  const plainBodyText = ac.text().replace(/\s+/g, ' ').trim();
  const content = ac.html() || '';
  return { ...listRecord, content, metaText, plainBodyText };
}

function rgx(text, pattern, fallback = null) {
  const m = text.match(pattern);
  return m ? m[1].trim() : fallback;
}

function parseBudget(text, label) {
  // 兼容："预算金额： 90.0 (万元)" / "预算金额（万元）：90.0"
  const m = text.match(new RegExp(`${label}[（(]\\s*万元\\s*[）)][：:]\\s*([0-9.]+)`))
    || text.match(new RegExp(`${label}[：:]\\s*([0-9.]+)\\s*[（(]\\s*万元`));
  return m ? parseFloat(m[1]) : null;
}

function parseDeadlineCN(text) {
  // 优先匹配正文 "并于 YYYY年MM月DD日HH点MM分..前提交"
  let m = text.match(/(?:并于|于)\s*(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}[点時时:]\s*\d{1,2}分?)[\s\S]{0,20}前(?:提交|递交)/);
  // 退回到通用"递交/提交截止时间："格式
  if (!m) m = text.match(/(?:递交|提交)[^：:]{0,12}?截止时间[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}[点時时:]\s*\d{1,2}分?)/);
  // 最次：仅日期（来自 meta "文件递交截止时间：YYYY-MM-DD"）
  if (!m) m = text.match(/文件递交截止时间[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2})/);
  if (!m) return null;
  return m[1]
    .replace(/年(\d{1,2})月(\d{1,2})日/, (_, mo, d) => `-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
    .replace(/(\d{1,2})[点時时:]\s*(\d{1,2})分?/, (_, h, min) => ` ${h.padStart(2, '0')}:${min}`);
}

module.exports = createPlatform({
  meta: {
    name: '湖北省政府采购网',
    homepage: 'https://www.ccgp-hubei.gov.cn/',
    sourcePageId: SOURCE_PAGES.hubeigov,
    scriptId: 'hubei_gov'
  },
  http: {
    base: BASE,
    list: {
      method: 'GET',
      path: page => `/notice/cggg/${CHANNEL}/index_${page}.html`,
      headers: HEADERS,
      unwrap: parseList,
      idKey: 'uuid',
      supportsTimeFilter: false
    },
    detail: {
      method: 'GET',
      path: id => id, // id 就是相对路径 /notice/YYYYMM/notice_xxx.html
      headers: HEADERS,
      unwrap: parseDetail
    }
  },
  fields: {
    id: r => r.uuid,
    title: r => r.title,
    projectCode: r => rgx(r.plainBodyText, /项目编号[：:]\s*([0-9A-Za-z][-0-9A-Za-z]{4,60})/),
    noticeType: r => r.noticeType,
    detailUrl: r => r.detailUrl,
    noticeStartDate: r => (r.fbTime || '').slice(0, 10) || null,
    noticeEndDate: () => null,
    district: r => extractDistrict(r.title) || (/武汉/.test(r.title) ? '武汉市' : '湖北省'),
    tenderCorp: r => rgx(r.plainBodyText, /采购人信息[\s\S]{0,80}?名\s*称[：:]\s*([^\s（(]{2,40})/)
      || rgx(r.plainBodyText, /采购人[：:]\s*([^\s（(|｜]{2,40})/),
    agencyCorp: r => rgx(r.plainBodyText, /采购代理机构信息[\s\S]{0,80}?名\s*称[：:]\s*([^\s（(]{2,40})/)
      || rgx(r.plainBodyText, /(?:采购代理机构|发布单位)[：:]\s*([^\s（(|｜]{2,40})/),
    contractPrice: r => parseBudget(r.plainBodyText, '预算金额'),
    offerPrice: r => parseBudget(r.plainBodyText, '最高限价'),
    bidSubmitDeadline: r => parseDeadlineCN(r.plainBodyText),
    publicityDate: () => null,
    resultDate: () => null,
    description: () => null,
    requirement: (r, p, q) => (q && q.length > 0) ? q.map(x => x.raw).join('\n') : null,
    noteNumber: r => rgx(r.plainBodyText, /采购计划备案号[：:]\s*([0-9A-Za-z-]+)/),
    tenderBond: () => null,
    tenderLinkMan: r => rgx(r.plainBodyText, /项目联系人[：:]\s*([^\s|｜]{2,30})/),
    tenderLinkPhone: r => rgx(r.plainBodyText, /项目联系方式[\s\S]{0,30}?电\s*话[：:]\s*([0-9]{3,4}-[0-9]{7,8}|1[0-9]{10})/)
      || rgx(r.plainBodyText, /采购人信息[\s\S]{0,150}?联系方式[：:]\s*([0-9]{3,4}-[0-9]{7,8}|1[0-9]{10})/),
    agencyLinkPhone: r => rgx(r.plainBodyText, /采购代理机构信息[\s\S]{0,150}?联系方式[：:]\s*([0-9]{3,4}-[0-9]{7,8}|1[0-9]{10})/)
  },
  parseHtml: { useContent: true, stockWay: null },
  inferScopeRules: HUBEIGOV_SCOPE_RULES,
  detailDelayMs: 500
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 15, outputFile: 'hubeigov_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
