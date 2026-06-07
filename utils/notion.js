/**
 * Notion API 封装
 * 用于将招标公告数据写入 Notion 数据库
 */
const axios = require('axios');

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// 字段类型参考（来自"招标线索登记数据库" schema）
const NOTION_PROP_TYPES = {
  title: 'title',
  rich_text: 'rich_text',
  number: 'number',
  date: 'date',
  select: 'select',
  multi_select: 'multi_select',
  url: 'url',
  phone_number: 'phone_number',
  relation: 'relation',
  status: 'status'
};

// 已知的 select/multi_select 合法值（用于跳过未注册的选项，避免 API 报错）
// 注意：新增 Notion 字段时，必须同步在此处登记新值
const KNOWN_VALUES = {
  '公告类型': new Set(['采购公告', '资格预审公告', '招标公告', '竞争性磋商公告', '公开招标', '公开公告', '竞争性磋商']),
  '所属地域': new Set(['江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区', '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区', '经开区', '东湖高新区', '东湖风景区', '长江新区', '武汉市', '湖北省', '未知', '东西湖', '青山', '武昌', '汉阳', '黄陂', '江汉', '硚口', '洪山', '江夏']),
  '抓取状态': new Set(['已抓取', '已审核', '已更新']),
  '人工审核': new Set(['A.未关注', 'A.关注中', 'H.已投标', 'X.已放弃', 'Y.未中标', 'Z.已中标']),
  '招标进展': new Set(['公告中', '报名截止', '开标中', '评标中', '中标公示', '已中标', '已流标', '已终止', '已结束']),
  '业务匹配': new Set(['主营业务可做', '部分可做', '不可做', '待评估']),
  '招标范围': new Set([
    // 主营业务（可做）
    '招标代理', '手续代办', '工程监理', '工程设计', '工程勘察', '造价咨询',
    '全过程工程咨询', '审计', '设计', '监理', '勘察', '设计服务', '初步设计',
    '勘察设计', '造价', '全过程造价', '全过程造价控制', '审计服务', '决算审计',
    '投资咨询', '咨询服务',
    // 采购方式（东西湖区 API stockWay）
    '公开招标', '邀请招标', '竞争性磋商', '单一来源', '询价',
    // 边缘 / 不可做
    '检测',
    '专业分包', '材料设备采购', '施工', 'EPC', '工程总承包', '设备采购', '其他'
  ])
};

function getNotionToken() {
  return process.env.NOTION_TOKEN || 'process.env.NOTION_TOKEN';
}

