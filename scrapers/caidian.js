/**
 * 蔡甸区政府采购中心 爬虫
 *
 * 站点: http://121.40.254.19/caidian (Angular + LayUI 后端 API)
 * 列表: POST /announce/editQueryMore?type=1&info=0&pageNo=N&pageSize=10&timeStamp=9s8K7_98L7m87-89k
 * 详情: POST /announce/editQueryById?uuid={uuid}
 *
 * 与东西湖区形态高度相似，差异点：
 *   - 路径前缀 /caidian（非 /dxh）
 *   - 列表查询参数多了 info 和 timeStamp
 *   - list/detail unwrap 直接读 r.data (不要求 success 标志)
 *
 * HTML 正文解析复用 utils/parseHtmlContent。
 */
const { createPlatform, extractDistrict } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'http://121.40.254.19/caidian';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer': 'http://121.40.254.19/caidian/views/announce/home.html'
};

// 内置 scope 兜底规则（Notion 不可达时使用）
const CAIDIAN_SCOPE_RULES = [
  { regex: /EPC|设计施工总承包|设计采购施工|交钥匙/, tag: 'EPC', stopOnMatch: true },
  { regex: /设备采购|器械采购/, tag: '设备采购', stopOnMatch: true },
  { regex: /材料采购/, tag: '材料采购', stopOnMatch: true },
  { regex: /货物采购/, tag: '货物采购', stopOnMatch: true },
  { regex: /工程监理|建设监理|监理(?!服务)/, tag: '工程监理', stopOnMatch: true },
  { regex: /工程设计|设计服务|勘察设计|建筑设计|国土空间规划|空间规划|城乡规划/, tag: '建筑设计', stopOnMatch: true },
  { regex: /造价咨询|预算编制|造价预算/, tag: '造价预算', stopOnMatch: true },
  { regex: /全过程工程咨询/, tag: '全过程工程咨询', stopOnMatch: true },
  { regex: /工程项目管理|建设项目管理/, tag: '工程项目管理', stopOnMatch: true },
  { regex: /结算审核|结算审计|审计服务/, tag: '结算审计', stopOnMatch: true },
  { regex: /决算审核|决算审计/, tag: '决算审计', stopOnMatch: true },
  { regex: /工程勘察|岩土勘察|地质勘查/, tag: '工程勘查', stopOnMatch: true },
  { regex: /资产评估/, tag: '资产评估', stopOnMatch: true },
  { regex: /测绘(?!服务)/, tag: '测绘服务', stopOnMatch: true },
  { regex: /物业服务/, tag: '物业服务', stopOnMatch: true },
];

module.exports = createPlatform({
  meta: {
    name: '蔡甸区政府采购中心',
    homepage: 'http://121.40.254.19/caidian/views/announce/home.html',
    sourcePageId: SOURCE_PAGES.caidian,
    scriptId: 'wuhan_caidian_district'
  },
  http: {
    base: BASE,
    list: {
      method: 'POST',
      path: '/announce/editQueryMore',
      query: (page, size) => ({
        type: '1', info: '0', pageNo: page, pageSize: size,
        timeStamp: '9s8K7_98L7m87-89k'
      }),
      headers: HEADERS,
      unwrap: r => ({ total: r.data?.count || 0, records: r.data?.list || [] }),
      idKey: 'uuid'
    },
    detail: {
      method: 'POST',
      path: '/announce/editQueryById',
      query: uuid => ({ uuid }),
      headers: HEADERS,
      unwrap: r => {
        const d = r.data;
        if (Array.isArray(d)) {
          if (!d[0]) throw new Error('详情 API 返回空数组');
          return d[0];
        }
        if (!d) throw new Error('详情 API 返回异常');
        return d;
      }
    }
  },
  fields: {
    id: r => r.uuid,
    title: r => r.titleName,
    projectCode: r => r.xmNo || null,
    noticeType: (r, p) => p.noticeType || null,
    detailUrl: r => `http://121.40.254.19/caidian/views/announce/announce_info.html?uuid=${r.uuid}&type=1`,
    noticeStartDate: r => r.startDate || r.fbTime || null,
    noticeEndDate: r => r.endDate || null,
    district: r => extractDistrict(r.titleName) || '蔡甸区',
    tenderCorp: (r, p) => p.tenderCorp || null,
    agencyCorp: (r, p) => p.agencyCorp || null,
    contractPrice: (r, p) => p.contractPrice || null,
    description: r => r.noticModel || null,
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
  parseHtml: { useContent: true, stockWay: r => r.stockWay },
  inferScopeRules: CAIDIAN_SCOPE_RULES,
  detailDelayMs: 300
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'caidian_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
