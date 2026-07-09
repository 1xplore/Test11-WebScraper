/**
 * 自迭代资质匹配 —— learnQualFromMiss
 *
 * Loop 5 重构后，与 scopeAi.learnFromMiss 用同一套 ruleLearner 工具。
 * 业务差异点仅在：
 *   - 字段：announcement.requirement 优先，raw_text 兜底
 *   - whitelist：QUAL_SCOPE 27 项 + existingTags
 *   - 落库表：qual_rules
 *   - 写回：announcement.qual_tags（自迭代回写，让用户可见）
 *   - 无 stop_on_match 列
 */

const storage = require('../storage/adapter');
const matching = require('./matching');
const ruleLearner = require('./ruleLearner');

const AI_LEARNED_QUAL_PRIORITY = 999;
const AI_LEARNED_QUAL_SOURCE = 'ai-learned';

const QUAL_SCOPE = new Set([
  '工程咨询甲级', '工程咨询乙级', '工程咨询丙级',
  '工程造价咨询甲级', '工程造价咨询乙级',
  '工程监理甲级', '工程监理乙级', '工程监理丙级',
  '工程设计甲级', '工程设计乙级', '工程设计丙级',
  '工程勘察甲级', '工程勘察乙级', '工程勘察丙级',
  '工程招标代理甲级', '工程招标代理乙级', '工程招标代理丙级',
  '会计师事务所执业证书', '审计资质',
  '土地评估资质', '房地产估价资质', '矿业权评估资质',
  '建筑装饰设计甲级', '建筑装饰设计乙级',
  'ISO9001', 'ISO14001', 'ISO45001',
]);