function notionHeaders() {
  return {
    'Authorization': `Bearer ${getNotionToken()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

/**
 * 将 "2026-06-05 21:00" 转换为 Notion date 格式
 */
function toNotionDate(s) {
  if (!s) return null;
  // 已经是 ISO 格式
  if (s.includes('T')) return { date: { start: s } };
  // "2026-06-05 21:00" -> "2026-06-05T21:00:00+08:00"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[\sT](\d{2}:\d{2}(?::\d{2})?)$/);
  if (m) {
    const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
    return { date: { start: `${m[1]}T${time}+08:00` } };
  }
  // 仅日期 "2026-06-01"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { date: { start: s } };
  }
  return null;
}

function toNumber(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = Number(n);
  return isNaN(num) ? null : { number: num };
}

function toRichText(s) {
  if (s === null || s === undefined || s === '') return { rich_text: [] };
  const text = String(s);
  // Notion rich_text 长度限制 2000 字符
  return { rich_text: [{ type: 'text', text: { content: text.substring(0, 1900) } }] };
}

function toTitle(s) {
  if (!s) return { title: [] };
  const content = String(s).substring(0, 1900);
  return { title: [{
    type: 'text',
    text: { content, link: null },
    annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
    plain_text: content,
    href: null
  }] };
}

function toUrl(s) {
  if (!s) return { url: null };
  return { url: String(s) };
}

function toPhone(s) {
  if (!s) return { phone_number: null };
  return { phone_number: String(s) };
}

function toSelect(value, fieldName) {
  if (!value) return null;
  if (KNOWN_VALUES[fieldName] && !KNOWN_VALUES[fieldName].has(value)) {
    console.warn(`  警告: "${value}" 不在 ${fieldName} 已知选项中，将跳过`);
    return null;
  }
  return { select: { name: value } };
}

function toStatus(value, fieldName) {
  if (!value) return null;
  if (KNOWN_VALUES[fieldName] && !KNOWN_VALUES[fieldName].has(value)) {
    console.warn(`  警告: "${value}" 不在 ${fieldName} 已知选项中，将跳过`);
    return null;
  }
  return { status: { name: value } };
}

function toMultiSelect(values, fieldName) {
  if (!values) return null;
  const arr = Array.isArray(values) ? values : [values];
  const valid = arr.filter(v => {
    if (KNOWN_VALUES[fieldName] && !KNOWN_VALUES[fieldName].has(v)) {
      console.warn(`  警告: "${v}" 不在 ${fieldName} 已知选项中，将跳过`);
      return false;
    }
    return v;
  });
  if (valid.length === 0) return null;
  return { multi_select: valid.map(name => ({ name })) };
}

function toRelation(pageId) {
  if (!pageId) return null;
  return { relation: [{ id: pageId }] };
}

/**
 * 将爬虫数据转换为 Notion page properties
 * @param {Object} item - scraper 的 mapToNotion 输出
 * @param {Object} options - { sourcePageId, defaultStatus }
 */
function buildPageProperties(item, options = {}) {
  const props = {};

  if (item.title) props['招标项目名称'] = toTitle(item.title);
  if (item.id) props['公告ID'] = toRichText(item.id);
  if (item.projectCode) props['项目编号'] = toRichText(item.projectCode);

  const noticeTypeSelect = toSelect(item.noticeType, '公告类型');
  if (noticeTypeSelect) props['公告类型'] = noticeTypeSelect;

  if (item.detailUrl) props['公告详情页URL'] = toUrl(item.detailUrl);

  if (item.noticeStartDate) props['公告发布日期'] = toNotionDate(item.noticeStartDate);
  if (item.noticeEndDate) props['报名截止日期'] = toNotionDate(item.noticeEndDate);

  const districtMulti = toMultiSelect(item.district, '所属地域');
  if (districtMulti) props['所属地域'] = districtMulti;

  if (item.tenderCorp) props['招标机构/采购人'] = toRichText(item.tenderCorp);
  if (item.tenderLinkMan) props['招标机构联系人'] = toRichText(item.tenderLinkMan);
  if (item.tenderLinkPhone) props['招标机构电话'] = toPhone(item.tenderLinkPhone);

  if (item.agencyCorp) props['招标代理机构'] = toRichText(item.agencyCorp);
  if (item.agencyLinkMan) props['招标代理机构联系人'] = toRichText(item.agencyLinkMan);
  if (item.agencyLinkPhone) props['招标代理机构电话'] = toPhone(item.agencyLinkPhone);

  if (item.address) props['联系地址'] = toRichText(item.address);
  if (item.description) props['项目详情'] = toRichText(item.description);
  if (item.requirement) props['申请资质要求'] = toRichText(item.requirement);

  const contractPrice = toNumber(item.contractPrice);
  if (contractPrice) props['合同估算价(万元)'] = contractPrice;

  const totalInvestment = toNumber(item.totalInvestment);
  if (totalInvestment) props['投资估算额(万元)'] = totalInvestment;

  const plannedPeriod = toNumber(item.plannedPeriod);
  if (plannedPeriod) props['工期天数'] = plannedPeriod;

  if (item.noteNumber) props['采购计划备案号'] = toRichText(item.noteNumber);

  const plannedTenderDate = toNotionDate(item.plannedTenderTime);
  if (plannedTenderDate) props['拟招标时间'] = plannedTenderDate;

  // === 新增字段（v2 改造）===

  // 业务匹配
  if (item.businessMatch) {
    const m = toSelect(item.businessMatch, '业务匹配');
    if (m) props['业务匹配'] = m;
  }

  // 招标范围（多选）
  if (item.scopeTags && item.scopeTags.length > 0) {
    const tags = toMultiSelect(item.scopeTags, '招标范围');
    if (tags) props['招标范围'] = tags;
  }

  // 招标进展
  if (item.projectProgress) {
    const p = toStatus(item.projectProgress, '招标进展');
    if (p) props['招标进展'] = p;
  }

  // 时间字段
  if (item.bidSubmitDeadline) props['投标截止时间'] = toNotionDate(item.bidSubmitDeadline);
  if (item.publicityDate) props['中标公示时间'] = toNotionDate(item.publicityDate);
  if (item.resultDate) props['中标时间'] = toNotionDate(item.resultDate);

  // 金额字段（万元）— 0 表示"暂无数据"，不写入
  const offerPrice = toNumber(item.offerPrice);
  if (offerPrice && offerPrice.number > 0) props['中标金额(万元)'] = offerPrice;
  const bond = toNumber(item.tenderBond);
  if (bond && bond.number > 0) props['保证金(万元)'] = bond;

  // 抓取状态：新建时默认"已抓取"
  if (options.setStatus) {
    props['抓取状态'] = { status: { name: options.setStatus } };
  }

  // 公告发布平台 (relation) - 必须由调用方显式传入，避免硬编码
  const sourcePageId = options.sourcePageId;
  const relation = toRelation(sourcePageId);
  if (relation) props['公告发布平台'] = relation;

  return props;
}

/**
 * 检查页面是否已存在
 * 策略：优先按 公告ID 查重（最强唯一键），没有则用 (项目编号 + 招标项目名称) 复合
 * 带宽松重试；查询失败时抛出错误（防止重复创建）
 */
async function findExistingPage(databaseId, item) {
  // 优先用 公告ID（每个公告在源系统的唯一标识）
  if (item.id) {
    const byId = await queryExisting(databaseId, {
      property: '公告ID',
      rich_text: { equals: String(item.id) }
    });
    if (byId) return byId;
    return null;  // 有 id 就用 id 查，不管结果
  }

  // 回退：项目编号 + 标题 复合查重
  const projectCode = item.projectCode;
  const title = item.title;
  if (!projectCode && !title) return null;

  const filters = [];
  if (projectCode) filters.push({ property: '项目编号', rich_text: { equals: projectCode } });
  if (title) filters.push({ property: '招标项目名称', title: { equals: title } });
  if (filters.length === 0) return null;

  const filter = filters.length === 1 ? filters[0] : { and: filters };
  return await queryExisting(databaseId, filter);
}

async function queryExisting(databaseId, filter) {
  // 宽松重试：3/5/8 秒，足够 Notion 海外服务器响应
  const backoffs = [3000, 5000, 8000];
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    try {
      const res = await axios.post(`${NOTION_BASE}/databases/${databaseId}/query`, {
        filter,
        page_size: 1
      }, { headers: notionHeaders(), timeout: 20000 });

      return res.data.results.length > 0 ? res.data.results[0] : null;
    } catch (e) {
      const last = attempt === backoffs.length - 1;
      if (last) throw new Error(`查重失败 (${backoffs.length}次重试用尽): ${e.response?.data?.message || e.message}`);
      const wait = backoffs[attempt];
      console.warn(`  查重失败(${e.response?.status || e.code}), ${wait/1000}秒后重试...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * 创建新页面
 */
async function createPage(databaseId, properties) {
  const res = await axios.post(`${NOTION_BASE}/pages`, {
    parent: { database_id: databaseId },
    properties
  }, { headers: notionHeaders() });
  return res.data;
}

/**
 * 更新已有页面（增量）
 */
async function updatePage(pageId, properties) {
  const res = await axios.patch(`${NOTION_BASE}/pages/${pageId}`, {
    properties
  }, { headers: notionHeaders() });
  return res.data;
}

/**
 * 上传一条公告到 Notion（带去重）
 * @returns {Object} { status: 'created'|'updated'|'skipped', pageId, error? }
 */
async function uploadItem(item, options = {}) {
  const databaseId = options.databaseId
    || process.env.NOTION_DATABASE_ID
    || '32d9e857b37a80f8bfdad0de856ee030';

  const properties = buildPageProperties(item, options);
  if (Object.keys(properties).length === 0) {
    return { status: 'skipped', reason: 'no properties' };
  }

  // 去重查询（失败抛错，不盲目创建）
  let existing = null;
  try {
    existing = await findExistingPage(databaseId, item);
  } catch (e) {
    return { status: 'error', error: e.message };
  }
  if (existing) {
    if (options.skipExisting) {
      return { status: 'skipped', reason: 'already exists', pageId: existing.id };
    }
    // 更新时：剥离 抓取状态（避免覆盖人工设置的"已审核"）
    const { 抓取状态: _omit, ...updateProps } = properties;
    try {
      await updatePage(existing.id, updateProps);
      return { status: 'updated', pageId: existing.id };
    } catch (e) {
      return { status: 'error', error: e.response?.data?.message || e.message };
    }
  }

  // 新建时：确保 抓取状态 = "已抓取"
  if (!options.setStatus) {
    properties['抓取状态'] = { status: { name: '已抓取' } };
  }
  try {
    const page = await createPage(databaseId, properties);
    return { status: 'created', pageId: page.id };
  } catch (e) {
    return { status: 'error', error: e.response?.data?.message || e.message };
  }
}

/**
 * 批量上传（带间隔，避免触发限流）
 */
async function uploadItems(items, options = {}) {
  const results = { created: 0, updated: 0, skipped: 0, error: 0, details: [] };
  const interval = options.interval || 350;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`[${i + 1}/${items.length}] ${item.title}`);
    const result = await uploadItem(item, options);
    results.details.push({ title: item.title, ...result });
    results[result.status] = (results[result.status] || 0) + 1;
    if (result.status === 'created') console.log(`  ✓ 创建`);
    else if (result.status === 'updated') console.log(`  ↻ 更新`);
    else if (result.status === 'skipped') console.log(`  - 跳过 (${result.reason})`);
    else console.log(`  ✗ 失败: ${result.error}`);
    if (i < items.length - 1) await new Promise(r => setTimeout(r, interval));
  }
  return results;
}

module.exports = {
  buildPageProperties,
  uploadItem,
  uploadItems,
  findExistingPage,
  toNotionDate,
  KNOWN_VALUES
};
