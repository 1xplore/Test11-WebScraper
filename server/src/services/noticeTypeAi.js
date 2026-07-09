/**
 * 自迭代公告类型匹配 —— learnNoticeTypeFromMiss
 *
 * 第三套自迭代 (Loop 6)：复用 ruleLearner.js 9 个纯函数，针对 notice_type 自增长
 *
 * 当前 scraper 把 notice_type 硬塞（"采购公告"/"招标公告"/"资格预审公告"/...）
 * 但实际公告文本里充斥着多种称呼和官方 / 民间写法。本服务让 AI 看一段公告的
 * title + 采购方式字段，自动提议 type + 字面关键词 → 沉淀到 notice_type_rules，
 * 让下次同类公告自动命中。
 *
 * 注意：announcements.notice_type 是 ENUM 字段（已存在），本服务不动它
 * 也不写入它本身；只建议让 ai_type_tags 字段（新增 JSON）让用户看到 AI 沉淀
 */

const storage = require('../storage/adapter');
const matching = require('./matching');
const ruleLearner = require('./ruleLearner');
const { NOTICE_TYPE_SCOPE } = require('../constants/aiEnums');

const { AI_LEARNED_PRIORITY } = ruleLearner;
const AI_LEARNED_NOTICE_TYPE_SOURCE = 'ai-learned';

// NOTICE_TYPE_SCOPE 来源：constants/aiEnums.js（与 /api/enums 共享单一源）

