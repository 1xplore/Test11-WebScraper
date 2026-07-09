/**
 * 业务匹配服务：算法 + AI 混合
 *
 * 算法层（deterministic）：
 *   - inferScope: 用 27 条 scope 规则做 regex 匹配 → tags[]
 *   - inferBusinessMatch: 基于 IN_SCOPE / OUT_OF_SCOPE 集合做布尔判定
 *   - inferProgress: 基于日期字段做状态推断
 *   - computeLocalScore: 本地算法分（0~1）
 *
 * AI 层（optional，靠环境变量启用）：
 *   - aiRefine: 调用 LLM（OpenAI-compatible API）做语义复核，返回 { tags, score, reason }
 *   - 失败/未配置 → 静默降级到本地算法
 *
 * 设计：算法永远跑（兜底），AI 是 +1 维度，二者结果加权
 */

const db = require('../db');

// ---------------- 业务规则常量 ----------------

// IN_SCOPE 集合覆盖公司主营业务所有可能的 tag（基于 27 条 regex 规则反推 + 业务常识）
const IN_SCOPE = new Set([
  // 招标代理类
  '招标代理', '手续代办', '代办',
  // 监理类
  '工程监理', '建设监理', '施工监理', '监理',
  // 设计类
  '工程设计', '设计服务', '初步设计', '勘察设计', '建筑设计', '设计',
  // 勘察类
  '工程勘察', '岩土勘察', '地质勘查', '地勘', '勘察',
  // 造价类
  '造价咨询', '造价预算', '造价跟踪', '跟踪造价', '全过程造价', '全过程造价控制',
  '造价控制', '造价审核', '概算', '估算', '投资估算', '造价',
  // 全过程咨询/项目管理
  '全过程工程咨询', '工程项目管理', '建设项目管理',
  // 审计类
  '审计', '审计服务', '结算审计', '结算审核', '决算审计', '决算审核',
  '审计跟踪', '跟踪审计', '造价跟踪',
  // 咨询/可研
  '投资咨询', '投资评估', '咨询评估', '投资策划', '项目策划', '可行性研究', '可研', '咨询服务',
  // 验收/复核/评估
  '工程验收', '工程复核', '安全评估', '风险评估',
]);

const OUT_OF_SCOPE = new Set([
  '施工', '建设施工', '工程施工', '项目施工',
  'EPC', '工程总承包', '设计施工总承包', '设计采购施工', '设计施工', '专业分包',
  '材料采购', '材料设备采购', '设备采购', '器械采购', '货物采购',
  '物业运维', '保洁服务', '安保服务', '安保', '安防', '保卫',
  '餐饮外包', '环卫养护', '三防', '三防工程',
  '软件开发', '系统集成', '信息化服务', '信息化',
  '环境调查', '污染调查', '检测',
]);

const WUHAN_DISTRICTS = [
  '江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区',
  '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区',
  '经开区', '东湖高新区', '东湖风景区', '长江新区', '武汉市'
];

// ---------------- 工具函数 ----------------

function parseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})(?:[\sT](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (!m) return null;
  const iso = m[2]
    ? `${m[1]}T${m[2].length === 5 ? m[2] + ':00' : m[2]}+08:00`
    : `${m[1]}T00:00:00+08:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function extractDistrict(address, fallback = null) {
  if (!address) return fallback;
  for (const d of WUHAN_DISTRICTS) if (address.includes(d)) return d;
  return fallback;
}

// ---------------- 算法层 ----------------

/**
 * regex 引擎：跑 27 条 scope 规则，命中规则即得 tag
 * @param {string} text  拼接的"标题 + 采购需求"
 * @param {Array<{regex: RegExp, tag: string, stopOnMatch?: boolean}>} dynamicRules
 *        可选；不传则从数据库读 enabled 规则编译
 */
function inferScope(text, dynamicRules = null) {
  const rules = dynamicRules || loadActiveScopeRules();
  if (!rules.length) return ['其他'];
  const tags = [];
  for (const r of rules) {
    if (r.regex.test(text)) {
      tags.push(r.tag);
      if (r.stopOnMatch) break;
    }
  }
  return tags.length > 0 ? tags : ['其他'];
}

const _scopeRulesCache = { value: null, at: 0 };
function loadActiveScopeRules() {
  const now = Date.now();
  if (_scopeRulesCache.value && now - _scopeRulesCache.at < 30_000) {
    return _scopeRulesCache.value;
  }
  const rows = db.prepare(
    'SELECT priority, tag, keywords, stop_on_match FROM scope_rules WHERE enabled = 1 ORDER BY priority ASC'
  ).all();
  const rules = rows.map((r) => ({
    priority: r.priority,
    tag: r.tag,
    regex: compileKeywords(r.keywords),
    stopOnMatch: !!r.stop_on_match,
  }));
  _scopeRulesCache.value = rules;
  _scopeRulesCache.at = now;
  return rules;
}

function invalidateScopeRulesCache() {
  _scopeRulesCache.value = null;
  _scopeRulesCache.at = 0;
}

// 把本服务的 invalidator 注册到 storage 层 —— 任何对 scope_rules 的写都立刻失效缓存
try {
  storage.registerScopeRulesCacheInvalidator(invalidateScopeRulesCache);
} catch (_) { /* 早期 bootstrap 阶段静默 */ }

// ---------- 资质（qual_rules）正则匹配 —— 与 inferScope 同形态 ----------

const _qualRulesCache = { value: null, at: 0 };
function loadActiveQualRules() {
  const now = Date.now();
  if (_qualRulesCache.value && now - _qualRulesCache.at < 30_000) {
    return _qualRulesCache.value;
  }
  const rows = storage.listQualRules({ enabledOnly: true });
  const rules = rows.map((r) => ({
    priority: r.priority,
    tag: r.tag,
    regex: compileKeywords(r.keywords),
  }));
  _qualRulesCache.value = rules;
  _qualRulesCache.at = now;
  return rules;
}

function invalidateQualRulesCache() {
  _qualRulesCache.value = null;
  _qualRulesCache.at = 0;
}

try {
  storage.registerQualRulesCacheInvalidator(invalidateQualRulesCache);
} catch (_) { /* bootstrap 阶段静默 */ }

/**
 * 给定文本（通常是 announcement.requirement），命中已有的 qual_rules 关键词即视为
 * 该公告属于对应资质要求类别。未命中返回 ['未匹配']（区别于 ['其他']，便于 UI 显示）
 */
function inferQual(text, dynamicRules = null) {
  const rules = dynamicRules || loadActiveQualRules();
  if (!rules.length) return ['未匹配'];
  const tags = [];
  for (const r of rules) {
    if (r.regex.test(text)) tags.push(r.tag);
  }
  return tags.length > 0 ? tags : ['未匹配'];
}

// ---------- 公告类型（notice_type_rules）正则匹配 —— 第三套 self-growth (Loop 6) ----------

const _noticeTypeRulesCache = { value: null, at: 0 };
function loadActiveNoticeTypeRules() {
  const now = Date.now();
  if (_noticeTypeRulesCache.value && now - _noticeTypeRulesCache.at < 30_000) {
    return _noticeTypeRulesCache.value;
  }
  const rows = storage.listNoticeTypeRules({ enabledOnly: true });
  const rules = rows.map((r) => ({
    priority: r.priority,
    tag: r.tag,
    regex: compileKeywords(r.keywords),
  }));
  _noticeTypeRulesCache.value = rules;
  _noticeTypeRulesCache.at = now;
  return rules;
}

function invalidateNoticeTypeRulesCache() {
  _noticeTypeRulesCache.value = null;
  _noticeTypeRulesCache.at = 0;
}

try {
  storage.registerNoticeTypeRulesCacheInvalidator(invalidateNoticeTypeRulesCache);
} catch (_) { /* bootstrap 阶段静默 */ }

function inferNoticeType(text, dynamicRules = null) {
  const rules = dynamicRules || loadActiveNoticeTypeRules();
  if (!rules.length) return [];
  const tags = [];
  for (const r of rules) {
    if (r.regex.test(text)) tags.push(r.tag);
  }
  return tags;
}

function inferBusinessMatch(scopeTags) {
  if (!scopeTags || scopeTags.length === 0) return '待评估';
  const hasIn = scopeTags.some((t) => IN_SCOPE.has(t));
  const hasOut = scopeTags.some((t) => OUT_OF_SCOPE.has(t));
  if (hasOut && !hasIn) return '不可做';
  if (hasIn && !hasOut) return '主营业务可做';
  if (hasIn && hasOut) return '部分可做';
  return '待评估';
}

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
 * 本地算法分（0~1）：
 *   - 命中 IN_SCOPE +0.5；命中 OUT_OF_SCOPE -0.4；两个都命中时各折半
 *   - 标题含 "咨询/服务/代理/审计/造价" 等核心词 +0.1
 *   - 缺失 tags（=["其他"]）→ 0.2（待评估）
 */
function computeLocalScore(scopeTags, title) {
  if (!scopeTags || scopeTags.length === 0 || (scopeTags.length === 1 && scopeTags[0] === '其他')) {
    return 0.2;
  }
  const hasIn = scopeTags.some((t) => IN_SCOPE.has(t));
  const hasOut = scopeTags.some((t) => OUT_OF_SCOPE.has(t));
  let score = 0.3;
  if (hasIn) score += hasOut ? 0.25 : 0.5;
  if (hasOut) score -= hasIn ? 0.2 : 0.4;
  if (title) {
    if (/咨询|服务|代理|审计|造价|评估|可研|勘察|设计|监理/.test(title)) score += 0.1;
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

// ---------------- AI 层（可选） ----------------

/**
 * LLM 语义复核（OpenAI-compatible 接口）
 * 输入: { title, description, scopeTags }
 * 输出: { tags: string[], score: 0~1, reason: string }
 *
 * 配置读取：system_settings（UI 填）→ process.env（部署兜底）→ 内置默认。
 * 每次 read-through，UI 改完立即生效。
 *
 * 环境变量（兜底用）：
 *   OPENAI_API_KEY    缺失时回退到此
 *   OPENAI_BASE_URL   可选，默认 https://api.openai.com/v1
 *   OPENAI_MODEL      可选，默认 gpt-4o-mini
 *   AI_MATCH_TIMEOUT_MS  可选，默认 8000
 */
const storage = require('../storage/adapter');
const { compileKeywords } = require('./ruleLearner');

async function aiRefine({ title, description, scopeTags }) {
  const apiKey = storage.getSetting('ai_api_key') || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL = storage.getSetting('ai_base_url')
    || process.env.OPENAI_BASE_URL
    || 'https://api.openai.com/v1';
  const model = storage.getSetting('ai_model')
    || process.env.OPENAI_MODEL
    || 'gpt-4o-mini';
  const timeoutMs = parseInt(process.env.AI_MATCH_TIMEOUT_MS || '8000', 10);

  const systemPrompt = [
    '你是工程咨询公司的业务匹配助手。',
    '公司主营业务: 招标代理、工程监理、工程设计、工程勘察、造价咨询、全过程工程咨询、审计。',
    '不可做业务: 施工、EPC、工程总承包、专业分包、材料设备采购、纯货物采购、检测。',
    '',
    '请根据招标公告的标题和描述，返回 JSON:',
    '{ "tags": ["..."], "score": 0~1, "reason": "一句话说明", "isMatch": true/false }',
    '',
    '要求:',
    '- tags 从主营/不可做业务标签中选，可多个',
    '- score: 主营业务 0.7~1.0；部分可做 0.4~0.7；不可做 0~0.3',
    '- 文字含 "工程监理/造价/咨询/审计/设计/勘察/可研" 等关键词应判定为可做',
    '- 只返回 JSON，不要解释',
  ].join('\n');

  const userPrompt = [
    `标题: ${title || '(空)'}`,
    `描述: ${(description || '').slice(0, 800)}`,
    `当前算法 tag: ${(scopeTags || []).join(',') || '(无)'}`,
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.warn(`[ai-match] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags : scopeTags || [],
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : null,
      reason: parsed.reason || '',
      isMatch: !!parsed.isMatch,
    };
  } catch (e) {
    console.warn(`[ai-match] 调用失败: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 测试连通性：模拟一次最小请求，验 key + baseURL + model 是否能跑通
 * 入参显式传入（不读 storage），让"未保存的草稿"也能测
 * @param {{apiKey, baseURL, model, timeoutMs?}}
 * @returns {Promise<{ok: boolean, error?: string, latencyMs?: number}>}
 */
async function testAiConnection({ apiKey, baseURL, model, timeoutMs }) {
  if (!apiKey) return { ok: false, error: 'API Key 为空' };
  const url = `${(baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`;
  const modelName = model || 'gpt-4o-mini';
  const t = timeoutMs || parseInt(process.env.AI_MATCH_TIMEOUT_MS || '8000', 10);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), t);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, error: `HTTP ${res.status}: ${body}`, latencyMs: Date.now() - start };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? `超时(${t}ms)` : e.message, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- 混合入口 ----------------

/**
 * 综合匹配：算法 + AI（可选）
 * @returns {Promise<{scopeTags, businessMatch, projectProgress, matchScore, aiReason}>}
 */
async function matchAnnouncement({ title, description, item, useAI = true }) {
  const localTags = item?.scopeTags?.length
    ? item.scopeTags
    : inferScope([title, description].filter(Boolean).join(' '));
  const localScore = computeLocalScore(localTags, title);
  const business = inferBusinessMatch(localTags);
  const progress = inferProgress(item || {});

  if (!useAI) {
    return {
      scopeTags: localTags,
      businessMatch: business,
      projectProgress: progress,
      matchScore: localScore,
      aiReason: null,
    };
  }

  const ai = await aiRefine({ title, description, scopeTags: localTags });
  if (!ai || ai.score == null) {
    return {
      scopeTags: localTags,
      businessMatch: business,
      projectProgress: progress,
      matchScore: localScore,
      aiReason: ai?.reason || null,
    };
  }

  // AI 给分时：综合分 = 0.5 * 算法 + 0.5 * AI（平衡两者，避免任一极值）
  const finalScore = Number(((localScore * 0.5) + (ai.score * 0.5)).toFixed(3));
  // 业务判定以算法为准（更稳定），AI 只做分数加权
  return {
    scopeTags: ai.tags?.length ? ai.tags : localTags,
    businessMatch: business,
    projectProgress: progress,
    matchScore: finalScore,
    aiReason: ai.reason,
  };
}

module.exports = {
  IN_SCOPE,
  OUT_OF_SCOPE,
  WUHAN_DISTRICTS,
  parseDate,
  extractDistrict,
  inferScope,
  inferQual,
  inferNoticeType,
  inferBusinessMatch,
  inferProgress,
  compileKeywords,
  invalidateScopeRulesCache,
  invalidateQualRulesCache,
  invalidateNoticeTypeRulesCache,
  computeLocalScore,
  aiRefine,
  testAiConnection,
  matchAnnouncement,
  loadActiveScopeRules,
};