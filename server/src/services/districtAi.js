/**
 * services/districtAi.js —— Loop 32 第四套 self-growth
 *
 * 平行 scopeAi / qualAi / noticeTypeAi，复用 ruleLearner
 * 从 announcement.address 字段提取 district
 * 失败原因写 district_error_logs
 *
 * 触发：本公告 address 字段未命中现有 district_rules 时
 * AI 输出 JSON: { matchExisting, district, keywords, reason }
 * 沉淀到 district_rules (priority=999, source='ai-learned')
 * 回写 announcement.district (JSON array)
 */
const storage = require('../storage/adapter');
const matching = require('./matching');
const ruleLearner = require('./ruleLearner');

const AI_LEARNED_PRIORITY = 999;
const AI_LEARNED_DISTRICT_SOURCE = 'ai-learned';

// Wuhan 22 districts + 主要街道
const DISTRICT_SCOPE = [
  '江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '青山区', '洪山区',
  '东西湖区', '汉南区', '蔡甸区', '江夏区', '黄陂区', '新洲区',
  '东湖高新区', '武汉经济技术开发区', '东湖风景区',
  '江汉经济开发区', '吴家山', '金银潭', '盘龙城', '滠口', '阳逻', '邾城',
];

async function learnDistrictFromMiss(announcementId) {
  const ann = storage.getAnnouncement(announcementId);
  if (!ann) {
    return { applied: false, reason: 'announcement_not_found', message: '公告不存在', error: 'announcement_not_found' };
  }

  const apiKey = storage.getSetting('ai_api_key') || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      applied: false,
      reason: 'no_ai_key',
      message: 'AI 未配置：Settings → AI 配置 填入 key 后再试',
      error: 'no_ai_key',
    };
  }
  const baseURL = storage.getSetting('ai_base_url')
    || process.env.OPENAI_BASE_URL
    || 'https://api.openai.com/v1';
  const model = storage.getSetting('ai_model')
    || process.env.OPENAI_MODEL
    || 'gpt-4o-mini';

  const existingRules = storage.listDistrictRules({ enabledOnly: true });
  const existingTags = [...new Set(existingRules.map((r) => r.tag))];
  const tagCounts = existingTags
    .map((t) => ({ tag: t, n: existingRules.filter((r) => r.tag === t).length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => `${x.tag}(${x.n})`)
    .join('、');

  // 输入：address 字段为主，title 兜底
  const address = (ann.address || '').trim();
  const text = address || ann.title || '';

  const systemPrompt = [
    '你是工程咨询领域地址解析助手。',
    `可用 district 列表 (共 ${DISTRICT_SCOPE.length} 项): ${DISTRICT_SCOPE.join('、')}`,
    `已有 district_rules tag 清单 (共 ${existingRules.length} 条): ${tagCounts || '(无)'}`,
    '',
    '任务：从公告的地址文本中提取行政区/街道名（必须是 district 列表内的，或已有的 tag）。',
    '返回 JSON：',
    '{ "matchExisting": <true|false>, "district": "<district>", "keywords": ["<kw1>"], "reason": "<一句话>" }',
    '',
    '硬约束：',
    '- keywords 必须字面命中地址文本（不能造词）',
    '- 每个 keyword 2~6 字，2~3 个足够（地址常用简称，如"东西湖"）',
    '- district 须在 SCOPE 列表或现有 tag 清单内',
    '- 不要解释，只返回 JSON',
  ].join('\n');

  const userPrompt = [
    `id: ${ann.id}`,
    `标题: ${ann.title || '(空)'}`,
    `地址: ${address || '(无)'}`,
  ].join('\n');

  let ai;
  try {
    ai = await ruleLearner.callOpenAI({
      apiKey, baseURL, model, systemPrompt, userPrompt,
      timeoutMs: parseInt(process.env.AI_LEARN_TIMEOUT_MS || '15000', 10),
    });
  } catch (e) {
    storage.writeDistrictErrorLog(ann.id, `ai_call_failed: ${e.message}`);
    return { applied: false, reason: 'ai_call_failed', error: e.message };
  }

  if (!ai || typeof ai !== 'object' || typeof ai.district !== 'string' || !Array.isArray(ai.keywords)) {
    storage.writeDistrictErrorLog(ann.id, `ai_bad_shape: ${JSON.stringify(ai).slice(0, 500)}`);
    return { applied: false, reason: 'ai_bad_shape' };
  }

  const verified = ruleLearner.verifyKeywords(ai.keywords, text);
  if (verified.length === 0) {
    storage.writeDistrictErrorLog(
      ann.id,
      `ai_no_verifiable: ai.district=${ai.district} ai.kw=${JSON.stringify(ai.keywords)}`
    );
    return { applied: false, reason: 'ai_no_verifiable' };
  }

  const finalTag = ai.district.trim();
  const allowed = new Set([...DISTRICT_SCOPE, ...existingTags]);
  if (!allowed.has(finalTag)) {
    storage.writeDistrictErrorLog(ann.id, `ai_tag_outside_whitelist: ${finalTag}`);
    return { applied: false, reason: 'ai_tag_outside_whitelist' };
  }

  let newRule;
  try {
    newRule = storage.createDistrictRule({
      priority: AI_LEARNED_PRIORITY,
      tag: finalTag,
      keywords: verified.join('|'),
      enabled: 1,
      source: AI_LEARNED_DISTRICT_SOURCE,
    });
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(e.message || '')) {
      // dedup 兜底
      return { applied: true, note: 'rule already exists (dedup)', rule_tag: finalTag };
    }
    throw e;
  }

  matching.invalidateDistrictRulesCache();
  storage.recordAILearnedHistory('district', finalTag, ann.id);

  // 落库后回写 announcements.district
  // announcements.district 是 JSON array 字段；用 storage.fromJsonArray 兼容
  const freshRules = storage.listDistrictRules({ enabledOnly: true });
  const newTags = matching.inferDistrict(text, ruleLearner.buildDynamicRules(freshRules));
  try {
    // 从 storage 模块拿 fromJsonArray 工具（不依赖 storage.export 检查）
    const fromJson = storage.fromJsonArray || ((x) => {
      try { return Array.isArray(JSON.parse(x || '[]')) ? JSON.parse(x || '[]') : []; } catch { return []; }
    });
    storage.db.prepare(
      'UPDATE announcements SET district = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(JSON.stringify(newTags || []), ann.id);
  } catch (_) { /* 不致命 — 规则已入 district_rules */ }

  return {
    applied: true,
    rule: { id: newRule.id, tag: finalTag, keywords: verified, source: AI_LEARNED_DISTRICT_SOURCE, priority: AI_LEARNED_PRIORITY },
    districtTags: newTags,
    reason: ai.reason || '',
  };
}

module.exports = {
  learnDistrictFromMiss,
  AI_LEARNED_PRIORITY,
  AI_LEARNED_DISTRICT_SOURCE,
  DISTRICT_SCOPE,
};
