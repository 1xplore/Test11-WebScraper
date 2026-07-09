/**
 * Express 入口
 *
 * 用法：
 *   node server/src/server.js
 *   PORT=4001 node server/src/server.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

require('./db');          // 触发 migrate
const statsRouter = require('./routes/stats');
const annRouter = require('./routes/announcements');
const platRouter = require('./routes/platforms');
const scopeRouter = require('./routes/scope-rules');
const qualRouter = require('./routes/qual-rules');
const noticeRouter = require('./routes/notice-rules');
const runsRouter = require('./routes/scrape-runs');
const errLogsRouter = require('./routes/error-logs');
const triggerRouter = require('./routes/scrape-trigger');
const authRouter = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const matching = require('./services/matching');
const storage = require('./storage/adapter');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), ai_enabled: aiEnabled() });
});

app.get('/api/enums', (req, res) => {
  res.json({
    business_match: ['主营业务可做', '部分可做', '不可做', '待评估'],
    review_status: ['A.未关注', 'A.关注中', 'H.已投标', 'X.已放弃', 'Y.未中标', 'Z.已中标'],
    project_progress: ['公告中', '报名截止', '开标中', '评标中', '中标公示', '已中标', '已流标', '已终止', '已结束'],
    notice_type: ['采购公告', '招标公告', '资格预审公告', '竞争性磋商公告', '公开招标', '公开公告', '竞争性磋商', '其他'],
    scrape_status: ['已抓取', '已审核', '已更新'],
    platform_status: ['已配置运行中', '有错误', '访问受限故停用', '已配置但停用'],
    in_scope_tags: [...matching.IN_SCOPE],
    out_scope_tags: [...matching.OUT_OF_SCOPE],
    wuhan_districts: matching.WUHAN_DISTRICTS,
  });
});

app.use('/api/stats', statsRouter);
app.use('/api/announcements', annRouter);
app.use('/api/platforms', platRouter);
app.use('/api/scope-rules', scopeRouter);
app.use('/api/qual-rules', qualRouter);
app.use('/api/notice-rules', noticeRouter);
app.use('/api/scrape-runs', runsRouter);
app.use('/api/error-logs', errLogsRouter);
app.use('/api/scrape-trigger', triggerRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);

app.use((err, req, res, next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

function aiEnabled() {
  return !!(storage.getSetting('ai_api_key') || process.env.OPENAI_API_KEY);
}

const PORT = parseInt(process.env.PORT || '4001', 10);
app.listen(PORT, () => {
  console.log(`\n[server] 招标线索 API listening on http://localhost:${PORT}`);
  console.log(`[server] AI 匹配: ${aiEnabled() ? '已启用' : '未启用（在 Settings → AI 配置 中填入 key）'}`);
});