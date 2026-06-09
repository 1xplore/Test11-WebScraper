/**
 * 找详情页的 API
 */
const { chromium } = require('playwright');
const fs = require('fs');

const DETAIL_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=202606051922296751&registrationId=202606022056142629&type=details&path=tendererNotice';

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

  const apiCalls = [];
  const apiResponses = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('whebd-server') && req.method() === 'POST') {
      apiCalls.push({
        url: url.substring(0, 250),
        postData: req.postData()?.substring(0, 500)
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('whebd-server')) {
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      if (ct.includes('json')) {
        try {
          const body = await res.text();
          apiResponses.push({
            url: url.substring(0, 250),
            status: res.status(),
            body: body.length > 5000 ? body.substring(0, 5000) + '...' : body
          });
        } catch (e) {}
      }
    }
  });

  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  console.log(`\n=== 详情页触发的 ${apiCalls.length} 个 API 调用 ===\n`);
  apiCalls.forEach((c, i) => {
    console.log(`\n--- [${i+1}] POST ${c.url} ---`);
    console.log('PostData:', c.postData);
  });

  console.log(`\n=== ${apiResponses.length} 个 JSON 响应 ===\n`);
  apiResponses.forEach((r, i) => {
    console.log(`\n--- [${i+1}] ${r.status} ${r.url} ---`);
    if (r.body.length < 3000) {
      console.log('Body:');
      console.log(r.body);
    } else {
      console.log('Body (前 3000 字符):');
      console.log(r.body.substring(0, 3000));
    }
    // 保存到文件
    const filename = `data/api_${i+1}_${r.url.split('/').pop().substring(0, 30)}.json`;
    fs.writeFileSync(filename, r.body);
    console.log(`  -> 已保存到 ${filename}`);
  });

  await browser.close();
}

main();
