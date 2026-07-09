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
const { NOTICE_TYPE_SCOPE } = require('./constants/aiEnums');

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
  // Loop 19: 暴露 seed 统计，让前端能看到"哪些 tag 是系统自带 vs AI 学过的"
  // —— seed 命中率高 → "AI 学一下" 按钮不值得老按
  const seedCounts = {
    scope: storage.listScopeRules().filter((r) => r.source === 'seed').length,
    qual: storage.listQualRules().filter((r) => r.source === 'seed').length,
    notice_type: storage.listNoticeTypeRules().filter((r) => r.source === 'seed').length,
  };
  res.json({
    business_match: ['主营业务可做', '部分可做', '不可做', '待评估'],
    review_status: ['A.未关注', 'A.关注中', 'H.已投标', 'X.已放弃', 'Y.未中标', 'Z.已中标'],
    project_progress: ['公告中', '报名截止', '开标中', '评标中', '中标公示', '已中标', '已流标', '已终止', '已结束'],
    notice_type: [...NOTICE_TYPE_SCOPE],
    scrape_status: ['已抓取', '已审核', '已更新'],
    platform_status: ['已配置运行中', '有错误', '访问受限故停用', '已配置但停用'],
    in_scope_tags: [...matching.IN_SCOPE],
    out_scope_tags: [...matching.OUT_OF_SCOPE],
    wuhan_districts: matching.WUHAN_DISTRICTS,
    seed_counts: seedCounts,
    // Loop 19 顺手把 {qual, notice_type}_tags 命中 tags 也列出来便于 UI
    qual_tags_with_seed: storage.listQualRules({ enabledOnly: true })
      .filter((r) => r.source === 'seed')
      .map((r) => r.tag),
    notice_type_tags_with_seed: storage.listNoticeTypeRules({ enabledOnly: true })
      .filter((r) => r.source === 'seed')
      .map((r) => r.tag),
  });
});

const { mutationsOnlyAuth } = require('./middleware/auth');
const workerRouter = require('./routes/worker');
const dashboardRouter = require('./routes/dashboard');
// 注意 mount 语义：
//   - /api/auth        不挂 auth（login 必须能公开访问，新用户能进）
//   - /api/scrape-runs 不挂 auth（当前仅 GET 列表；未来若加 POST，回归此处）
//   - /api/health /api/enums 直接 app.get 声明，不在 router 下，天然不受影响
//   - 其余 8 个全部挂 mutationsOnlyAuth（GET 开放，写入要 Bearer）
app.use('/api/stats', statsRouter);
app.use('/api/announcements', mutationsOnlyAuth, annRouter);
app.use('/api/platforms', mutationsOnlyAuth, platRouter);
app.use('/api/scope-rules', mutationsOnlyAuth, scopeRouter);
app.use('/api/qual-rules', mutationsOnlyAuth, qualRouter);
app.use('/api/notice-rules', mutationsOnlyAuth, noticeRouter);
app.use('/api/scrape-runs', runsRouter);                       // 目前 GET only，免挂
app.use('/api/error-logs', mutationsOnlyAuth, errLogsRouter);
app.use('/api/scrape-trigger', mutationsOnlyAuth, triggerRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', mutationsOnlyAuth, settingsRouter);
app.use('/api/worker', mutationsOnlyAuth, workerRouter);
app.use('/api/dashboard', dashboardRouter);  // GET 公开（无 mutation）

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