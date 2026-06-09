/**
 * 招标公告爬虫主入口
 * 流程：爬取 -> 落盘 -> 推送 Notion
 *
 * 用法：
 *   node main.js <site>            # 单站运行
 *   node main.js <site> --all      # 顺序运行所有站
 *   node main.js --all             # 同上
 *
 * 单站参数：
 *   --pages N            抓取页数（默认 1）
 *   --size N             每页条数（默认 10）
 *   --no-upload          仅爬取，不上传 Notion
 *   --no-skip-existing   强制更新已存在记录
 *   --output FILE        落盘文件名
 */
const path = require('path');
const fs = require('fs');

const whzbtbxtScraper = require('./scrapers/whzbtbxt');
const dongxihuScraper = require('./scrapers/dongxihu');
const notion = require('./utils/notion');
const { getScopeRules } = require('./utils/notionScopeRules');

const DATA_DIR = path.join(__dirname, 'data');

const SCRAPERS = {
  whzbtbxt: whzbtbxtScraper,
  dongxihu: dongxihuScraper
};

async function uploadToNotion(items, options = {}) {
  console.log('\n' + '='.repeat(50));
  console.log('开始上传到 Notion');
  console.log('='.repeat(50));
  const results = await notion.uploadItems(items, options);
  console.log(`\n上传汇总: 创建 ${results.created}, 更新 ${results.updated}, 跳过 ${results.skipped}, 失败 ${results.error}`);
  return results;
}

async function runScraper(scraper, opts, scopeRules = null) {
  const siteName = scraper.meta?.name || 'scraper';
  console.log(`\n[${siteName}] 开始`);
  const { items, uploadResults } = await scraper.run({
    pageCount: opts.pageCount,
    pageSize: opts.pageSize,
    outputFile: opts.outputFile,
    scopeRules
  });
  if (opts.upload && items.length > 0) {
    const results = await uploadToNotion(items, {
      skipExisting: opts.skipExisting,
      sourcePageId: scraper.meta?.sourcePageId
    });
    if (scraper.writeFeedbackLogs) {
      await scraper.writeFeedbackLogs(items, results);
    }
  }
  return { siteName, count: items.length };
}

async function runAll(opts) {
  const scopeRules = await getScopeRules();
  const summary = [];
  for (const [key, scraper] of Object.entries(SCRAPERS)) {
    try {
      const r = await runScraper(scraper, opts, scopeRules);
      summary.push({ site: key, ...r, status: 'ok' });
    } catch (e) {
      console.error(`[${key}] 失败: ${e.message}`);
      summary.push({ site: key, status: 'error', error: e.message });
    }
  }
  console.log('\n' + '='.repeat(50));
  console.log('所有站点运行汇总');
  console.log('='.repeat(50));
  for (const s of summary) {
    console.log(`  ${s.site}: ${s.status} ${s.count !== undefined ? `(${s.count} 条)` : ''} ${s.error || ''}`);
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const runAllFlag = args.includes('--all');
  const targetSite = runAllFlag ? null : (args[0] || 'whzbtbxt');

  // 解析参数: --pages N --size N --no-upload --no-skip-existing --output FILE
  const opts = {
    pageCount: 1,
    pageSize: 10,
    upload: true,
    skipExisting: true,
    outputFile: null
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') continue;
    if (runAllFlag && !targetSite) continue;
    if (args[i] === '--pages') opts.pageCount = parseInt(args[++i], 10);
    else if (args[i] === '--size') opts.pageSize = parseInt(args[++i], 10);
    else if (args[i] === '--no-upload') opts.upload = false;
    else if (args[i] === '--no-skip-existing') opts.skipExisting = false;
    else if (args[i] === '--output') opts.outputFile = args[++i];
  }

  console.log('='.repeat(50));
  if (runAllFlag) {
    console.log(`招标公告爬虫 - 全部 ${Object.keys(SCRAPERS).length} 个站`);
  } else {
    console.log(`招标公告爬虫 - 目标: ${targetSite}`);
  }
  console.log(`配置: ${opts.pageCount} 页 × ${opts.pageSize} 条, 上传=${opts.upload}, 跳过已存在=${opts.skipExisting}`);
  console.log('='.repeat(50));

  try {
    if (runAllFlag) {
      const summary = await runAll(opts);
      const hasError = summary.some(s => s.status === 'error');
      console.log(hasError ? '\n✗ 部分失败' : '\n✓ 全部完成');
      process.exit(hasError ? 1 : 0);
    } else {
      const scraper = SCRAPERS[targetSite];
      if (!scraper) {
        console.error(`未知的网站: ${targetSite}`);
        console.log(`可用的网站: ${Object.keys(SCRAPERS).join(', ')}`);
        process.exit(1);
      }
      const scopeRules = await getScopeRules();
      await runScraper(scraper, opts, scopeRules);
      console.log('\n✓ 全部完成');
    }
  } catch (error) {
    console.error('✗ 失败:', error.message);
    process.exit(1);
  }
}

main();
