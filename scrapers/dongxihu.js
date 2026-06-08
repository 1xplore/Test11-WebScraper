/**
 * 东西湖区政府采购电子交易系统 爬虫
 * API 接入方式：Angular + LayUI 后端 API
 * 列表: POST /announce/editQueryMore?type=1&pageNo=N&pageSize=10
 * 详情: POST /announce/editQueryById?uuid={uuid}
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseHtmlContent, parseQualificationText } = require('../utils/parseHtmlContent');

const BASE = 'http://zfcg.dxh.gov.cn:9090/dxh';
const LIST_API = '/announce/editQueryMore';
const DETAIL_API = '/announce/editQueryById';
const DATA_DIR = path.join(__dirname, '../data');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer': 'http://zfcg.dxh.gov.cn:9090/dxh/views/announce/home.html'
};

function buildDetailUrl(uuid) {
  return `http://zfcg.dxh.gov.cn:9090/dxh/views/announce/announce_info.html?uuid=${uuid}&type=1`;
}

function extractDistrict(address) {
  if (!address) return null;
  const WUHAN_DISTRICTS = [
    '江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区',
    '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区',
    '经开区', '东湖高新区', '东湖风景区', '长江新区', '武汉市'
  ];
  for (const d of WUHAN_DISTRICTS) {
    if (address.includes(d)) return d;
  }
  return null;
}

/**
 * 推断招标范围（基于 titleName + xmNo）
 * 东西湖区政府采购类型：招标公告 / 竞争性磋商 / 单一来源 / 询价 等
 */
/**
 * 业务范围推断
 * @param {Object} item - raw record
 * @param {string} demandKeywords - 采购需求文本
 * @param {Array|null} scopeRules -动态加载的规则数组，如果为 null 则使用内置规则
 */
function inferScope(item, demandKeywords = '', scopeRules = null) {
  const title = item.titleName || '';
  const bizText = title + ' ' + demandKeywords;

  // 有动态规则时使用规则引擎
  if (scopeRules && scopeRules.length > 0) {
    const tags = [];
    for (const rule of scopeRules) {
      if (rule.regex.test(bizText)) {
        tags.push(rule.tag);
        if (rule.stopOnMatch) break;
      }
    }
    return tags.length > 0 ? tags : ['其他'];
  }

  // 内置规则（无动态规则时回退）
  if (/EPC|设计施工总承包|设计采购施工|交钥匙/.test(bizText)) return ['EPC'];
  if (/设备采购|器械采购/.test(bizText)) return ['设备采购'];
  if (/材料采购/.test(bizText)) return ['材料采购'];
  if (/货物采购/.test(bizText)) return ['货物采购'];
  if (/运维服务/.test(bizText)) return ['运维服务'];
  if (/运维/.test(bizText)) return ['运维'];
  if (/环卫/.test(bizText)) return ['环卫'];
  if (/养护/.test(bizText)) return ['养护'];
  if (/物业(?!服务)/.test(bizText)) return ['物业'];
  if (/物业服务/.test(bizText)) return ['物业服务'];
  if (/餐饮外包/.test(bizText)) return ['餐饮外包'];
  if (/安保/.test(bizText)) return ['安保'];
  if (/保洁/.test(bizText)) return ['保洁'];
  if (/管护/.test(bizText)) return ['管护'];
  if (/清淤/.test(bizText)) return ['清淤'];
  if (/软件开发|系统集成/.test(bizText)) return ['软件开发'];
  if (/信息化|智慧社区|智慧城市/.test(bizText)) return ['信息化服务'];
  if (/污染调查|环境调查/.test(bizText)) return ['环境调查'];
  if (/安全评估/.test(bizText)) return ['安全评估'];
  if (/工程设计|设计服务|勘察设计|建筑设计/.test(bizText)) return ['建筑设计'];
  if (/工程监理|建设监理|监理(?!服务)/.test(bizText)) return ['工程监理'];
  if (/造价咨询|预算编制|造价预算/.test(bizText)) return ['造价预算'];
  if (/工程项目管理|建设项目管理/.test(bizText)) return ['工程项目管理'];
  if (/结算审核|结算审计|审计服务/.test(bizText)) return ['结算审计'];
  if (/决算审核|决算审计/.test(bizText)) return ['决算审计'];
  if (/全过程造价|造价跟踪|跟踪造价/.test(bizText)) return ['造价跟踪'];
  if (/工程勘察|岩土勘察|地质勘查/.test(bizText)) return ['工程勘查'];
  if (/全过程工程咨询/.test(bizText)) return ['全过程工程咨询'];
  return ['其他'];
}

// 业务匹配规则（与 whzbtbxt 相同）
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

function inferBusinessMatch(scopeTags) {
  if (!scopeTags || scopeTags.length === 0) return '待评估';
  const hasIn = scopeTags.some(t => IN_SCOPE.has(t));
  const hasOut = scopeTags.some(t => OUT_OF_SCOPE.has(t));
  if (hasOut && !hasIn) return '不可做';
  if (hasIn && !hasOut) return '主营业务可做';
  if (hasIn && hasOut) return '部分可做';
  return '待评估';
}

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

