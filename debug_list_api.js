/**
 * 拦截列表 API，找到返回 id/registrationId 的端点
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
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  const apiResponses = [];

  page.on('response', async res => {
    const url = res.url();
    if (!url.includes('whzbtbxt') && !url.includes('whebd')) return;

    const ct = (res.headers()['content-type'] || '').toLowerCase();
    if (!ct.includes('json') && !ct.includes('text/plain')) return;

    try {
      const body = await res.text();
      // 只关心可能含 id/registrationId 的响应
      if (body.length > 100 && (
        body.includes('registrationId') ||
        body.includes('"id"') ||
        body.includes('notice') ||
        body.includes('tenderer')
      )) {
        apiResponses.push({
          url: url.substring(0, 250),
          method: res.request().method(),
          status: res.status(),
          body: body.substring(0, 3000)
        });
      }
    } catch (e) {}
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 等待并触发翻页（确保拿到分页请求）
  await page.waitForTimeout(3000);

  console.log(`\n=== 抓取到 ${apiResponses.length} 个相关 API 响应 ===\n`);
  apiResponses.forEach((r, i) => {
    console.log(`\n--- [${i+1}] ${r.method} ${r.status} ---`);
    console.log(`URL: ${r.url}`);
    console.log(`Body 前 3000 字符:`);
    console.log(r.body);
    console.log('---');
  });

  await browser.close();
}

main();
