/**
 * 从东西湖区政府采购 HTML content 中解析结构化字段
 *
 * 解析策略：正则匹配关键文本片段，不依赖 DOM 结构
 * （HTML 内容中 <p><span> 层级不固定，用文本匹配更稳定）
 */
const STOCK_WAY_MAP = {
  '01': '公开招标',
  '02': '邀请招标',
  '03': '竞争性磋商',
  '04': '单一来源',
  '05': '询价',
  '06': '竞争性磋商'
};

function matchOne(text, pattern) {
  const m = text.match(pattern);
  return m ? m[1].trim() : null;
}

function parseHtmlContent(html, stockWay) {
  // 去掉 HTML 标签，只取纯文本，便于正则匹配
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const result = {};

  // 1. 采购方式：优先从 HTML 解析（名称比 code 更准确）
  const procurementMethod = matchOne(text, /(?:采购方式|招标方式)[：:]\s*(\S{2,20})/);
  if (procurementMethod) {
    result.noticeType = procurementMethod;
  } else if (stockWay && STOCK_WAY_MAP[stockWay]) {
    result.noticeType = STOCK_WAY_MAP[stockWay];
  }

  // 2. 预算金额（万元）- 括号与单位之间可能有空格
  const budgetAmount = matchOne(text, /预算金额[（(]\s*万元\s*[）)][：:]\s*([0-9.]+)/);
  result.contractPrice = budgetAmount ? parseFloat(budgetAmount) : null;

  // 3. 最高限价（万元）- 同上
  const ceilingPrice = matchOne(text, /最高限价[（(]\s*万元\s*[）)][：:]\s*([0-9.]+)/);
  result.offerPrice = ceilingPrice ? parseFloat(ceilingPrice) : null;

  // 4. 采购人名称
  result.tenderCorp = matchOne(text, /采购人信息[\s\S]{0,100}?名称[：:]\s*(\S{2,50})/);

  // 5. 采购代理机构名称
  result.agencyCorp = matchOne(text, /采购代理机构信息[\s\S]{0,100}?名称[：:]\s*(\S{2,50})/);

  // 6. 投标截止时间，兼容两种格式：
  //   东西湖: "2026年06月24日09点30分"
  //   黄陂区: "2026-06-23 09:30"
  const bidDeadlineCN = matchOne(text, /(?:提交投标文件)?截止时间[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}[点時]\d{1,2}分?)/);
  const bidDeadlineISO = !bidDeadlineCN
    ? matchOne(text, /(?:提交投标文件|响应文件)?截止时间[：:]\s*(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})/)
    : null;
  if (bidDeadlineCN) {
    result.bidSubmitDeadline = bidDeadlineCN
      .replace(/年(\d{1,2})月(\d{1,2})日/, (_, m, d) => `-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)
      .replace(/(\d{1,2})[点時](\d{1,2})分?/, (_, h, min) => ` ${h.padStart(2,'0')}:${min}`);
  } else if (bidDeadlineISO) {
    // 规范化日期段补零
    result.bidSubmitDeadline = bidDeadlineISO.replace(
      /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
      (_, y, m, d, h, min) => `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')} ${h.padStart(2,'0')}:${min}`
    );
  }

  // 7. 从采购需求文本推断业务类型（辅助 inferScope）
  // 截断点设在"申请人资格要求"段之前，避免法律条款中的"监理/检测"等词干扰
  const demandText = matchOne(text, /采购需求[：:]\s*([\s\S]{0,1000}?)(?=二、申请人的资格要求|三、获取招标文件|特定资格要求)/);
  result.demandKeywords = demandText || '';

  // 8. 联系电话（固定电话 3/4位-7/8位 或 手机 1开11位）
  result.tenderPhone = matchOne(text, /采购人信息[^\n]*?联系方式[：:]\s*([0-9]{3,4}-[0-9]{7,8}|1[0-9]{10})/);
  result.agencyPhone = matchOne(text, /采购代理机构信息[^\n]*?联系方式[：:]\s*([0-9]{3,4}-[0-9]{7,8}|1[0-9]{10})/);
  result.projectContact = matchOne(text, /项目联系人[：:]\s*(\S{2,30})/);
  result.projectPhone = matchOne(text, /项目联系方式[^\n]*?电话[：:]\s*([0-9]{3,4}-[0-9]{7,8}|1[0-9]{10})/);

  // 9. 招标文件获取时间段
  const fileTimeRaw = matchOne(text, /获取招标文件[\s\S]{0,50}?时间[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日[^\n]*?(?:至|—)\d{4}年\d{1,2}月\d{1,2}日[^\n]*)/);
  result.fileObtainTime = fileTimeRaw ? fileTimeRaw.trim() : null;

  // 10. 采购计划备案号
  result.noteNumber = matchOne(text, /采购计划备案号[：:]\s*([0-9A-Za-z-]+)/);

  return result;
}

