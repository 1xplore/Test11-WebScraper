/**
 * 直接构造详情页 URL，跳过点击
 * 抓取前 5 个公告的完整详情
 */
const { chromium } = require('playwright');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    acceptDownloads: true
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // 关键！监听新页面，并把内容打出来
  context.on('page', async newPage => {
    console.log(`[NEW PAGE]: ${newPage.url()}`);
  });

  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 抓前 5 个公告的 id/registrationId
  const items = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.el-table__body .el-table__row'));
    return rows.slice(0, 5).map(row => {
      const prjNameEl = row.querySelector('.prjName');
      const name = prjNameEl?.innerText?.trim();
      const time = row.querySelector('.time')?.innerText?.trim();

      // 检查 prjName 上的事件绑定
      const vueInstance = prjNameEl?.__vue__;
      const vueParent = vueInstance?.$parent;

      return {
        name,
        time,
        vueListeners: vueParent ? Object.keys(vueParent.$listeners || {}) : []
      };
    });
  });

  console.log('前 5 个公告:');
  items.forEach((item, i) => console.log(`  [${i+1}] ${item.name} | ${item.time} | listeners: ${item.vueListeners.join(',')}`));

  // 监听新页面并直接读取内容
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n${'#'.repeat(70)}`);
    console.log(`# [${i+1}] ${item.name}`);
    console.log('#'.repeat(70));

    // 重新定位行（避免 stale）
    const freshRow = (await page.locator('.el-table__body .el-table__row').all())[i];

    // 等待新页面
    const newPagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);

    await freshRow.locator('.prjName').click();

    const newPage = await newPagePromise;
    if (!newPage) {
      console.log('未捕获到新页面，重试...');
      // 也许页面是在当前 page 内部跳转的（SPA hash change）
      await page.waitForTimeout(3000);
      const currentHash = await page.evaluate(() => window.location.hash);
      console.log('当前 hash:', currentHash);
      continue;
    }

    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(3000);

    // 等内容出现
    try {
      await newPage.waitForSelector('.el-tabs, [class*="detail"], [class*="content"], .el-table, [class*="info"]', { timeout: 5000 });
    } catch (e) {}

    const detailUrl = newPage.url();
    console.log(`详情URL: ${detailUrl}`);

    // 抓取详情页所有文字内容
    const detail = await newPage.evaluate(() => {
      const result = {};
      result._fullText = document.body.innerText;
      result._url = window.location.href;

      // 抓取所有 label-value 模式 (常见的 dl/dt/dd 模式)
      const dls = Array.from(document.querySelectorAll('dl')).map(dl => {
        return Array.from(dl.querySelectorAll('dt')).map(dt => ({
          label: dt.innerText?.trim(),
          value: dt.nextElementSibling?.innerText?.trim()
        })).filter(x => x.label && x.value);
      });
      result._dls = dls;

      // 抓取所有 table tr
      const trs = Array.from(document.querySelectorAll('tr')).map(tr => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map(c => c.innerText?.trim()).filter(t => t);
        return cells.length >= 2 ? cells : null;
      }).filter(x => x);
      result._trs = trs;

      // 抓取所有 : 结尾的 label
      const labels = [];
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.children.length === 0 && el.innerText && /[：:]$/.test(el.innerText.trim())) {
          labels.push(el.innerText.trim());
        }
      }
      result._labelTexts = [...new Set(labels)];

      return result;
    });

    console.log('\n--- 详情页前 4000 字符 ---');
    console.log(detail._fullText.substring(0, 4000));

    if (detail._trs.length > 0) {
      console.log('\n--- 表格行 (label-value) ---');
      detail._trs.slice(0, 30).forEach(r => console.log(`  ${r.join(' | ')}`));
    }

    if (detail._dls.length > 0) {
      console.log('\n--- 定义列表 (dl/dt/dd) ---');
      detail._dls.forEach(dl => dl.forEach(({label, value}) => console.log(`  ${label}: ${value}`)));
    }

    if (detail._labelTexts.length > 0) {
      console.log('\n--- 以冒号结尾的 label ---');
      detail._labelTexts.slice(0, 30).forEach(l => console.log(`  ${l}`));
    }

    // 关闭新页面
    await newPage.close();
    await page.waitForTimeout(2000);
  }

  await browser.close();
}

main();
