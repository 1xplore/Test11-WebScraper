/**
 * 招标公告爬虫主入口
 * 流程：爬取 -> 落盘 -> 推送 Notion -> 写 1 条抓取日志（每天 1 条，跨所有站点）
 *
 * 用法：
 *   node main.js <site>            # 单站运行
 *   node main.js <site> --all      # 顺序运行所有站
 *   node main.js --all             # 同上
 *
 * 单站参数：
 *   --pages N            抓取页数（默认 1）
 *   --size N             每页条数（默认 10）
 *   --no-upload          仅爬取，不上传 Notion（也不写抓取日志）
 *   --no-skip-existing   强制更新已存在记录
 *   --output FILE        落盘文件名
 *   --since-days N       首次回溯天数（默认 7）—— 仅在没有历史抓取日志时生效
 */
const path = require('path');
const fs = require('fs');

const whzbtbxtScraper = require('./scrapers/whzbtbxt');
const whzfcgxtScraper = require('./scrapers/whzfcgxt');
const dongxihuScraper = require('./scrapers/dongxihu');
const huangpiScraper = require('./scrapers/huangpi');
const caidianScraper = require('./scrapers/caidian');
const jingkaiScraper = require('./scrapers/jingkai');
const changjiangxinquScraper = require('./scrapers/changjiangxinqu');
const xinzhouScraper = require('./scrapers/xinzhou');
const qingshanScraper = require('./scrapers/qingshan');
const hongshanScraper = require('./scrapers/hongshan');
const donghuwxScraper = require('./scrapers/donghuwx');
const qiaokouScraper = require('./scrapers/qiaokou');
const hanyangScraper = require('./scrapers/hanyang');
const donghuScraper = require('./scrapers/donghu');
const jiangxiaScraper = require('./scrapers/jiangxia');
const jianganScraper = require('./scrapers/jiangan');
const jianghanScraper = require('./scrapers/jianghan');
const wuchangScraper = require('./scrapers/wuchang');
const hubeigovScraper = require('./scrapers/hubeigov');
const huarunScraper = require('./scrapers/huarun');
const dongfengScraper = require('./scrapers/dongfeng');
const notion = require('./utils/notion');
const { getScopeRules } = require('./utils/notionScopeRules');
const { getEnabledSourceScriptIds } = require('./utils/sourceConfig');
const { getLastScrapeTime, createScrapeLog } = require('./utils/scrapeLog');
const { SOURCE_PAGES } = require('./config/notionDatabases');

const DATA_DIR = path.join(__dirname, 'data');

const SCRAPERS = {
  whzbtbxt: whzbtbxtScraper,
  whzfcgxt: whzfcgxtScraper,
  dongxihu: dongxihuScraper,
  huangpi: huangpiScraper,
  caidian: caidianScraper,
  jingkai: jingkaiScraper,
  changjiangxinqu: changjiangxinquScraper,
  xinzhou: xinzhouScraper,
  qingshan: qingshanScraper,
  hongshan: hongshanScraper,
  donghuwx: donghuwxScraper,
  qiaokou: qiaokouScraper,
  hanyang: hanyangScraper,
  donghu: donghuScraper,
  jiangxia: jiangxiaScraper,
  jiangan: jianganScraper,
  jianghan: jianghanScraper,
  wuchang: wuchangScraper,
  hubeigov: hubeigovScraper,
  huarun: huarunScraper,
  dongfeng: dongfengScraper
};

/**
 * 计算本次抓取的时间窗：前次抓取时间 -1h 至今；首次回溯 sinceDays 天
 */
async function resolveTimeRange(sinceDays = 7) {
  const last = await getLastScrapeTime();
  const to = new Date();
  const from = last
    ? new Date(last.getTime() - 3600 * 1000)
    : new Date(Date.now() - sinceDays * 86400 * 1000);
  return { from, to, hasHistory: !!last };
}

/**
 * 跑单站，返回该站结果（items / uploadResults / error log pageIds）
 */
async function runScraper(scraper, opts, timeRange, scopeRules) {
  const siteName = scraper.meta?.name || 'scraper';
  console.log(`\n[${siteName}] 开始`);
  const r = await scraper.run({
    pageCount: opts.pageCount,
    pageSize: opts.pageSize,
    outputFile: opts.outputFile,
    scopeRules,
    timeRange
  });
  let uploadResults = null;
  let scopeIds = [];
  let qualIds = [];
  if (opts.upload && r.items.length > 0) {
    uploadResults = await notion.uploadItems(r.items, {
      skipExisting: opts.skipExisting,
      sourcePageId: scraper.meta?.sourcePageId
    });
    console.log(`  [${siteName}] 上传: 创建 ${uploadResults.created}, 更新 ${uploadResults.updated}, 跳过 ${uploadResults.skipped}, 失败 ${uploadResults.error}`);
    if (scraper.writeFeedbackLogs) {
      const ids = await scraper.writeFeedbackLogs(r.items, uploadResults);
      scopeIds = ids.scopeIds || [];
      qualIds = ids.qualIds || [];
    }
  }
  return { siteName, items: r.items, uploadResults, scopeIds, qualIds, stopReason: r.stopReason };
}

/**
 * 把所有站的结果聚合成 1 条抓取日志写入
 */
