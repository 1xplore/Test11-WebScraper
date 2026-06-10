/**
 * 武汉新洲区政府采购交易系统 爬虫
 *
 * 站点: http://xzqjyzx.com/xinzhou (Angular + LayUI 后端 API)
 * 列表: POST /announce/editQueryMore?type=1&info=0&pageNo=N&pageSize=10
 * 详情: POST /announce/editQueryById?uuid={uuid}
 *
 * 与东西湖/蔡甸/经开区形态完全一致，差异点仅：
 *   - 路径前缀 /xinzhou
 *   - 域名 xzqjyzx.com
 *   - Referer 域名
 */
const { createPlatform, extractDistrict } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'http://xzqjyzx.com/xinzhou';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer': 'http://xzqjyzx.com/xinzhou/views/announce/home.html'
};

const XINZHOU_SCOPE_RULES = [
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
  { regex: /物业服务/, tag: '物业服务', stopOnMatch: true },
  { regex: /国土空间规划|空间规划|城乡规划|规划编制/, tag: '规划编制', stopOnMatch: true },
];

module.exports = createPlatform({
  meta: {
    name: '武汉新洲区政府采购交易系统',
    homepage: 'http://xzqjyzx.com/xinzhou/views/announce/home.html',
    sourcePageId: SOURCE_PAGES.xinzhou,
    scriptId: 'wuhan_xinzhou_district'
  },
  http: {
    base: BASE,
    list: {
      method: 'POST',
      path: '/announce/editQueryMore',
      query: (page, size) => ({ type: '1', info: '0', pageNo: page, pageSize: size }),
      headers: HEADERS,
      unwrap: r => ({ total: r.data?.count || 0, records: r.data?.list || [] }),
      idKey: 'uuid',
      supportsTimeFilter: false
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
    detailUrl: r => `http://xzqjyzx.com/xinzhou/views/announce/announce_info.html?uuid=${r.uuid}&type=1`,
    noticeStartDate: r => r.startDate || r.fbTime || null,
    noticeEndDate: r => r.endDate || null,
    district: r => extractDistrict(r.titleName) || '新洲区',
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
  inferScopeRules: XINZHOU_SCOPE_RULES,
  detailDelayMs: 300
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'xinzhou_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
