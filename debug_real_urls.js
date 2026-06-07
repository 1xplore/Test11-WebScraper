/**
 * 用用户提供的真实详情页 URL 抓取内容
 */
const { chromium } = require('playwright');

const DETAIL_URLS = [
  'https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=202606051922296751&registrationId=202606022056142629&type=details&path=tendererNotice',
  'https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=202606051756336220&registrationId=202606051401204008&type=details&path=tendererNotice',
  'https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=202606041657303101&registrationId=202606011910381196&type=details&path=tendererNotice'
];

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

  for (let i = 0; i < DETAIL_URLS.length; i++) {
    const url = DETAIL_URLS[i];
    console.log(`\n${'#'.repeat(70)}`);
    console.log(`# [${i+1}] ${url}`);
    console.log('#'.repeat(70));

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);

      // 等内容出现
      try {
        await page.waitForSelector('.el-tabs, [class*="detail"], [class*="content"], .el-table, [class*="info"]', { timeout: 5000 });
      } catch (e) {}

      const detail = await page.evaluate(() => {
        const result = {};
        result._fullText = document.body.innerText;
        result._url = window.location.href;
        result._title = document.title;

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

        // 抓取所有以冒号结尾的 label (label 后面紧跟 value 的情况)
        const labelValuePairs = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.children.length === 0) {
            const text = el.innerText?.trim();
            if (text && /[：:]\s*$/.test(text) && text.length < 50) {
              let value = '';
              // 找下一个兄弟/父级的下一个兄弟
              const next = el.nextElementSibling;
              if (next) value = next.innerText?.trim();
              if (!value && el.parentElement) {
                const nextEl = el.parentElement.nextElementSibling;
                if (nextEl) value = nextEl.innerText?.trim();
              }
              if (value) labelValuePairs.push({ label: text, value: value.substring(0, 200) });
            }
          }
        }
        result._labelValuePairs = labelValuePairs;

        return result;
      });

      console.log(`\nURL: ${detail._url}`);
      console.log(`Title: ${detail._title}`);

      console.log('\n--- 详情页完整文本（前 5000 字符）---');
      console.log(detail._fullText.substring(0, 5000));

      if (detail._labelValuePairs.length > 0) {
        console.log('\n--- label-value 对 ---');
        detail._labelValuePairs.slice(0, 50).forEach(({label, value}) => console.log(`  ${label} ${value}`));
      }

      if (detail._trs.length > 0) {
        console.log('\n--- 表格行 ---');
        detail._trs.slice(0, 30).forEach(r => console.log(`  ${r.join(' | ')}`));
      }

    } catch (e) {
      console.log('错误:', e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main();
