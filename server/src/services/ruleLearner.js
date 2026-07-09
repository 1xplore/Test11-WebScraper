/**
 * 通用规则学习工具 —— RuleLearner
 *
 * 被 scopeAi / qualAi 共用的纯函数集合。loop 3 audit F5 指出 ~80 行重复；
 * loop 1 audit F11 指出 NFKC 没在 scopeAi 内统一；
 * loop 1+3 audit F6/F3 指出 matchExisting / whitelist 没被尊重。
 *
 * 本模块只放纯逻辑，不绑定任何具体业务（拿不到 storage、也不读 env）。
 * 调用方负责：拉公告、拼 prompt、写规则、回写 announcement。
 */

const fs = require('fs');
const path = require('path');

// ---------------- 常量 ----------------

/**
 * AI 沉淀规则统一优先级：放在所有 seed / manual 之后才匹配
 * 这样系统已沉淀的 tag 永远先命中，新学规则只补"系统没覆盖"的边界
 */
const AI_LEARNED_PRIORITY = 999;

// ---------------- 工具 ----------------

/**
 * Unicode NFKC + 去空白 + 小写 —— tag 归一化的标准做法
 * 修 loop 1 audit F11（scopeAi 未做 NFKC，本模块统一）
 */
function tagNormalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 把 "EPC|设计施工|..." -> /EPC|设计施工|.../
 * 元字符全 escape（reDoS 防御）
 */
function compileKeywords(kwStr) {
  const parts = String(kwStr).split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return /(?!.)/;  // 永不匹配
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('|'));
}

/**
 * 把 storage.list*Rules(rows) 输出编译成运行时 regex 对象列表
 * @param {Array<{priority, tag, keywords, stop_on_match?}>} rows
 * @param {{withStopOnMatch?: boolean}} opts   scope 要 stopOnMatch, qual 不要
 */
function buildDynamicRules(rows, { withStopOnMatch = false } = {}) {
  return rows.map((r) => {
    const out = {
      priority: r.priority,
      tag: r.tag,
      regex: compileKeywords(r.keywords),
    };
    if (withStopOnMatch) out.stopOnMatch = !!r.stop_on_match;
    return out;
  });
}

/**
 * 关键词字面验证 + 长度过滤（修 loop 1 audit F5：minLen=2，禁止单字幻觉）
 * @returns {string[]} 命中的关键词（顺序稳定）
 */
function verifyKeywords(kws, text, { minLen = 2, maxLen = 30 } = {}) {
  if (!Array.isArray(kws)) return [];
  return kws.filter((kw) => {
    if (typeof kw !== 'string') return false;
    if (kw.length < minLen || kw.length > maxLen) return false;
    return text.includes(kw);
  });
}

/**
 * 把 AI 给的 tag 名 reconcile 到已有 tag 之一 / 兜底 aiTag.trim()
 * 仅做归一化合并，不判断"允许不允许"（那是 isTagWhitelisted 的职责）
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

/**
 * 修 loop 3 audit F3 —— whitelist 强制：tag 必须在 allowList（白名单 + 现有 tag）内
 * 缺此检查 AI 可自由发明污染字典
 * @param {string} aiTag
 * @param {string[]} whitelist    业务允许的 tag 集（如 QUAL_SCOPE 或 matching.IN_SCOPE）
 * @param {string[]} existingTags 当前 DB 已有 tag（含 ai-learned）
 * @returns {{allowed: boolean, finalTag: string|null, reason?: string}}
 */
function reconcileWithWhitelist(aiTag, { whitelist, existingTags }) {
  const finalTag = reconcileTagName(aiTag, existingTags);
  if (!finalTag) return { allowed: false, finalTag: null, reason: 'empty_tag' };
  const allowed = new Set([...(whitelist || []), ...(existingTags || [])]);
  if (allowed.has(finalTag)) return { allowed: true, finalTag };
  return { allowed: false, finalTag, reason: 'tag_not_in_whitelist' };
}

/**
 * 修 loop 1 audit F6 / loop 3 audit F6 —— 尊重 ai.matchExisting 字段
 * 当 AI 自报 matchExisting=true 且现有规则能命中 → 视为已覆盖，不重复写
 *
 * 性能：内部以 existingRules → 内联 compile（每次 O(N) 创建 regex）；对几百条规则够用
 * 未来规则库膨胀再考虑 memo
 *
 * @returns {{covered: boolean, hitRule?: object}}
 */
function checkAlreadyCovered({ ai, text, existingRules, forTag }) {
  if (!ai || ai.matchExisting !== true) return { covered: false };
  const hit = existingRules.find((r) => {
    if (forTag && r.tag !== forTag) return false;
    try {
      const re = compileKeywords(r.keywords);
      return re.test(text);
    } catch {
      return false;
    }
  });
  return hit ? { covered: true, hitRule: hit } : { covered: false };
}

// ---------------- LLM 调用 ----------------

/**
 * OpenAI-compatible 一次性 chat call —— 严格 timeout / AbortController
 * 超时返回 Error message 含 "超时" 字样；HTTP !2xx 抛 Error；JSON 解析失败抛
 * 与 matching.aiRefine 同款实现，独立副本的好处是不会让 ruleLearner 依赖 services/
 */
async function callOpenAI({ apiKey, baseURL, model, systemPrompt, userPrompt, timeoutMs = 8000 }) {
  const url = `${(baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`;
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
        model: model || 'gpt-4o-mini',
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

/**
 * 读顶层 system prompt 的辅助：把项目根 .claude 的某个 md 文件片段注入。
 * 不影响主流程，调用方自决。
 */
function readProjectDoc(relPath) {
  try {
    return fs.readFileSync(path.join(__dirname, '../../../../', relPath), 'utf8').slice(0, 2000);
  } catch {
    return null;
  }
}

module.exports = {
  // 全局常量：AI 沉淀规则的优先级（最低，原生 seed 跑完后才匹配）
  AI_LEARNED_PRIORITY,
  tagNormalize,
  compileKeywords,
  buildDynamicRules,
  verifyKeywords,
  reconcileTagName,
  reconcileWithWhitelist,
  checkAlreadyCovered,
  callOpenAI,
  readProjectDoc,
};
