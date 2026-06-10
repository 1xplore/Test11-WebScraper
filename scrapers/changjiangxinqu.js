/**
 * 长江新区政府采购交易系统 爬虫
 *
 * 站点: http://47.111.115.168:10020 (czy-portal-web, Vue SPA)
 * 列表: GET /czy-portal/content/indexAnnouncementMore?page=N&pageSize=10&info=0&tenantCode=801666313322536960
 * 详情: GET /czy-portal/content/indexAnnouncementDetail?uuid=...&tenantCode=801666313322536960
 *
 * 与黄陂区同套 czy-portal 后端，差异点：
 *   - 端口 10020（黄陂 10013）
 *   - tenantCode 不同
 *   - 列表只返 uuid/titleName/fbTime，详情需合并 list 记录
 */
const { createPlatform } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'http://47.111.115.168:10020';
const TENANT_CODE = '801666313322536960';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'http://47.111.115.168:10020/'
};

const CJXQ_SCOPE_RULES = [
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
  { regex: /造价跟踪|跟踪造价|全过程造价/, tag: '造价跟踪', stopOnMatch: true },
  { regex: /成本审计|成本审/, tag: '成本审计', stopOnMatch: true },
  { regex: /法律服务|律师|法律咨询/, tag: '法律服务', stopOnMatch: true },
  { regex: /国土空间规划|空间规划|城乡规划|规划编制/, tag: '规划编制', stopOnMatch: true },
];

// 合并 list 记录进 detail（czy-portal 列表只返 3 字段）
function mergeListIntoDetail(detail, listRecord) {
  if (!listRecord) return detail;
  detail.uuid = detail.uuid || listRecord.uuid;
  detail.fbTime = detail.fbTime || listRecord.fbTime;
  detail.titleName = detail.titleName || listRecord.titleName;
  return detail;
}

module.exports = createPlatform({
  meta: {
    name: '长江新区政府采购交易系统',
    homepage: 'http://47.111.115.168:10020/#/remoteList',
    sourcePageId: SOURCE_PAGES.changjiangxinqu,
    scriptId: 'wuhan_changjiangxinqu_district'
  },
  http: {
    base: BASE,
    list: {
      method: 'GET',
      path: '/czy-portal/content/indexAnnouncementMore',
      query: (page, size) => ({
        page, pageSize: size, info: '0', tenantCode: TENANT_CODE,
        articleName: '', planId: '', cgrName: '', itemName: '',
        stockWay: '', startDate: '', endDate: ''
      }),
      headers: HEADERS,
      unwrap: r => {
        const body = r.body;
        if (!body?.success) throw new Error(`列表 API 返回错误: ${body?.msg || r.head?.msg}`);
        return { total: body.data?.total || 0, records: body.data?.list || [] };
      },
      idKey: 'uuid'
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
    detailUrl: r => `http://47.111.115.168:10020/#/infoDetail?id=${r.uuid}&type=remote`,
    noticeStartDate: r => r.fbTime || null,
    noticeEndDate: (r, p) => p.bidSubmitDeadline || null,
    district: () => '长江新区',
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
  inferScopeRules: CJXQ_SCOPE_RULES,
  detailDelayMs: 300
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'changjiangxinqu_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
