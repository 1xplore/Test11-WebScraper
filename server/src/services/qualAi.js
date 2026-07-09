/**
 * 自迭代资质匹配 —— learnQualFromMiss
 *
 * 与 scopeAi.learnFromMiss 平行：同样的"AI 提 keyword + 字面验证 + 落库"管线，
 * 但目标是 qual_rules，prompt 关注点是"本公告要求哪种资质"。
 *
 * 触发：本公告 requirement 字段走 inferQual() 返回 ['未匹配'] 时
 *
 * 流程：
 *   1) 拉公告 + 读现有 enabled qual_rules
 *   2) 拼 prompt（资质标签集 + 现有 qual_rules.tag 清单）
 *   3) 调 LLM（OpenAI-compatible，配置见 system_settings）
 *   4) 验证 AI 给的 keywords 都字面命中公告 requirement 文本
 *   5) 创建 qual_rules 行（priority=999, source='ai-learned'）
 *   6) 失效缓存 + 写 qual_error_logs（用 ai_call_xxx reason 当 raw_text 截断）
 *
 * 与 scopeAi 的关键差异：
 *   - Tag 集合：聚焦资质（"工程咨询甲级|工程造价咨询甲级|..."）由 prompt 列出
 *   - 输入文本：announcement.requirement 为主、raw_text 兜底（不是 title+description）
 *   - 落库表：qual_rules（无 stop_on_match 列）
 *   - 缓存键：invalidateQualRulesCache
 *   - 不回写 announcement（announcements 没有 qual_tags 列；"学一次"产出只沉淀规则）
 */

const storage = require('../storage/adapter');
const matching = require('./matching');

const AI_LEARNED_QUAL_PRIORITY = 999;
const AI_LEARNED_QUAL_SOURCE = 'ai-learned';

// 给 LLM 看的资质标签集（参考业界常见的工程咨询/招标代理/审价类项目资质门槛）
// 这一组作为 initial seed —— AI 可以建议不在表里、但领域相关的新资质名。
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

function tagNormalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function reconcileTagName(aiTag, existingTags) {
  if (!aiTag) return null;
  const norm = tagNormalize(aiTag);
  const exact = existingTags.find((t) => tagNormalize(t) === norm);
  if (exact) return exact;
  const contains = existingTags.find(
    (t) => tagNormalize(t).includes(norm) || norm.includes(tagNormalize(t))
  );
  return contains || aiTag.trim();
}

function buildDynamicRules(rows) {
  return rows.map((r) => ({
    priority: r.priority,
    tag: r.tag,
    regex: matching.compileKeywords(r.keywords),
  }));
}

async function callOpenAI({ apiKey, baseURL, model, systemPrompt, userPrompt, timeoutMs }) {
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
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
      const body = (await res.text()).slice(0, 200);
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty response');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

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

  // 资质匹配看的是"本公告要求资质"的字段——优先 requirement，缺则用 raw_text
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
    '- 优先用现有 tag（matchExisting: true）；新增 tag 名也应当与 SCOPE 列表对齐',
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
    ai = await callOpenAI({
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

  const verified = (ai.keywords || [])
    .filter((kw) => typeof kw === 'string' && kw.length >= 2 && kw.length <= 30)
    .filter((kw) => text.includes(kw));

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

  const finalTag = reconcileTagName(ai.tag, existingTags);

  // F3 fix: QUAL_SCOPE 白名单 + existingTags 都是允许的；其它 AI 发明拒绝
  const allowedTagSet = new Set([...QUAL_SCOPE, ...existingTags]);
  if (!allowedTagSet.has(finalTag)) {
    storage.writeQualErrorLog(
      ann.id,
      `ai_tag_outside_whitelist: ai.tag=${ai.tag} reconciled=${finalTag} reason=${ai.reason || ''}`
    );
    return {
      applied: false,
      reason: 'ai_tag_outside_whitelist',
      message: `AI 提议的 tag "${finalTag}" 不在白名单（QUAL_SCOPE 27 项 + 现有规则 ${existingTags.length} 项）`,
      suggestion: { tag: ai.tag, keywords: ai.keywords, reason: ai.reason, matchExisting: ai.matchExisting },
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
      // F1 fix: 即便冲突（已存在规则），也回写 announcement.qual_tags 以让"自我覆盖"对用户可见
      const newRules = storage.listQualRules({ enabledOnly: true });
      const refreshedQualTags = matching.inferQual(text, buildDynamicRules(newRules));
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

  // F1 fix: 规则入库后，重跑 inferQual 并回写 announcement.qual_tags
  //         让"学一次 → 算法下次能自动覆盖"对用户可见
  const freshRules = storage.listQualRules({ enabledOnly: true });
  const refreshedQualTags = matching.inferQual(text, buildDynamicRules(freshRules));
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
