/**
 * 系统设置路由 —— 当前只有 AI 配置一项
 *
 * 设计要点（参考 test8-pay-track）：
 *   - GET 不返回 key 真值（用 hasApiKey 标识）
 *   - PUT 仅在 apiKey 非空时写入；clearApiKey=true 显式删除
 *   - 测试连接端点不入库，临时组合 config 调一次
 *   - 不强制鉴权（与项目其它 mutation 端点一致）
 */
const express = require('express');
const storage = require('../storage/adapter');
const matching = require('../services/matching');

const router = express.Router();

const AI_KEYS = {
  provider: 'ai_provider',
  baseUrl: 'ai_base_url',
  model: 'ai_model',
  apiKey: 'ai_api_key',
};

function loadAiConfig() {
  const provider = storage.getSetting(AI_KEYS.provider) || 'openai-compatible';
  const baseUrl = storage.getSetting(AI_KEYS.baseUrl) || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = storage.getSetting(AI_KEYS.model) || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const realKey = storage.getSetting(AI_KEYS.apiKey) || process.env.OPENAI_API_KEY || '';
  return {
    provider,
    baseUrl,
    model,
    hasApiKey: !!realKey,
    maskedKey: realKey ? storage.maskApiKey(realKey) : '',
    source: {
      provider: storage.getSetting(AI_KEYS.provider) ? 'db' : (process.env.OPENAI_BASE_URL ? 'env' : 'default'),
      apiKey: storage.getSetting(AI_KEYS.apiKey) ? 'db' : (process.env.OPENAI_API_KEY ? 'env' : 'none'),
    },
  };
}

// GET /api/settings/ai
router.get('/ai', (req, res) => {
  res.json(loadAiConfig());
});

// PUT /api/settings/ai   body: { provider?, baseUrl?, model?, apiKey?, clearApiKey? }
router.put('/ai', (req, res) => {
  const { provider, baseUrl, model, apiKey, clearApiKey } = req.body || {};
  const userId = resolveUserFromToken(req)?.id || null;

  if (provider !== undefined && provider !== '') storage.setSetting(AI_KEYS.provider, provider, userId);
  if (baseUrl !== undefined && baseUrl !== '') storage.setSetting(AI_KEYS.baseUrl, baseUrl, userId);
  if (model !== undefined && model !== '') storage.setSetting(AI_KEYS.model, model, userId);

  if (clearApiKey === true) {
    storage.deleteSetting(AI_KEYS.apiKey);
  } else if (typeof apiKey === 'string' && apiKey.length > 0) {
    storage.setSetting(AI_KEYS.apiKey, apiKey, userId);
  }  // 空字符串 / 缺省：保持现有（write-only 心智）

  res.json(loadAiConfig());
});

// POST /api/settings/ai/test  body: { provider?, baseUrl?, model?, apiKey? }
// 缺省时用当前 DB/env 已生效的 config；可测"草稿"
router.post('/ai/test', async (req, res) => {
  const current = loadAiConfig();
  const body = req.body || {};
  const apiKey = (typeof body.apiKey === 'string' && body.apiKey.length > 0)
    ? body.apiKey
    : (storage.getSetting(AI_KEYS.apiKey) || process.env.OPENAI_API_KEY || '');
  const baseURL = body.baseUrl || current.baseUrl;
  const model = body.model || current.model;
  const result = await matching.testAiConnection({ apiKey, baseURL, model });
  res.json(result);
});

function resolveUserFromToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return storage.getUserByToken(h.slice(7).trim());
}

module.exports = router;
