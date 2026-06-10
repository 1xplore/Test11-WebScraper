/**
 * 武汉市政府采购电子交易系统 爬虫
 *
 * 站点: https://www.whzfcgxt.cn/ (Vue SPA + czy-busi 后端 API)
 * 列表: POST /czy-busi/projectNoticeInfoEntity/editQueryMore  (JSON body)
 * 详情: GET  /czy-busi/projectNoticeInfoEntity/editQueryByIdNew?uuid={uuid}
 *
 * 列表 body 形态: { zoneId: "420100", info: 0, page, pageSize, startDate?, endDate? }
 *   - zoneId 是武汉市行政区划码（必填）
 *   - info=0 招标（采购）公告；省略 cgxs 即可同时覆盖集中(01)+分散(02)采购
 *   - startDate/endDate 后端支持，因此 supportsTimeFilter: true
 *
 * 响应嵌套: body.data.data.{total,list}（双层 data）
 * 详情响应: body.data.data[0]（数组裹一层）
 *
 * 本文件只声明本站差异点；共享业务规则、错误日志、run 主循环见 scrapers/platform.js。
 */
const { createPlatform, extractDistrict } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'https://www.whzfcgxt.cn';
const ZONE_ID = '420100';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/json',
  'Referer': 'https://www.whzfcgxt.cn/'
};

const WHZFCGXT_SCOPE_RULES = [
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

function isoDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

module.exports = createPlatform({
  meta: {
    name: '武汉市政府采购电子交易系统',
    homepage: 'https://www.whzfcgxt.cn/',
    sourcePageId: SOURCE_PAGES.whzfcgxt,
    scriptId: 'wuhan_gov'
  },
  http: {
    base: BASE,
    list: {
      method: 'POST',
      path: '/czy-busi/projectNoticeInfoEntity/editQueryMore',
      bodyType: 'json',
      body: (page, size, timeRange) => {
        const b = { zoneId: ZONE_ID, info: 0, page, pageSize: size };
        if (timeRange?.from) b.startDate = isoDate(timeRange.from);
        if (timeRange?.to) b.endDate = isoDate(timeRange.to);
        return b;
      },
      headers: HEADERS,
      unwrap: r => {
        const inner = r?.body?.data?.data;
        if (!inner) return { total: 0, records: [] };
        return { total: parseInt(inner.total, 10) || 0, records: inner.list || [] };
      },
      idKey: 'uuid',
      supportsTimeFilter: true
    },
    detail: {
      method: 'GET',
      path: '/czy-busi/projectNoticeInfoEntity/editQueryByIdNew',
      query: uuid => ({ uuid }),
      headers: HEADERS,
      unwrap: (r, listRecord) => {
        const arr = r?.body?.data?.data;
        const d = Array.isArray(arr) ? arr[0] : arr;
        if (!d) throw new Error('详情 API 返回异常');
        return { ...d, uuid: listRecord.uuid, status: listRecord.status, signupEnd: listRecord.signupEnd };
      }
    }
  },
  fields: {
    id: r => r.uuid,
    title: r => r.titleName,
    projectCode: (r, p) => p.noteNumber || null,
    noticeType: (r, p) => p.noticeType || null,
    detailUrl: r => `https://www.whzfcgxt.cn/infoDetail?uuid=${r.uuid}&type=6`,
    noticeStartDate: r => (r.fbTime || '').slice(0, 10) || null,
    noticeEndDate: r => r.signupEnd ? r.signupEnd.slice(0, 10) : null,
    district: r => extractDistrict(r.titleName) || '武汉市',
    tenderCorp: (r, p) => p.tenderCorp || null,
    agencyCorp: (r, p) => p.agencyCorp || null,
    contractPrice: (r, p) => p.contractPrice || null,
    description: () => null,
    bidSubmitDeadline: (r, p) => p.bidSubmitDeadline || r.signupEnd || null,
    publicityDate: () => null,
    resultDate: () => null,
    offerPrice: (r, p) => p.offerPrice || null,
    tenderBond: () => null,
    requirement: (r, p, qual) => (qual && qual.length > 0) ? qual.map(q => q.raw).join('\n') : null,
    noteNumber: (r, p) => p.noteNumber || null,
    tenderLinkPhone: (r, p) => p.tenderPhone || null,
    tenderLinkMan: (r, p) => p.projectContact || null,
    agencyLinkPhone: (r, p) => p.agencyPhone || null
  },
  parseHtml: { useContent: true, stockWay: null },
  inferScopeRules: WHZFCGXT_SCOPE_RULES,
  detailDelayMs: 400
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'whzfcgxt_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
