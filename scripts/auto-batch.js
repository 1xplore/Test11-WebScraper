/**
 * scripts/auto-batch.js —— 后台 worker CLI 入口（loop 12）
 *
 * 调用 server/src/services/autoBatch.runAutoBatch 直接（不走 HTTP）
 * 给 scheduled.js 当后续子任务用；也可手动 CLI 调用
 *
 * 用法：
 *   node scripts/auto-batch.js              # 跑批三类各 5 条（默认）
 *   node scripts/auto-batch.js --limit=20  # 每类最多 20 条
 *   node scripts/auto-batch.js --types=scope  # 只跑 scope
 *   node scripts/auto-batch.js --resolve     # 学成功的 error_log 自动 mark resolved
 *
 * 设计原则：与 POST /api/worker/auto-batch 同源，唯一差别
 *   · API 版走 HTTP（要 auth token，UI dashboard 调用）
 *   · CLI 版免 HTTP（与 cron 集成，cron 自身不需要登录）
 */

const path = require('path');
const PROJECT_DIR = path.join(__dirname, '..');
const autoBatch = require(path.join(PROJECT_DIR, 'server/src/services/autoBatch'));

// 极简 argv 解析（避免引 commander）
function parseArgs(argv) {
  const opts = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--types=')) opts.types = a.slice(7).split(',').map((s) => s.trim());
    else if (a === '--resolve') opts.resolveOnApply = true;
  }
  return opts;
}

(async () => {
  const opts = parseArgs(process.argv);
  console.log(`[auto-batch] start with opts=${JSON.stringify(opts)}`);
  try {
    const result = await autoBatch.runAutoBatch(opts);
    // 简明输出供 cron log 抓取
    const t = result.totals;
    console.log(`[auto-batch] processed=${t.processed} applied=${t.applied} errors=${t.errors} skipped=${t.skipped}`);
    for (const [type, stats] of Object.entries(result.byType)) {
      if (stats.error) {
        console.log(`[auto-batch] ${type}: ERROR ${stats.error}`);
      } else {
        console.log(`[auto-batch] ${type}: processed=${stats.processed} applied=${stats.applied} errors=${stats.errors} skipped=${stats.skipped}`);
      }
    }
    console.log(`[auto-batch] done. ranAt=${result.ranAt}`);
    // applied > 0 视为有产出 → exit 0；纯状态/错误视情况
    // 注意：applied=0 不等于失败（队列空 / no_ai_key 都属正常），不抛 non-zero
    process.exit(0);
  } catch (e) {
    console.error(`[auto-batch] FATAL ${e.message}`);
    console.error(e.stack);
    process.exit(2);
  }
})();