async function learnNoticeTypeFromMiss(announcementId) {
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

  const existingRules = storage.listNoticeTypeRules({ enabledOnly: true });
  const existingTags = [...new Set(existingRules.map((r) => r.tag))];
  const tagCounts = existingTags
    .map((t) => ({ tag: t, n: existingRules.filter((r) => r.tag === t).length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => `${x.tag}(${x.n})`)
    .join('、');

  const text = `${ann.title || ''}\n${ann.description || ann.raw_text || ''}`.slice(0, 1000);

  const systemPrompt = [
    '你是工程咨询领域的招标公告分类专家。',
    '公告类型 SCOPE: ' + NOTICE_TYPE_SCOPE.join('、'),
    '',
    `现有 notice_type_rules tag 清单（共 ${existingRules.length} 条规则）: ${tagCounts || '(无)'}`,
    '',
    '任务：阅读公告文本，判断它属于哪种公告类型 tag，并给出能让 regex 自动覆盖同类公告的关键词。',
    '',
    '严格输出 JSON（无任何其它文字）：',
    '{ "matchExisting": <true|false>, "tag": "<type>", "keywords": ["<kw1>", "<kw2>"], "reason": "<一句话>" }',
    '',
    '硬约束：',
    '- keywords **必须字面命中**公告正文（不能造词、不能改写）',
    '- 每个关键词 2~6 字，2~4 个足够',
    '- tag 须在 SCOPE 列表或现有 tag 清单内，不要凭空发明',
    '- 不要解释、不要寒暄，只返回 JSON',
  ].join('\n');

  const userPrompt = [
    `id: ${ann.id}`,
    `公告类型（scraper 当前判断，仅参考）: ${ann.notice_type || '(空)'}`,
    `标题: ${ann.title || '(空)'}`,
    `描述: ${String(ann.description || ann.raw_text || '').slice(0, 800)}`,
  ].join('\n');

  let ai;
  try {
    ai = await ruleLearner.callOpenAI({
      apiKey, baseURL, model,
      systemPrompt, userPrompt,
      timeoutMs: parseInt(process.env.AI_LEARN_TIMEOUT_MS || '15000', 10),
    });
  } catch (e) {
    storage.writeNoticeTypeErrorLog(ann.id, `ai_call_failed: ${e.message}`);
    return { applied: false, reason: 'ai_call_failed', message: `AI 调用失败：${e.message}`, error: e.message };
  }

  if (!ai || typeof ai !== 'object' || typeof ai.tag !== 'string' || !Array.isArray(ai.keywords)) {
    storage.writeNoticeTypeErrorLog(ann.id, `ai_bad_shape: ${JSON.stringify(ai).slice(0, 500)}`);
    return { applied: false, reason: 'ai_bad_shape', message: 'AI 返回格式异常，需重新尝试', error: 'ai_bad_shape' };
  }

  const verified = ruleLearner.verifyKeywords(ai.keywords, text);
  if (verified.length === 0) {
    storage.writeNoticeTypeErrorLog(
      ann.id,
      `ai_no_verifiable: ai.tag=${ai.tag} ai.kw=${JSON.stringify(ai.keywords)} reason=${ai.reason || ''}`
    );
    return {
      applied: false,
      reason: 'ai_no_verifiable',
      message: 'AI 提议的关键词都不能字面命中本公告，请人工审核',
      error: 'ai_no_verifiable',
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason, matchExisting: ai.matchExisting },
    };
  }

  const wl = ruleLearner.reconcileWithWhitelist(ai.tag, {
    whitelist: NOTICE_TYPE_SCOPE,
    existingTags,
  });
  if (!wl.allowed) {
    storage.writeNoticeTypeErrorLog(
      ann.id,
      `ai_tag_outside_whitelist: ai.tag=${ai.tag} reconciled=${wl.finalTag}`
    );
    return {
      applied: false,
      reason: 'ai_tag_outside_whitelist',
      message: `AI 提议的 type "${wl.finalTag}" 不在 SCOPE 列表`,
      error: 'ai_tag_outside_whitelist',
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason },
    };
  }
  const finalTag = wl.finalTag;

  const covered = ruleLearner.checkAlreadyCovered({
    ai, text, existingRules, forTag: finalTag,
  });
  if (covered.covered) {
    const newTags = matching.inferNoticeType(text, ruleLearner.buildDynamicRules(existingRules));
    storage.patchAnnouncementNoticeType(ann.id, newTags);
    return {
      applied: true,
      note: 'already_covered',
      coveredBy: { id: covered.hitRule.id, tag: covered.hitRule.tag },
      matchedExisting: true,
      noticeTypeTags: newTags,
      reason: ai.reason || '',
    };
  }

  let newRule;
  try {
    newRule = storage.createNoticeTypeRule({
      priority: AI_LEARNED_PRIORITY,
      tag: finalTag,
      keywords: verified.join('|'),
      enabled: 1,
      source: AI_LEARNED_NOTICE_TYPE_SOURCE,
    });
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(e.message || '')) {
      const existing = storage.listNoticeTypeRules({ enabledOnly: true })
        .find((r) => r.source === AI_LEARNED_NOTICE_TYPE_SOURCE && r.tag === finalTag && r.keywords === verified.join('|'));
      if (!existing) throw e;
      const newRules = storage.listNoticeTypeRules({ enabledOnly: true });
      const newTags = matching.inferNoticeType(text, ruleLearner.buildDynamicRules(newRules));
      storage.patchAnnouncementNoticeType(ann.id, newTags);
      return {
        applied: true,
        rule: { id: existing.id, tag: existing.tag, keywords: verified, source: AI_LEARNED_NOTICE_TYPE_SOURCE, priority: AI_LEARNED_PRIORITY },
        matchedExisting: !!ai.matchExisting,
        noticeTypeTags: newTags,
        reason: ai.reason || '',
        note: 'rule already exists (dedup by partial unique index)',
      };
    }
    throw e;
  }

  const freshRules = storage.listNoticeTypeRules({ enabledOnly: true });
  const newTags = matching.inferNoticeType(text, ruleLearner.buildDynamicRules(freshRules));
  storage.patchAnnouncementNoticeType(ann.id, newTags);

  return {
    applied: true,
    rule: { id: newRule.id, tag: finalTag, keywords: verified, source: AI_LEARNED_NOTICE_TYPE_SOURCE, priority: AI_LEARNED_PRIORITY },
    matchedExisting: !!ai.matchExisting,
    noticeTypeTags: newTags,
    reason: ai.reason || '',
  };
}

module.exports = {
  learnNoticeTypeFromMiss,
  AI_LEARNED_NOTICE_TYPE_SOURCE,
  NOTICE_TYPE_SCOPE,
};
