/**
 * 用户认证（最简版）
 *
 * 设计：无密码，POST /api/auth/login { username } → 返回 token
 *       前端把 token 存 localStorage，每次请求带 Authorization: Bearer <token>
 *       reviewedBy 从 token 反查得到 user
 */
const express = require('express');
const storage = require('../storage/adapter');

const router = express.Router();

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

router.get('/me', (req, res) => {
  const user = storage.getUserByToken(getBearerToken(req));
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ id: user.id, username: user.username, display_name: user.display_name });
});

router.post('/login', (req, res) => {
  const username = (req.body?.username || '').trim().slice(0, 50);
  if (!username) return res.status(400).json({ error: 'username 必填' });
  const user = storage.findOrCreateUser(username);
  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    token: user.token,
  });
});

router.get('/users', (req, res) => {
  res.json(storage.listUsers());
});

module.exports = router;