/**
 * 从 HTML 纯文本解析特定资格要求段落
 *
 * @param {string} text - HTML 去标签后的纯文本
 * @returns {{type, level, scope, bizScope, raw}[]|null}
 *
 * 资质类型关键词 -> 标准化类型名 + 业务推断 scopeTags
 */
function parseQualificationText(text) {
  const qualIdx = text.indexOf('特定资格要求');
  if (qualIdx < 0) return null;

  const segment = text.substring(qualIdx, qualIdx + 800);
  if (/^\/+$/.test(segment.trim())) return null;

  const CERT_TYPES = {
    '测绘':                   { name: '测绘资质',          bizScope: '工程勘察' },
    '房地产估价':             { name: '房地产估价资质',    bizScope: '咨询服务' },
    '会计师事务所':          { name: '会计资质',          bizScope: '审计' },
    '工程监理':              { name: '监理资质',          bizScope: '工程监理' },
    '工程造价':              { name: '造价资质',          bizScope: '造价咨询' },
    '招标代理':              { name: '招标代理资质',       bizScope: '招标代理' },
    '工程设计':              { name: '设计资质',          bizScope: '工程设计' },
  };

  const results = [];
  // 分割各段：遇到"三、"（获取招标文件）停止
  const rawSegments = segment.split(/(?=[\d]、)/);
  for (const raw of rawSegments) {
    const pkg = raw.trim();
    if (!pkg || pkg.length < 5) continue;
    if (/^三、/.test(pkg)) break;  // "三、获取招标文件" 开始，新段落

    let typeName = null, level = null, scope = null, bizScope = null;

    // 1. 找资质类型关键词
    for (const [kw, info] of Object.entries(CERT_TYPES)) {
      if (raw.includes(kw)) { typeName = info.name; bizScope = info.bizScope; break; }
    }
    if (!typeName) continue;

    // 2. 提取级别：直接保留原文（甲乙丙丁和一二三四是不同体系，不转换）
    //    匹配如"乙级"、"三级"、"一级"、"特级"等
    const levelRe = /([甲乙丙丁一二三四特]+级(?:\s*[及以上]*))/;
    const lm = raw.match(levelRe);
    if (lm) level = lm[1].replace(/\s+及以上$/, '').trim();

    // 3. 提行业限定（括号内文本）
    const scopeMatch = raw.match(/[（(]([^）)]+)[）)]$/);
    if (scopeMatch) scope = scopeMatch[1].trim();

    results.push({ type: typeName, level: level || '无级别', scope, bizScope, raw });
  }

  return results.length > 0 ? results : null;
}

/**
 * 提取"本项目的特定资格要求："所属段落的原文（含标签）
 * 用于资质识别失败时回写到错误日志，便于人工调优
 *
 * 段落规则（武汉地区多个采购站点格式一致）：
 *   开始：含"本项目的特定资格要求"的子串
 *   结束：下一章节"三、"（"获取招标文件"），找不到则截 500 字符兜底
 * 返回包含标签自身（如"6. 本项目的特定资格要求：xxx"），便于人工识别
 *
 * @param {string} text - HTML 去标签后的纯文本
 * @returns {string|null}
 */
function extractQualSection(text) {
  if (!text) return null;
  const startIdx = text.indexOf('本项目的特定资格要求');
  if (startIdx < 0) return null;
  // 向前回看 5 字符抓上标号（如 "6. "）
  const headStart = Math.max(0, startIdx - 5);
  const after = text.substring(headStart);
  // 终止于"三、"或"三 、"（下一章节）
  const endMatch = after.search(/三\s*、/);
  const segment = endMatch > 0 ? after.substring(0, endMatch) : after.substring(0, 500);
  return segment.trim();
}

module.exports = { parseHtmlContent, parseQualificationText, extractQualSection, STOCK_WAY_MAP };
