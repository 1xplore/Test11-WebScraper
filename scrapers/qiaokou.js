/**
 * 硚口区政府采购交易系统 爬虫
 *
 * 站点: http://47.111.115.168:10007 (czy-portal-web, Vue SPA)
 * tenantCode: 584900880369491968
 */
const { createPlatform } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'http://47.111.115.168:10007';
const TENANT_CODE = '584900880369491968';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'http://47.111.115.168:10007/'
};

const QIAOKOU_SCOPE_RULES = [
  { regex: /EPC|设计施工总承包|设计采购施工|交钥匙/, tag: 'EPC', stopOnMatch: true },
  { regex: /设备采购|器械采购/, tag: '设备采购', stopOnMatch: true },
  { regex: /材料采购/, tag: '材料采购', stopOnMatch: true },
  { regex: /货物采购/, tag: '货物采购', stopOnMatch: true },
  { regex: /工程监理|建设监理|监理(?!服务)/, tag: '工程监理', stopOnMatch: true },
  { regex: /工程设计|设计服务|勘察设计|建筑设计/, tag: '建筑设计', stopOnMatch: true },
  { regex: /造价咨询|预算编制|造价预算/, tag: '造价预算', stopOnMatch: true },
  { regex: /全过程工程咨询/, tag: '全过程工程咨询', stopOnMatch: true },
  { regex: /工程项目管理|建设项目管理/, tag: '工程项目管理', stopOnMatch: true },
  { regex: /结算审核|结算审计|审计服务/, tag: '结算审计', stopOnMatch: true },
  { regex: /决算审核|决算审计/, tag: '决算审计', stopOnMatch: true },
  { regex: /工程勘察|岩土勘察|地质勘查/, tag: '工程勘查', stopOnMatch: true },
];

function mergeListIntoDetail(detail, listRecord) {
  if (!listRecord) return detail;
  detail.uuid = detail.uuid || listRecord.uuid;
  detail.fbTime = detail.fbTime || listRecord.fbTime;
  detail.titleName = detail.titleName || listRecord.titleName;
  return detail;
}

module.exports = createPlatform({
  meta: {
    name: '硚口区政府采购交易系统',
    homepage: 'http://47.111.115.168:10007/#/remoteList',
    sourcePageId: SOURCE_PAGES.qiaokou,
    scriptId: 'wuhan_qiaokou_district'
  },
  http: {
    base: BASE,
    list: {
      method: 'GET',
      path: '/czy-portal/content/indexAnnouncementMore',
      query: (page, size, tr) => ({
        page, pageSize: size, info: '0', tenantCode: TENANT_CODE,
        articleName: '', planId: '', cgrName: '', itemName: '',
        stockWay: '',
        startDate: tr?.from ? tr.from.toISOString().slice(0, 10) : '',
        endDate:   tr?.to   ? tr.to.toISOString().slice(0, 10)   : ''
      }),
      headers: HEADERS,
      unwrap: r => {
        const body = r.body;
        if (!body?.success) throw new Error(`列表 API 返回错误: ${body?.msg || r.head?.msg}`);
        return { total: body.data?.total || 0, records: body.data?.list || [] };
      },
      idKey: 'uuid',
      supportsTimeFilter: true
    },
    detail: {
      method: 'GET',
      path: '/czy-portal/content/indexAnnouncementDetail',
      query: uuid => ({ uuid, tenantCode: TENANT_CODE }),
      headers: HEADERS,
      unwrap: (res, listRecord) => {
        const body = res.body;
        if (!body?.success) throw new Error(`详情 API 返回错误: ${body?.msg || res.head?.msg}`);
        const dl = body.data?.dataList;
        if (!Array.isArray(dl) || !dl[0]) throw new Error('详情 API dataList 为空');
        return mergeListIntoDetail(dl[0], listRecord);
      }
    }
  },
  fields: {
    id: r => r.uuid,
    title: r => r.titleName,
    projectCode: (r, p) => p.noteNumber || null,
    noticeType: (r, p) => p.noticeType || null,
    detailUrl: r => `http://47.111.115.168:10007/#/infoDetail?id=${r.uuid}&type=remote`,
    noticeStartDate: r => r.fbTime || null,
    noticeEndDate: (r, p) => p.bidSubmitDeadline || null,
    district: () => '硚口区',
    tenderCorp: (r, p) => p.tenderCorp || null,
    agencyCorp: (r, p) => p.agencyCorp || null,
    contractPrice: (r, p) => p.contractPrice || null,
    description: () => null,
    bidSubmitDeadline: (r, p) => p.bidSubmitDeadline || null,
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
  inferScopeRules: QIAOKOU_SCOPE_RULES,
  detailDelayMs: 300
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'qiaokou_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
