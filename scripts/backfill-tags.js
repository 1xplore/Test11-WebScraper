/**
 * scripts/backfill-tags.js —— 一次性回填 announcements.qual_tags + notice_type_tags
 *
 * Loop 17 修了 loop 16 的 INSERT OR IGNORE no-op bug，新增 seed UNIQUE 索引；
 * 957 历史公告没机会被 AI 学过（qual / notice_type 表之前都空），
 * 第一次跑这个脚本即可让历史数据的 qual_tags / notice_type_tags 立刻可用。
 *
 * 用法：
 *   node scripts/backfill-tags.js                # 默认 batch=200
 *   node scripts/backfill-tags.js --batch=500   # 大批量
 *   node scripts/backfill-tags.js --dry-run     # 不写库，只报告
 *
 * 设计原则（与 auto-batch.js 同源 CLI）：
 *  - 直接 require server/src/* （无 HTTP、无 auth）
 *  - 幂等：已有非空 tag 的行跳过（不覆盖 loop 3+4 AI 沉淀的人工版本）
 *  - 进度日志：每 200 行输出一次
 *  - exit 0 正常 / 非零 FATAL
 *
 * 何时再跑：
 *  - 新增规则 / 修改 seed 后想对历史数据再 infer 一次
 *  - 当前推断逻辑增强后想 retrofit
 */

const path = require('path');
const PROJECT_DIR = path.join(__dirname, '..');
const storage = require(path.join(PROJECT_DIR, 'server/src/storage/adapter'));

function parseArgs(argv) {
  const opts = { batchSize: 200, dryRun: false };
  for (const a of argv.slice(2)) {
    // Loop 20 F5: 大小写 + 空格 鲁棒
    const lower = a.toLowerCase();
    if (lower === '--dry-run' || lower === '--dryrun') opts.dryRun = true;
    else if (a.startsWith('--batch=')) opts.batchSize = parseInt(a.slice(8), 10);
    else if (a.startsWith('--batch') && argv.indexOf(a) + 1 < argv.length) {
      // --batch N (空格形式)
      const next = argv[argv.indexOf(a) + 1];
      const n = parseInt(next, 10);
      if (!Number.isNaN(n)) opts.batchSize = n;
    }
  }
  return opts;
}

(async () => {
  const opts = parseArgs(process.argv);
  // Loop 20 F2: batchSize 必须 ≥ 1，否则致命
  if (!Number.isInteger(opts.batchSize) || opts.batchSize < 1) {
    console.error(`[backfill-tags] FATAL batchSize=${opts.batchSize} -- 必须 ≥ 1`);
    process.exit(2);
  }
  console.log(`[backfill-tags] start: batch=${opts.batchSize} dryRun=${opts.dryRun}`);
  const t0 = Date.now();
  try {
    const r = await storage.backfillAnnouncementTags({ batchSize: opts.batchSize, dryRun: opts.dryRun });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[backfill-tags] done in ${sec}s`);
    // Loop 20 F4: 真实更新数 vs dryRun 计数区分；F7: failed 时 exit 1
    const updLabel = r.dryRun ? 'wouldUpdate' : 'updated';
    console.log(`[backfill-tags] total=${r.total} ${updLabel}=${r[updLabel]} skipped=${r.skipped} failed=${r.failed}`);
    if (r.failed > 0) {
      console.error(`[backfill-tags] FATAL ${r.failed} 行写库失败`);
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error(`[backfill-tags] FATAL ${e.message}`);
    console.error(e.stack);
    process.exit(2);
  }
})();
