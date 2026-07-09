/**
 * 全局 auth 中间件 —— loop 9 立项（loop 1 F3 + loop 3/6/7/8 累积债务）
 *
 * 策略（首版保守）：
 *   - 仅对 mutation 端点（POST/PATCH/DELETE）做强制认证
 *   - GET 全部开放（前端 boot、列表、详情等高频读不应卡登录）
 *   - 401 走标准 JSON 形态：{ error: 'Unauthorized', reason: '...' }
 *   - token 来源：Authorization: Bearer <token>（与现有 /api/auth/* 一致）
 *
 * 不引 RBAC / 权限分级 / rate-limit（项目级债，loop 10+ 视情况）
 */

const storage = require('../storage/adapter');

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
}

/**
 * Express middleware：req 上挂 user，没有就 401
 * 用法：app.use('/api/...', requireAuth)   或   router.post('/x', requireAuth, handler)
 */
function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', reason: 'missing_bearer_token' });
  }
  const user = storage.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', reason: 'invalid_token' });
  }
  req.user = user;
  next();
}

/**
 * GET 全开放 / 写入必须 token —— 把 requireAuth 包一层"method 判定"
 * 这样 app.use('/api/x', mutationsOnlyAuth, xRouter) 一行挂整套，不用逐条改 router
 */
function mutationsOnlyAuth(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  return requireAuth(req, res, next);
}

module.exports = {
  requireAuth,
  mutationsOnlyAuth,
  getBearerToken,
};