async function learnQualFromMiss(announcementId) {
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

  const existingRules = storage.listQualRules({ enabledOnly: true });
  const existingTags = [...new Set(existingRules.map((r) => r.tag))];
  const tagCounts = existingTags
    .map((t) => ({ tag: t, n: existingRules.filter((r) => r.tag === t).length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => `${x.tag}(${x.n})`)
    .join('、');

  const reqText = (ann.requirement || '').trim();
  const baseText = (ann.raw_text || '').trim();
  let text;
  let textSource;
  if (reqText) {
    text = reqText; textSource = 'requirement';
  } else if (baseText) {
    text = baseText.slice(0, 800); textSource = 'raw_text';
  } else {
    return { applied: false, reason: 'no_requirement_text', message: '公告无 requirement 文本可分析' };
  }

  const systemPrompt = [
    '你是工程咨询领域的招标公告资质匹配专家。',
    '常见资质类别 (SCOPE): ' + [...QUAL_SCOPE].join('、'),
    '',
    `现有 qual_rules tag 清单（共 ${existingRules.length} 条规则）: ${tagCounts || '(无)'}`,
    '',
    '任务：阅读公告的资质要求文本，判断它应归到哪个资质类别 tag，并给出能让 regex 自动覆盖同类公告的关键词。',
    '',
    '严格输出 JSON（无任何其它文字）：',
    '{ "matchExisting": <true|false>, "tag": "<资质 tag>", "keywords": ["<kw1>", "<kw2>"], "reason": "<一句话>" }',
    '',
    '硬约束：',
    '- keywords **必须字面命中**资质要求文本（不能造词、不能改写、不能是同义词）',
    '- 每个关键词 2~8 字，2~4 个足够（行业资质名词较长是正常的）',
    '- tag 须在 SCOPE 列表或现有 tag 清单内，不要凭空发明',
    '- 不要解释、不要寒暄，只返回 JSON',
  ].join('\n');

  const userPrompt = [
    `id: ${ann.id}`,
    `标题（参考）: ${ann.title || '(空)'}`,
    `[${textSource} 字段]:`,
    text.slice(0, 1200),
  ].join('\n');

  let ai;
  try {
    ai = await ruleLearner.callOpenAI({
      apiKey, baseURL, model,
      systemPrompt, userPrompt,
      timeoutMs: parseInt(process.env.AI_LEARN_TIMEOUT_MS || '15000', 10),
    });
  } catch (e) {
    storage.writeQualErrorLog(ann.id, `ai_call_failed: ${e.message}`);
    return { applied: false, reason: 'ai_call_failed', error: e.message };
  }

  if (!ai || typeof ai !== 'object' || typeof ai.tag !== 'string' || !Array.isArray(ai.keywords)) {
    storage.writeQualErrorLog(ann.id, `ai_bad_shape: ${JSON.stringify(ai).slice(0, 500)}`);
    return { applied: false, reason: 'ai_bad_shape' };
  }

  const verified = ruleLearner.verifyKeywords(ai.keywords, text);
  if (verified.length === 0) {
    storage.writeQualErrorLog(
      ann.id,
      `ai_no_verifiable: ai.tag=${ai.tag} ai.kw=${JSON.stringify(ai.keywords)} reason=${ai.reason || ''}`
    );
    return {
      applied: false,
      reason: 'ai_no_verifiable',
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason, matchExisting: ai.matchExisting },
    };
  }

  const wl = ruleLearner.reconcileWithWhitelist(ai.tag, {
    whitelist: [...QUAL_SCOPE],
    existingTags,
  });
  if (!wl.allowed) {
    storage.writeQualErrorLog(
      ann.id,
      `ai_tag_outside_whitelist: ai.tag=${ai.tag} reconciled=${wl.finalTag}`
    );
    return {
      applied: false,
      reason: 'ai_tag_outside_whitelist',
      message: `AI 提议的 tag "${wl.finalTag}" 不在白名单（QUAL_SCOPE ${QUAL_SCOPE.size} 项 + 现有 ${existingTags.length} 项）`,
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason },
    };
  }
  const finalTag = wl.finalTag;

  // 尊重 ai.matchExisting（loop 1 F6 / loop 3 F6 同款问题）
  const covered = ruleLearner.checkAlreadyCovered({
    ai, text, existingRules, forTag: finalTag,
  });
  if (covered.covered) {
    return {
      applied: true,
      note: 'already_covered',
      coveredBy: { id: covered.hitRule.id, tag: covered.hitRule.tag },
      matchedExisting: true,
      textSource,
      qualTags: matching.inferQual(text, ruleLearner.buildDynamicRules(existingRules)),
      reason: ai.reason || '',
    };
  }

  let newRule;
  try {
    newRule = storage.createQualRule({
      priority: AI_LEARNED_QUAL_PRIORITY,
      tag: finalTag,
      keywords: verified.join('|'),
      enabled: 1,
      source: AI_LEARNED_QUAL_SOURCE,
    });
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(e.message || '')) {
      const existing = storage.listQualRules({ enabledOnly: true })
        .find((r) => r.source === AI_LEARNED_QUAL_SOURCE && r.tag === finalTag && r.keywords === verified.join('|'));
      if (!existing) throw e;
      const newRules = storage.listQualRules({ enabledOnly: true });
      const refreshedQualTags = matching.inferQual(text, ruleLearner.buildDynamicRules(newRules));
      storage.patchAnnouncementQual(ann.id, refreshedQualTags);
      return {
        applied: true,
        rule: { id: existing.id, tag: existing.tag, keywords: verified, source: AI_LEARNED_QUAL_SOURCE, priority: AI_LEARNED_QUAL_PRIORITY },
        matchedExisting: !!ai.matchExisting,
        textSource,
        qualTags: refreshedQualTags,
        reason: ai.reason || '',
        note: 'rule already exists (dedup by partial unique index)',
      };
    }
    throw e;
  }

  // 落库成功 → 重算并回写 announcement.qual_tags
  const freshRules = storage.listQualRules({ enabledOnly: true });
  const refreshedQualTags = matching.inferQual(text, ruleLearner.buildDynamicRules(freshRules));
  storage.patchAnnouncementQual(ann.id, refreshedQualTags);

  return {
    applied: true,
    rule: { id: newRule.id, tag: finalTag, keywords: verified, source: AI_LEARNED_QUAL_SOURCE, priority: AI_LEARNED_QUAL_PRIORITY },
    matchedExisting: !!ai.matchExisting,
    textSource,
    qualTags: refreshedQualTags,
    reason: ai.reason || '',
  };
}

module.exports = {
  learnQualFromMiss,
  AI_LEARNED_QUAL_PRIORITY,
  AI_LEARNED_QUAL_SOURCE,
  QUAL_SCOPE,
};
