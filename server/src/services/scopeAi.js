/**
 * 自迭代匹配机制 —— AI 学一次、沉淀成规则
 *
 * 入口：learnFromMiss(announcementId)
 *
 * 流程：
 *   1) 拉公告 + 读现有 enabled scope_rules
 *   2) 拼 prompt → 调 LLM（OpenAI-compatible，配置见 system_settings）
 *   3) 验证 AI 给出的 keywords 都字面命中文本
 *   4) 创建 scope_rules 行（priority=999, source='ai-learned'）
 *   5) 失效缓存 + 重算公告的 scope_tags / business_match + 写回
 *
 * 失败模式（不抛异常，统一走返回值）：
 *   - no_ai_key           AI 未配置
 *   - ai_call_failed      LLM 调用挂掉（写 scope_error_logs）
 *   - ai_bad_shape        返回值 JSON 字段缺失（写错误日志）
 *   - ai_no_verifiable    keywords 全是幻觉（写错误日志）
 */

const storage = require('../storage/adapter');
const matching = require('./matching');

const AI_LEARNED_PRIORITY = 999;
const AI_LEARNED_SOURCE = 'ai-learned';

function tagNormalize(s) {
  return String(s || '')
    .normalize('NFKC')               // 繁/简/全角半角归一
    .replace(/\s+/g, '')             // 去空白
    .toLowerCase();
}

/**
 * 把 AI 给的 tag 名归一化到已有 tag —— 简单的包含匹配
 * 优先 exact，其次 A 含 B 或 B 含 A（任一方向）
 */
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
    stopOnMatch: !!r.stop_on_match,
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

async function learnFromMiss(announcementId) {
  const ann = storage.getAnnouncement(announcementId);
  if (!ann) {
    return { applied: false, reason: 'announcement_not_found' };
  }

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
  // tag count 仅作信号，不传关键词全文（控制 prompt 体量 + 防 AI 误把老 seed 当 canonical）
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
    '- 已有 tag 能用就用现有（matchExisting: true），不要凭空创造同义 tag',
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
    ai = await callOpenAI({
      apiKey, baseURL, model,
      systemPrompt, userPrompt,
      timeoutMs: parseInt(process.env.AI_LEARN_TIMEOUT_MS || '15000', 10),
    });
  } catch (e) {
    storage.writeScopeErrorLog(ann.id, `ai_call_failed: ${e.message}`);
    return { applied: false, reason: 'ai_call_failed', error: e.message };
  }

  // 2) 校验返回结构
  if (!ai || typeof ai !== 'object' || typeof ai.tag !== 'string' || !Array.isArray(ai.keywords)) {
    storage.writeScopeErrorLog(ann.id, `ai_bad_shape: ${JSON.stringify(ai).slice(0, 500)}`);
    return { applied: false, reason: 'ai_bad_shape' };
  }

  // 3) 关键词全字面命中验证（任何不在文本里的丢掉；全丢光就失败）
  const verified = (ai.keywords || [])
    .filter((kw) => typeof kw === 'string' && kw.length >= 2 && kw.length <= 30)
    .filter((kw) => text.includes(kw));

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

  // 4) tag 归一化（避免 AI 说"审计"、系统已有"审计服务"造成两个 tag）
  const finalTag = reconcileTagName(ai.tag, existingTags);

  // 5) 落库（partial UNIQUE index 兜底并发去重，撞重了返回现有规则）
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
    // SQLite UNIQUE constraint failed → 已被并发 / 二次学习写过
    if (/UNIQUE constraint failed/i.test(e.message || '')) {
      const existing = storage.listScopeRules({ enabledOnly: true })
        .find((r) => r.source === AI_LEARNED_SOURCE && r.tag === finalTag && r.keywords === verified.join('|'));
      if (!existing) throw e;
      return {
        applied: true,
        rule: { id: existing.id, tag: existing.tag, keywords: verified, source: AI_LEARNED_SOURCE, priority: AI_LEARNED_PRIORITY },
        matchedExisting: !!ai.matchExisting,
        newTags: matching.inferScope(
          `${ann.title || ''}\n${ann.description || ann.raw_text || ''}`,
          buildDynamicRules(storage.listScopeRules({ enabledOnly: true }))
        ),
        businessMatch: matching.inferBusinessMatch(
          matching.inferScope(
            `${ann.title || ''}\n${ann.description || ann.raw_text || ''}`,
            buildDynamicRules(storage.listScopeRules({ enabledOnly: true }))
          )
        ),
        reason: ai.reason || '',
        note: 'rule already exists (dedup by partial unique index)',
      };
    }
    throw e;
  }

  // 6) 失效缓存 + 重算
  matching.invalidateScopeRulesCache();
  const freshRows = storage.listScopeRules({ enabledOnly: true });
  const dynamicRules = buildDynamicRules(freshRows);
  const newTags = matching.inferScope(text, dynamicRules);
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
