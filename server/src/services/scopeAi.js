/**
 * 自迭代匹配机制 —— AI 学一次、沉淀成 scope_rules
 *
 * 入口：learnFromMiss(announcementId)
 *
 * 流程（loop 5 重构后）：
 *   1) 拉公告 + 读现有 enabled scope_rules
 *   2) 拼 prompt → 调 LLM（ruleLearner.callOpenAI）
 *   3) AI 返回 -> ruleLearner.verifyKeywords 字面验证
 *   4) ruleLearner.reconcileWithWhitelist 强制 IN_SCOPE ∪ existingTags
 *   5) ruleLearner.checkAlreadyCovered 尊重 ai.matchExisting
 *   6) 创建 scope_rules（priority=999, source='ai-learned'）
 *   7) adapter 失效缓存 + 重算 scope_tags / business_match + 写回
 *
 * 失败模式统一走返回值，与 v1 一致
 */

const storage = require('../storage/adapter');
const matching = require('./matching');
const ruleLearner = require('./ruleLearner');

const AI_LEARNED_PRIORITY = 999;
const AI_LEARNED_SOURCE = 'ai-learned';

async function learnFromMiss(announcementId) {
  const ann = storage.getAnnouncement(announcementId);
  if (!ann) return { applied: false, reason: 'announcement_not_found' };

  const apiKey = storage.getSetting('ai_api_key') || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      applied: false,
      reason: 'no_ai_key',
      message: 'AI 未配置：Settings → AI 配置 填入 key 后再试',
    };
  }
  const baseURL = storage.getSetting('ai_base_url')
    || process.env.OPENAI_BASE_URL
    || 'https://api.openai.com/v1';
  const model = storage.getSetting('ai_model')
    || process.env.OPENAI_MODEL
    || 'gpt-4o-mini';

  const existingRules = storage.listScopeRules({ enabledOnly: true });
  const existingTags = [...new Set(existingRules.map((r) => r.tag))];
  const tagCounts = existingTags
    .map((t) => ({ tag: t, n: existingRules.filter((r) => r.tag === t).length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => `${x.tag}(${x.n})`)
    .join('、');
  const text = `${ann.title || ''}\n${ann.description || ann.raw_text || ''}`;

  const systemPrompt = [
    '你是工程咨询领域的招标公告匹配专家。',
    '公司主营 (IN_SCOPE): ' + [...matching.IN_SCOPE].join('、'),
    '不可做 (OUT_OF_SCOPE): ' + [...matching.OUT_OF_SCOPE].join('、'),
    '',
    `现有 tag 清单（共 ${existingRules.length} 条规则）: ${tagCounts || '(无)'}`,
    '',
    '任务：给定一条新招标公告，判断它应归到哪个 tag，并给出能让 regex 自动覆盖同类型公告的关键词。',
    '',
    '严格输出 JSON（无任何其它文字）：',
    '{ "matchExisting": <true|false>, "tag": "<tag 名>", "keywords": ["<kw1>", "<kw2>"], "reason": "<一句话>" }',
    '',
    '硬约束：',
    '- keywords **必须字面命中**公告正文（不能造词、不能改写、不能是同义词）',
    '- 每个关键词 2~6 字，2~4 个足够（单字容易误命中，禁止）',
    '- tag 须在主营/不可做 tag 集合或现有清单内，不要凭空发明同义 tag',
    '- 不要解释、不要寒暄，只返回 JSON',
  ].join('\n');

  const userPrompt = [
    `id: ${ann.id}`,
    `标题: ${ann.title || '(空)'}`,
    `描述: ${String(ann.description || ann.raw_text || '').slice(0, 800)}`,
  ].join('\n');

  // 1) AI 调用
  let ai;
  try {
    ai = await ruleLearner.callOpenAI({
      apiKey, baseURL, model,
      systemPrompt, userPrompt,
      timeoutMs: parseInt(process.env.AI_LEARN_TIMEOUT_MS || '15000', 10),
    });
  } catch (e) {
    storage.writeScopeErrorLog(ann.id, `ai_call_failed: ${e.message}`);
    return { applied: false, reason: 'ai_call_failed', error: e.message };
  }

  if (!ai || typeof ai !== 'object' || typeof ai.tag !== 'string' || !Array.isArray(ai.keywords)) {
    storage.writeScopeErrorLog(ann.id, `ai_bad_shape: ${JSON.stringify(ai).slice(0, 500)}`);
    return { applied: false, reason: 'ai_bad_shape' };
  }

  // 2) 关键词字面验证（ruleLearner 内统一 minLen=2）
  const verified = ruleLearner.verifyKeywords(ai.keywords, text);
  if (verified.length === 0) {
    storage.writeScopeErrorLog(
      ann.id,
      `ai_no_verifiable: ai.tag=${ai.tag} ai.kw=${JSON.stringify(ai.keywords)} reason=${ai.reason || ''}`
    );
    return {
      applied: false,
      reason: 'ai_no_verifiable',
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason, matchExisting: ai.matchExisting },
    };
  }

  // 3) whitelist reconcile（修 loop 1 F6 / loop 3 F3 同款问题）
  const wl = ruleLearner.reconcileWithWhitelist(ai.tag, {
    whitelist: [...matching.IN_SCOPE, ...matching.OUT_OF_SCOPE],
    existingTags,
  });
  if (!wl.allowed) {
    storage.writeScopeErrorLog(
      ann.id,
      `ai_tag_outside_whitelist: ai.tag=${ai.tag} reconciled=${wl.finalTag}`
    );
    return {
      applied: false,
      reason: 'ai_tag_outside_whitelist',
      message: `AI 提议的 tag "${wl.finalTag}" 不在白名单（IN/OUT_SCOPE 共 ${matching.IN_SCOPE.size + matching.OUT_OF_SCOPE.size} 项 + 现有 ${existingTags.length} 项）`,
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason },
    };
  }
  const finalTag = wl.finalTag;

  // 4) 尊重 ai.matchExisting（loop 1 F6 修复）
  const covered = ruleLearner.checkAlreadyCovered({
    ai, text, existingRules, forTag: finalTag,
  });
  if (covered.covered) {
    return {
      applied: true,
      note: 'already_covered',
      coveredBy: { id: covered.hitRule.id, tag: covered.hitRule.tag },
      matchedExisting: true,
      newTags: matching.inferScope(text, ruleLearner.buildDynamicRules(existingRules, { withStopOnMatch: true })),
      businessMatch: matching.inferBusinessMatch(
        matching.inferScope(text, ruleLearner.buildDynamicRules(existingRules, { withStopOnMatch: true }))
      ),
      reason: ai.reason || '',
    };
  }

  // 5) 落库（partial UNIQUE index 兜底并发去重）
  let newRule;
  try {
    newRule = storage.createScopeRule({
      priority: AI_LEARNED_PRIORITY,
      tag: finalTag,
      keywords: verified.join('|'),
      stop_on_match: 0,
      enabled: 1,
      source: AI_LEARNED_SOURCE,
    });
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(e.message || '')) {
      const existing = storage.listScopeRules({ enabledOnly: true })
        .find((r) => r.source === AI_LEARNED_SOURCE && r.tag === finalTag && r.keywords === verified.join('|'));
      if (!existing) throw e;
      return {
        applied: true,
        rule: { id: existing.id, tag: existing.tag, keywords: verified, source: AI_LEARNED_SOURCE, priority: AI_LEARNED_PRIORITY },
        matchedExisting: !!ai.matchExisting,
        newTags: matching.inferScope(text, ruleLearner.buildDynamicRules(existingRules, { withStopOnMatch: true })),
        businessMatch: matching.inferBusinessMatch(
          matching.inferScope(text, ruleLearner.buildDynamicRules(existingRules, { withStopOnMatch: true }))
        ),
        reason: ai.reason || '',
        note: 'rule already exists (dedup by partial unique index)',
      };
    }
    throw e;
  }

  // 6) 失效缓存 + 重算 + 写回
  matching.invalidateScopeRulesCache();
  const freshRows = storage.listScopeRules({ enabledOnly: true });
  const newTags = matching.inferScope(text, ruleLearner.buildDynamicRules(freshRows, { withStopOnMatch: true }));
  const businessMatch = matching.inferBusinessMatch(newTags);

  storage.patchAnnouncementScope(ann.id, {
    scope_tags: newTags,
    business_match: businessMatch,
  });

  return {
    applied: true,
    rule: { id: newRule.id, tag: finalTag, keywords: verified, source: AI_LEARNED_SOURCE, priority: AI_LEARNED_PRIORITY },
    matchedExisting: !!ai.matchExisting,
    newTags,
    businessMatch,
    reason: ai.reason || '',
  };
}

module.exports = {
  learnFromMiss,
  AI_LEARNED_PRIORITY,
  AI_LEARNED_SOURCE,
};
