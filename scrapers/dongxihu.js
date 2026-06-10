/**
 * 东西湖区政府采购电子交易系统 爬虫
 *
 * 站点: http://zfcg.dxh.gov.cn:9090/dxh (Angular + LayUI 后端 API)
 * 列表: POST /announce/editQueryMore?type=1&pageNo=N&pageSize=10
 * 详情: POST /announce/editQueryById?uuid={uuid}
 *
 * 本文件只声明本站差异点（HTTP 形态 + 字段映射 + 解析开关 + scope 兜底规则）。
 * 共享业务规则、错误日志、run 主循环见 scrapers/platform.js。
 */
const { createPlatform, extractDistrict } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'http://zfcg.dxh.gov.cn:9090/dxh';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer': 'http://zfcg.dxh.gov.cn:9090/dxh/views/announce/home.html'
};

// 内置 scope 兜底规则（Notion 不可达时使用）
const DONGXIHU_SCOPE_RULES = [
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

module.exports = createPlatform({
  meta: {
    name: '东西湖区政府采购电子交易系统',
    homepage: 'http://zfcg.dxh.gov.cn:9090/dxh/views/announce/home.html',
    sourcePageId: SOURCE_PAGES.dongxihu,
    scriptId: 'wuhan_dongxihu_district'
  },
  http: {
    base: BASE,
    list: {
      method: 'POST',
      path: '/announce/editQueryMore',
      query: (page, size) => ({ type: '1', pageNo: page, pageSize: size }),
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
        if (!d) throw new Error('详情 API 返回异常');
        return Array.isArray(d) ? (d[0] || (() => { throw new Error('详情 API 返回异常'); })()) : d;
      }
    }
  },
  fields: {
    id: r => r.uuid,
    title: r => r.titleName,
    projectCode: r => r.xmNo,
    noticeType: (r, p) => p.noticeType || null,
    detailUrl: r => `http://zfcg.dxh.gov.cn:9090/dxh/views/announce/announce_info.html?uuid=${r.uuid}&type=1`,
    noticeStartDate: r => r.startDate,
    noticeEndDate: r => r.endDate,
    district: r => extractDistrict(r.titleName) || '东西湖区',
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
  inferScopeRules: DONGXIHU_SCOPE_RULES,
  detailDelayMs: 300
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'dongxihu_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
