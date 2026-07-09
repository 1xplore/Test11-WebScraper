/**
 * 定时任务入口（被 crontab 调用）
 * - 顺序运行所有 scraper
 * - 输出同时写屏 + 追加到 logs/scheduled-YYYY-MM-DD.log
 * - 全局超时：单次运行不超过 30 分钟
 * - 单站失败不影响后续
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const PROJECT_DIR = path.join(__dirname, '..');
const TIMEOUT_MS = 30 * 60 * 1000;  // 30 分钟

const today = new Date().toISOString().slice(0, 10);
const logFile = path.join(LOG_DIR, `scheduled-${today}.log`);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const lines = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  lines.push(line);
  console.log(line);
}

log('========= 定时抓取开始 =========');
log(`工作目录: ${PROJECT_DIR}`);
log(`Node 版本: ${process.version}`);

if (!process.env.NOTION_TOKEN) {
  log('⚠ 警告: NOTION_TOKEN 环境变量未设置');
}

const start = Date.now();
const result = spawnSync('node', ['main.js', '--all', '--pages', '1', '--size', '10'], {
  cwd: PROJECT_DIR,
  encoding: 'utf-8',
  timeout: TIMEOUT_MS,
  env: process.env
});

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
if (result.stdout) log('--- main.js stdout ---\n' + result.stdout);
if (result.stderr) log('--- main.js stderr ---\n' + result.stderr);
log(`--- main.js exit=${result.status}, signal=${result.signal}, 耗时 ${elapsed}s ---`);

if (result.signal === 'SIGTERM') {
  log(`✗ 超时（>${TIMEOUT_MS / 1000}s）被强制结束`);
} else if (result.status === 0) {
  log('✓ 全部完成');
} else {
  log(`✗ 部分或全部失败（exit=${result.status}）`);
}

// Loop 12：scrape 完跑一遍自迭代 worker，让系统自己从 *_error_logs 学
// 单跑 5 分钟 timeout；limit=10 每类最多 10 条；AI 没配则只扫不学（无副作用）
log('========= 自迭代 worker 开始 =========');
const workerStart = Date.now();
const workerResult = spawnSync('node', ['scripts/auto-batch.js', '--limit=10'], {
  cwd: PROJECT_DIR,
  encoding: 'utf-8',
  timeout: 5 * 60 * 1000,
  env: process.env,
});
const workerElapsed = ((Date.now() - workerStart) / 1000).toFixed(1);
if (workerResult.stdout) log('--- auto-batch stdout ---\n' + workerResult.stdout);
if (workerResult.stderr) log('--- auto-batch stderr ---\n' + workerResult.stderr);
log(`--- auto-batch exit=${workerResult.status}, signal=${workerResult.signal}, 耗时 ${workerElapsed}s ---`);
if (workerResult.signal === 'SIGTERM') {
  log('✗ worker 超时（>300s）被强结');
} else if (workerResult.status === 0) {
  log('✓ worker 完成');
} else {
  log(`✗ worker 部分失败（exit=${workerResult.status}）—— 不影响抓取已完成的入库`);
}

// 追加到日志文件
fs.appendFileSync(logFile, lines.join('\n') + '\n');

// 保留最近 30 天的日志
try {
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('scheduled-') && f.endsWith('.log'))
    .map(f => ({ name: f, time: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  for (const f of files.slice(30)) {
    fs.unlinkSync(path.join(LOG_DIR, f.name));
  }
} catch (e) { /* 忽略日志清理失败 */ }

process.exit(result.status || 0);