function inferProgress(item) {
  const now = new Date();
  const start = parseDate(item.noticeStartDate);
  const end = parseDate(item.noticeEndDate);
  if (end && end <= now) return '报名截止';
  if (start && start <= now && (!end || now < end)) return '公告中';
  return null;
}

async function fetchList(pageNum, pageSize = 10) {
  const res = await axios.post(
    `${BASE}${LIST_API}?type=1&pageNo=${pageNum}&pageSize=${pageSize}`,
    '',
    { headers: HEADERS, timeout: 30000 }
  );
  const d = res.data?.data;
  if (!d) throw new Error('列表 API 返回异常');
  return { total: d.count || 0, records: d.list || [] };
}

async function fetchDetail(uuid) {
  const res = await axios.post(
    `${BASE}${DETAIL_API}?uuid=${uuid}`,
    '',
    { headers: HEADERS, timeout: 30000 }
  );
  const d = res.data?.data;
  if (!d) throw new Error('详情 API 返回异常');
  if (Array.isArray(d)) {
    if (!d[0]) throw new Error('详情 API 返回异常');
    return d[0];
  }
  return d;
}

function mapToNotion(record, scopeRules = null) {
  const htmlParsed = record.content ? parseHtmlContent(record.content, record.stockWay) : {};
  const qualParsed = record.content ? parseQualificationText(record.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) : null;

  const scopeTags = inferScope(record, htmlParsed.demandKeywords, scopeRules);
  const businessMatch = inferBusinessMatch(scopeTags);
  const district = extractDistrict(record.titleName);

  // 资质要求：优先取特定资格要求段落，否则用采购需求文本
  let requirement = null;
  if (qualParsed && qualParsed.length > 0) {
    requirement = qualParsed.map(q => q.raw).join('\n');
  } else if (htmlParsed.demandKeywords) {
    requirement = htmlParsed.demandKeywords;
  }

  const item = {
    id: record.uuid,
    title: record.titleName,
    projectCode: record.xmNo,
    noticeType: htmlParsed.noticeType || null,
    detailUrl: buildDetailUrl(record.uuid),
    noticeStartDate: record.startDate,
    noticeEndDate: record.endDate,
    district: district || '东西湖区',
    tenderCorp: htmlParsed.tenderCorp || null,
    agencyCorp: htmlParsed.agencyCorp || null,
    contractPrice: htmlParsed.contractPrice || null,
    description: record.noticModel || null,
    // v2 字段
    scopeTags,
    businessMatch,
    projectProgress: null,
    bidSubmitDeadline: htmlParsed.bidSubmitDeadline || null,
    publicityDate: null,
    resultDate: null,
    offerPrice: htmlParsed.offerPrice || null,
    tenderBond: null,
    requirement,
    noteNumber: htmlParsed.noteNumber || null,
    // 联系电话（与 buildPageProperties 字段名对齐）
    tenderLinkPhone: htmlParsed.tenderPhone || null,
    tenderLinkMan: htmlParsed.projectContact || null,
    agencyLinkPhone: htmlParsed.agencyPhone || null,
    _raw: record
  };

  item.projectProgress = inferProgress(item);
  return item;
}

async function run({ pageCount = 1, pageSize = 10, outputFile = null, onItem = null, scopeRules = null } = {}) {
  console.log(`开始爬取东西湖区: ${pageCount} 页 × ${pageSize} 条`);

  const allItems = [];
  for (let p = 1; p <= pageCount; p++) {
    console.log(`\n--- 列表第 ${p}/${pageCount} 页 ---`);
    const listData = await fetchList(p, pageSize);
    console.log(`  总数: ${listData.total}, 当前页 ${listData.records.length} 条`);

    for (const r of listData.records) {
      try {
        const detailData = await fetchDetail(r.uuid);
        const item = mapToNotion(detailData, scopeRules);
        allItems.push(item);
        console.log(`  ✓ ${item.title?.substring(0, 50)} | ${item.projectProgress ?? '?'} | ${item.businessMatch}`);
        if (onItem) onItem(item);
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`  ✗ ${r.titleName || r.uuid}: ${e.message}`);
      }
    }
  }

  if (outputFile) {
    const filePath = path.join(DATA_DIR, outputFile);
    fs.writeFileSync(filePath, JSON.stringify(allItems, null, 2), 'utf-8');
    console.log(`\n已保存 ${allItems.length} 条到 ${filePath}`);
  }

  console.log(`\n爬取完成: ${allItems.length} 条`);
  return allItems;
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
  meta: {
    name: '东西湖区政府采购电子交易系统',
    homepage: 'http://zfcg.dxh.gov.cn:9090/dxh/views/announce/home.html',
    sourcePageId: '32d9e857-b37a-81bf-9976-c49aa0e892aa',
    scriptId: 'wuhan_dongxihu_district'
  }
};

if (require.main === module) {
  run({ pageCount: 1, pageSize: 5, outputFile: 'dongxihu_test.json' })
    .then(() => process.exit(0))
    .catch(e => {
      console.error('失败:', e);
      process.exit(1);
    });
}