function collectPageIds(allResults) {
  const touchedIds = [];
  const scopeIds = [];
  const qualIds = [];
  for (const r of allResults) {
    for (const d of r.uploadResults?.details || []) {
      if (d.status === 'created' || d.status === 'updated') {
        if (d.pageId) touchedIds.push(d.pageId);
      }
    }
    for (const id of r.scopeIds || []) scopeIds.push(id);
    for (const id of r.qualIds || []) qualIds.push(id);
  }
  return { touchedIds, scopeIds, qualIds };
}

async function runAll(opts) {
  const scopeRules = await getScopeRules();
  const timeRange = await resolveTimeRange(opts.sinceDays);
  console.log(`\n时间窗: ${timeRange.from.toISOString()} ~ ${timeRange.to.toISOString()} (${timeRange.hasHistory ? '有历史' : `首次回溯 ${opts.sinceDays} 天`})`);

  const enabledIds = await getEnabledSourceScriptIds();
  const enabledEntries = [];
  for (const [key, scraper] of Object.entries(SCRAPERS)) {
    const sid = scraper.meta?.scriptId;
    if (!sid) {
      console.warn(`[${key}] 缺少 meta.scriptId，跳过`);
      continue;
    }
    if (!enabledIds.has(sid)) {
      console.log(`[${key}] Notion 状态非"已配置运行中"，跳过 (scriptId=${sid})`);
      continue;
    }
    enabledEntries.push([key, scraper]);
  }
  console.log(`\n启用 ${enabledEntries.length} 个 / 跳过 ${Object.keys(SCRAPERS).length - enabledEntries.length} 个`);

  const allResults = [];
  for (const [key, scraper] of enabledEntries) {
    try {
      const r = await runScraper(scraper, opts, timeRange, scopeRules);
      allResults.push({ site: key, ...r });
    } catch (e) {
      console.error(`[${key}] 失败: ${e.message}`);
      allResults.push({ site: key, error: e });
    }
  }

  if (opts.upload && allResults.length > 0) {
    const { touchedIds, scopeIds, qualIds } = collectPageIds(allResults);
    const platformIds = enabledEntries
      .map(([, s]) => s.meta?.sourcePageId)
      .filter(Boolean);
    await createScrapeLog({
      scrapeTime: new Date(),
      dateBegin: timeRange.from,
      dateEnd: timeRange.to,
      platformPageIds: platformIds,
      announcementPageIds: touchedIds,
      scopeErrorPageIds: scopeIds,
      qualErrorPageIds: qualIds
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log('所有站点运行汇总');
  console.log('='.repeat(50));
  for (const r of allResults) {
    const cnt = r.items?.length || 0;
    const stop = r.stopReason ? ` [stop=${r.stopReason}]` : '';
    const err = r.error ? ` ERROR: ${r.error.message}` : '';
    console.log(`  ${r.site}: ${cnt} 条${stop}${err}`);
  }
  return allResults;
}

async function main() {
  const args = process.argv.slice(2);
  const runAllFlag = args.includes('--all');
  const targetSite = runAllFlag ? null : (args[0] || 'whzbtbxt');

  const opts = {
    pageCount: 1,
    pageSize: 10,
    upload: true,
    skipExisting: true,
    outputFile: null,
    sinceDays: 7
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') continue;
    if (args[i] === '--pages') opts.pageCount = parseInt(args[++i], 10);
    else if (args[i] === '--size') opts.pageSize = parseInt(args[++i], 10);
    else if (args[i] === '--no-upload') opts.upload = false;
    else if (args[i] === '--no-skip-existing') opts.skipExisting = false;
    else if (args[i] === '--output') opts.outputFile = args[++i];
    else if (args[i] === '--since-days') opts.sinceDays = parseInt(args[++i], 10);
  }

  console.log('='.repeat(50));
  if (runAllFlag) {
    console.log(`招标公告爬虫 - 全部 ${Object.keys(SCRAPERS).length} 个站`);
  } else {
    console.log(`招标公告爬虫 - 目标: ${targetSite}`);
  }
  console.log(`配置: ${opts.pageCount} 页 × ${opts.pageSize} 条, 上传=${opts.upload}, 跳过已存在=${opts.skipExisting}, 回溯=${opts.sinceDays}天`);
  console.log('='.repeat(50));

  try {
    if (runAllFlag) {
      const allResults = await runAll(opts);
      const hasError = allResults.some(s => s.error);
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
      const timeRange = await resolveTimeRange(opts.sinceDays);
      console.log(`\n时间窗: ${timeRange.from.toISOString()} ~ ${timeRange.to.toISOString()}`);

      const r = await runScraper(scraper, opts, timeRange, scopeRules);

      if (opts.upload) {
        const { touchedIds, scopeIds, qualIds } = collectPageIds([r]);
        const platformIds = Object.values(SOURCE_PAGES);
        await createScrapeLog({
          scrapeTime: new Date(),
          dateBegin: timeRange.from,
          dateEnd: timeRange.to,
          platformPageIds: [scraper.meta.sourcePageId],
          announcementPageIds: touchedIds,
          scopeErrorPageIds: scopeIds,
          qualErrorPageIds: qualIds
        });
      }
      console.log('\n✓ 全部完成');
    }
  } catch (error) {
    console.error('✗ 失败:', error.message);
    process.exit(1);
  }
}

main();
