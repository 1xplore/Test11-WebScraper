/**
 * 后台 worker 入口
 *
 * POST /auto-batch  跑批处理 unresolved *_error_logs（mutationsOnlyAuth 保护）
 * GET  /queue-stats 队列大小（公开，给前端 dashboard 用）
 *
 * 自动 batch 是"自迭代"机制的最后一块拼图：
 *   - loop 1+2/3+4/6+7 给三个维度写了自迭代 learn 函数
 *   - 但都靠用户手动点按钮触发
 *   - 现在 worker 让系统自跑（生产环境应挂 cron，本 loop 只暴露手动 trigger）
 */
const express = require('express');
const autoBatch = require('../services/autoBatch');

const router = express.Router();

// GET /api/worker/queue-stats —— 各 *_error_logs 当前大小
router.get('/queue-stats', (req, res) => {
  res.json(autoBatch.queueStats());
});

// POST /api/worker/auto-batch  body: { types?, limit?, resolveOnApply? }
//   types:           array<'scope'|'qual'|'notice_type'> 默认全部
//   limit:           每类最多处理多少条（默认 5，防 token 超支）
//   resolveOnApply:  学成功的 error_log 是否自动 mark resolved=false 留人工审
//                    默认 false（让人工 / dashboard 看过再 mark）
router.post('/auto-batch', async (req, res) => {
  try {
    const result = await autoBatch.runAutoBatch(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
