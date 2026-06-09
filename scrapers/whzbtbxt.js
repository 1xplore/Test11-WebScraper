/**
 * 武汉市公共资源交易中心 招标公告爬虫
 * 纯 axios 实现，调用站点后端 API
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { SOURCE_PAGES } = require('../config/notionDatabases');

const LIST_API = 'https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeList';
const DETAIL_API = 'https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeDetail';
const DATA_DIR = path.join(__dirname, '../data');

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.whzbtbxt.cn/whebd/'
};

const WUHAN_DISTRICTS = [
  '江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区',
  '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区',
  '经开区', '东湖高新区', '东湖风景区', '长江新区', '武汉市'
];

// === 业务匹配规则（公司主营 vs 不可做） ===
// 主营业务：招标代理 / 建筑设计 / 造价预算 / 工程监理 / 手续代办
// 不做：施工（EPC）
const IN_SCOPE = new Set([
  '招标代理', '手续代办',
  '工程监理', '工程设计', '工程勘察', '造价咨询', '全过程工程咨询',
  '设计', '监理', '勘察', '设计服务', '初步设计', '勘察设计',
  '造价', '全过程造价', '全过程造价控制',
  '审计', '审计服务', '决算审计',
  '投资咨询', '咨询服务'
]);
const OUT_OF_SCOPE = new Set([
  '施工', 'EPC', '工程总承包', '专业分包', '材料设备采购', '设备采购', '检测'
]);

function nowTs() {
  return Date.now();
}

function buildDetailUrl(id, registrationId) {
  return `https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=${id}&registrationId=${registrationId}&type=details&path=tendererNotice`;
}

function extractDistrict(address) {
  if (!address) return null;
  for (const d of WUHAN_DISTRICTS) {
    if (address.includes(d)) return d;
  }
  return null;
}

/**
 * 解析"2026-06-05 21:00"或"2026-06-05"为 Date 对象
 * 返回 null 表示无有效时间
 */
function parseDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[\sT](\d{2}:\d{2}(?::\d{2})?)?$/);
  if (!m) return null;
  const iso = m[2]
    ? `${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}+08:00`
    : `${m[1]}T00:00:00+08:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 智能推断 招标范围（multi_select 标签）
 * 输入：完整 record（含 model + requirmentList）
 * 输出：标签数组
 */
function inferScope(record) {
  const m = record.model || {};
  const className = m.tenderClassNumName || '';
  const contentName = m.tenderContentName || '';
  const title = m.tenderPrjName || '';
  const tags = new Set();

  // 1. EPC / 设计施工总承包（最高优先级：决定项目性质）
  //    标题里出现 EPC 是强信号（即使子类是设备采购，母项目是 EPC）
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

  // 2. 工程货物 / 设备采购
  if (className.includes('货物') || contentName.includes('设备')) {
    tags.add('设备采购');
    return ['设备采购'];
  }

  // 3. 工程施工（纯施工）
  if (className.includes('施工') && !className.includes('服务')) {
    tags.add('施工');
    return ['施工'];
  }

  // 4. 工程服务类：依据 招标内容 + 资质要求 推断
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
    // 内容补充
    if (contentName.includes('全过程') && contentName.includes('咨询')) tags.add('全过程工程咨询');
    if (contentName.includes('咨询') && !tags.size) tags.add('咨询服务');
  }

  return tags.size ? [...tags] : ['其他'];
}

/**
 * 业务匹配自动判断
 * 输入：scopeTags 数组
 * 输出：业务匹配 select 值
 */
function inferBusinessMatch(scopeTags) {
  if (!scopeTags || scopeTags.length === 0) return '待评估';
  const hasIn = scopeTags.some(t => IN_SCOPE.has(t));
  const hasOut = scopeTags.some(t => OUT_OF_SCOPE.has(t));
  if (hasOut && !hasIn) return '不可做';
  if (hasIn && !hasOut) return '主营业务可做';
  if (hasIn && hasOut) return '部分可做';
  return '待评估';
}

/**
 * 招标进展自动推断
 * 输入：item（mapToNotion 输出）
 * 输出：状态名称 或 null（无法推断）
 *
 * 自动化覆盖：
 *  - 已中标     (resultDate ≤ now)
 *  - 中标公示   (publicityDate ≤ now)
 *  - 报名截止   (noticeEndDate ≤ now，且无后续状态)
 *  - 公告中     (noticeStartDate ≤ now < noticeEndDate)
 * 其它（开标中 / 评标中 / 已流标 / 已终止 / 已结束）需人工或后续抓取
 */
function inferProgress(item) {
  const now = new Date();
  const start = parseDate(item.noticeStartDate);
  const end = parseDate(item.noticeEndDate);
  const pub = parseDate(item.publicityDate);
  const result = parseDate(item.resultDate);

  if (result && result <= now) return '已中标';
  if (pub && pub <= now) return '中标公示';
  if (end && end <= now) return '报名截止';
  if (start && start <= now && (!end || now < end)) return '公告中';
  return null;
}

/**
 * 解析资质要求列表，输出结构化字段
 * @returns { certTypes, certLevels, requirementText }
 */
function parseRequirements(requirmentList) {
  const lines = [];

  for (const r of (requirmentList || [])) {
    const type = r.certTypeNumName;
    const level = r.certTypeLevelName;
    const trade = r.tradeLargeClassName;
    const cat = r.tradeCategoryCodeName;

    const parts = [type, level, trade, cat].filter(p => p && p !== '无');
    if (parts.length) lines.push(parts.join(' | '));
  }

  return {
    requirementText: lines.length ? lines.join('\n') : null
  };
}

function mapToNotion(record) {
  const m = record.model || {};
  const id = m.id;
  const registrationId = m.registrationId;
  const plannedTenderTime = record.biddingPlanList?.[0]?.noticeReleaseTime;
  const district = extractDistrict(m.prjAddress);
  const { requirementText } = parseRequirements(record.requirmentList);
  const scopeTags = inferScope(record);
  const businessMatch = inferBusinessMatch(scopeTags);

  const item = {
    id,
    registrationId,
    title: m.tenderPrjName,
    projectCode: m.constructionNo,
    noticeType: m.tenderTypeNumName,
    detailUrl: buildDetailUrl(id, registrationId),
    noticeStartDate: m.noticeStartDate,
    noticeEndDate: m.noticeEndDate,
    plannedTenderTime,
    district,
    tenderCorp: m.prjbuildCorpName,
    tenderLinkMan: m.tenderLinkMan,
    tenderLinkPhone: m.tenderLinkPhone,
    agencyCorp: m.agencyCorpName,
    agencyLinkMan: m.agencyLinkMan,
    agencyLinkPhone: m.agencyLinkPhone,
    address: m.prjAddress,
    description: m.tenderContentDescription,
    contractPrice: m.allInvest,
    totalInvestment: m.totalInvestment,
    plannedPeriod: m.plannedPeriod,
    noteNumber: m.noteNumber,
    requirement: requirementText,
    supervisionDept: m.regulatorsName,
    supervisionDeptTel: m.supervisionDeptTel,
    prequalificationType: m.prequalificationTypeName,
    evaluationMethod: m.prequalificationMethodName,

    // === v2 新增字段 ===
    // 时间
    bidSubmitDeadline: m.bidDocumentSubmitEndDate,
    publicityDate: m.publicityStartDate,
    resultDate: m.resultNotificationDate,
    // 金额（万元）
    offerPrice: m.offerPrice,
    tenderBond: m.tenderBond,
    // 结构化
    scopeTags,
    businessMatch,
    projectProgress: null,  // 在 mapToNotion 之后算（需要 now）

    _raw: record
  };

  item.projectProgress = inferProgress(item);
  return item;
}

async function fetchList(pageNum, pageSize = 10) {
  const form = new URLSearchParams({
    t: String(nowTs()),
    tenderPrjName: '',
    evaluationMethod: '',
    prjbuildCorpName: '',
    regulators: '',
    noticeStartDate: '',
    noticeEndDate: '',
    bmFlag: '',
    prequalificationType: '',
    registrationId: '',
    current: String(pageNum),
    size: String(pageSize)
  });

  const res = await axios.post(LIST_API, form.toString(), { headers: HEADERS, timeout: 30000 });
  if (!res.data?.result) {
    throw new Error(`列表 API 返回错误: ${res.data?.msg}`);
  }
  return res.data.data;
}

async function fetchDetail(id) {
  const form = new URLSearchParams({
    t: String(nowTs()),
    id
  });

  const res = await axios.post(DETAIL_API, form.toString(), { headers: HEADERS, timeout: 30000 });
  if (!res.data?.result) {
    throw new Error(`详情 API 返回错误: ${res.data?.msg}`);
  }
  return res.data.data;
}

async function run({ pageCount = 1, pageSize = 10, outputFile = null, onItem = null } = {}) {
  console.log(`开始爬取 whzbtbxt: ${pageCount} 页 × ${pageSize} 条`);

  const allItems = [];
  for (let p = 1; p <= pageCount; p++) {
    console.log(`\n--- 列表第 ${p}/${pageCount} 页 ---`);
    const listData = await fetchList(p, pageSize);
    console.log(`  总数: ${listData.total}, 当前页 ${listData.records.length} 条`);

    for (const r of listData.records) {
      try {
        const detailData = await fetchDetail(r.id);
        const item = mapToNotion(detailData);
        allItems.push(item);
        console.log(`  ✓ ${item.title} | ${item.projectProgress ?? '?'} | ${item.businessMatch}`);
        if (onItem) onItem(item);
        // 简单限流
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`  ✗ ${r.tenderPrjName}: ${e.message}`);
      }
    }
  }

  if (outputFile) {
    const filePath = path.join(DATA_DIR, outputFile);
    fs.writeFileSync(filePath, JSON.stringify(allItems, null, 2), 'utf-8');
    console.log(`\n已保存 ${allItems.length} 条到 ${filePath}`);
  }

  console.log(`\n爬取完成: ${allItems.length} 条`);
  return { items: allItems };
}

module.exports = {
  run,
  fetchList,
  fetchDetail,
  mapToNotion,
  buildDetailUrl,
  inferScope,
  inferBusinessMatch,
  inferProgress,
  parseRequirements,
  WUHAN_DISTRICTS,
  IN_SCOPE,
  OUT_OF_SCOPE,
  meta: {
    name: '武汉市公共资源交易平台招投标系统',
    homepage: 'https://www.whzbtbxt.cn/',
    sourcePageId: null, // whzbtbxt 已切换纯 API，无需 sourcePageId
    scriptId: 'wuhan_public'
  }
};

if (require.main === module) {
  run({ pageCount: 1, pageSize: 5, outputFile: 'test_run.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}
