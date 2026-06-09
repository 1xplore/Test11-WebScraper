const { chromium } = require('playwright');

async function tryHash(hash) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();
  const url = `https://www.whzbtbxt.cn/whebd/#${hash}`;
  console.log(`\n>>> 尝试: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`页面字符数: ${text.length}`);
    console.log(`前 1500 字符:`);
    console.log(text.substring(0, 1500));
  } catch (e) {
    console.log('错误:', e.message);
  }
  await browser.close();
}

// 尝试不同的路径
const paths = [
  '/cmsIndex?path=tendererNoticeDetail',
  '/cmsIndex?path=tendererNoticeDetail&id=1',
  '/cmsIndex?path=noticeDetail',
  '/cmsIndex?path=projectDetail',
  '/cmsIndex?path=bidDetail',
  '/cmsIndex',
  '/cmsIndex?path=bidding',
  '/cmsIndex?path=tenderer',
];

(async () => {
  for (const p of paths) {
    await tryHash(p);
  }
})();
