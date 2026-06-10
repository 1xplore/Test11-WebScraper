/**
 * 武汉市公共资源交易中心 招标公告爬虫
 *
 * 站点: https://www.whzbtbxt.cn/whebd/ (Vue SPA + 后端 API)
 * 列表: POST /whebd-server/cmsHomePage/tendererNoticeList (form-encoded)
 * 详情: POST /whebd-server/cmsHomePage/tendererNoticeDetail (form-encoded)
 *
 * 与 dongxihu/huangpi 的关键差异：
 *   - 无 HTML 正文，所有字段来自 API（结构化 JSON）
 *   - inferScope 走结构化字段（tenderClassNumName / certTypeNumName），不是 regex
 *   - 资质来自 requirmentList[]，自定义 parseRequirements 解析
 *   - 详情 URL 需要 id + registrationId 双参
 */
const { createPlatform, extractDistrict } = require('./platform');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const BASE = 'https://www.whzbtbxt.cn/whebd-server';
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.whzbtbxt.cn/whebd/'
};

/**
 * 结构化驱动的 scope 推断（不依赖 regex 规则集）
 * - tenderClassNumName 决定大类（EPC / 货物 / 施工 / 服务）
 * - 资质清单 certTypeNumName 决定具体服务类型
 */
function inferScopeWhzbtbxt(record, demandKeywords, dynamicRules) {
  const m = record.model || {};
  const className = m.tenderClassNumName || '';
  const contentName = m.tenderContentName || '';
  const title = m.tenderPrjName || '';
  const tags = new Set();

  if (
    className.includes('总承包') ||
    contentName.includes('设计采购施工') ||
    contentName.includes('设计施工总承包') ||
    contentName.includes('交钥匙') ||
    /EPC/i.test(contentName) ||
    /EPC/i.test(title) ||
    /设计施工总承包/.test(title)
  ) {
    tags.add('EPC');
    return ['EPC'];
  }

  if (className.includes('货物') || contentName.includes('设备')) {
    tags.add('设备采购');
    return ['设备采购'];
  }

  if (className.includes('施工') && !className.includes('服务')) {
    tags.add('施工');
    return ['施工'];
  }

  if (className.includes('服务') || contentName.includes('服务')) {
    const rl = record.requirmentList || [];
    for (const r of rl) {
      const cert = r.certTypeNumName || '';
      if (cert.includes('设计')) tags.add('工程设计');
      else if (cert.includes('监理')) tags.add('工程监理');
      else if (cert.includes('勘察')) tags.add('工程勘察');
      else if (cert.includes('造价')) tags.add('造价咨询');
      else if (cert.includes('代理')) tags.add('招标代理');
      else if (cert.includes('检测') || cert.includes('监测')) tags.add('检测');
      else if (cert) tags.add('咨询服务');
    }
    if (contentName.includes('全过程') && contentName.includes('咨询')) tags.add('全过程工程咨询');
    if (contentName.includes('咨询') && !tags.size) tags.add('咨询服务');
  }

  return tags.size ? [...tags] : ['其他'];
}

/**
 * 解析 requirmentList 为 "类型 | 级别 | 行业 | 专业" 格式的文本
 */
function parseRequirementsText(requirmentList) {
  const lines = [];
  for (const r of (requirmentList || [])) {
    const type = r.certTypeNumName;
    const level = r.certTypeLevelName;
    const trade = r.tradeLargeClassName;
    const cat = r.tradeCategoryCodeName;
    const parts = [type, level, trade, cat].filter(p => p && p !== '无');
    if (parts.length) lines.push(parts.join(' | '));
  }
  return lines.length ? lines.join('\n') : null;
}

function buildDetailUrl(id, registrationId) {
  return `https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=${id}&registrationId=${registrationId}&type=details&path=tendererNotice`;
}

module.exports = createPlatform({
  meta: {
    name: '武汉市公共资源交易平台招投标系统',
    homepage: 'https://www.whzbtbxt.cn/',
    sourcePageId: SOURCE_PAGES.whzbtbxt,
    scriptId: 'wuhan_public'
  },
  http: {
    base: BASE,
    list: {
      method: 'POST',
      path: '/cmsHomePage/tendererNoticeList',
      body: (page, size, tr) => ({
        t: String(Date.now()),
        tenderPrjName: '',
        evaluationMethod: '',
        prjbuildCorpName: '',
        regulators: '',
        noticeStartDate: tr?.from ? tr.from.toISOString().slice(0, 10) : '',
        noticeEndDate: tr?.to ? tr.to.toISOString().slice(0, 10) : '',
        bmFlag: '',
        prequalificationType: '',
        registrationId: '',
        current: String(page),
        size: String(size)
      }),
      headers: HEADERS,
      unwrap: r => {
        if (!r.result) throw new Error(`列表 API 返回错误: ${r.msg}`);
        return r.data;
      },
      idKey: 'id',
      supportsTimeFilter: true
    },
    detail: {
      method: 'POST',
      path: '/cmsHomePage/tendererNoticeDetail',
      body: id => ({ t: String(Date.now()), id }),
      headers: HEADERS,
      unwrap: r => {
        if (!r.result) throw new Error(`详情 API 返回错误: ${r.msg}`);
        return r.data;
      }
    }
  },
  fields: {
    id: r => r.model?.id,
    title: r => r.model?.tenderPrjName,
    projectCode: r => r.model?.constructionNo,
    noticeType: r => r.model?.tenderTypeNumName,
    detailUrl: r => buildDetailUrl(r.model?.id, r.model?.registrationId),
    noticeStartDate: r => r.model?.noticeStartDate,
    noticeEndDate: r => r.model?.noticeEndDate,
    district: r => extractDistrict(r.model?.prjAddress),
    tenderCorp: r => r.model?.prjbuildCorpName,
    agencyCorp: r => r.model?.agencyCorpName,
    description: r => r.model?.tenderContentDescription,
    contractPrice: r => r.model?.allInvest,
    bidSubmitDeadline: r => r.model?.bidDocumentSubmitEndDate,
    publicityDate: r => r.model?.publicityStartDate,
    resultDate: r => r.model?.resultNotificationDate,
    offerPrice: r => r.model?.offerPrice,
    tenderBond: r => r.model?.tenderBond,
    noteNumber: r => r.model?.noteNumber,
    requirement: r => parseRequirementsText(r.requirmentList),
    // whzbtbxt 特有字段（buildPageProperties 已知，不上传则忽略）
    registrationId: r => r.model?.registrationId,
    plannedTenderTime: r => r.biddingPlanList?.[0]?.noticeReleaseTime,
    tenderLinkMan: r => r.model?.tenderLinkMan,
    tenderLinkPhone: r => r.model?.tenderLinkPhone,
    agencyLinkMan: r => r.model?.agencyLinkMan,
    agencyLinkPhone: r => r.model?.agencyLinkPhone,
    address: r => r.model?.prjAddress,
    totalInvestment: r => r.model?.totalInvestment,
    plannedPeriod: r => r.model?.plannedPeriod,
    supervisionDept: r => r.model?.regulatorsName,
    supervisionDeptTel: r => r.model?.supervisionDeptTel,
    prequalificationType: r => r.model?.prequalificationTypeName,
    evaluationMethod: r => r.model?.prequalificationMethodName
  },
  parseHtml: { useContent: false },
  inferScope: inferScopeWhzbtbxt,
  detailDelayMs: 300
});

if (require.main === module) {
  module.exports.run({ pageCount: 1, pageSize: 5, outputFile: 'whzbtbxt_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
