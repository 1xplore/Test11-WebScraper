/**
 * 监听点击后的网络请求和 hash 变化
 */
const { chromium } = require('playwright');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();

  const requests = [];
  const responses = [];

  page.on('request', req => {
    const url = req.url();
    if (url.includes('whzbtbxt') || url.includes('whebd')) {
      requests.push({
        time: Date.now(),
        method: req.method(),
        url: url.substring(0, 250),
        resourceType: req.resourceType()
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('whzbtbxt') || url.includes('whebd')) {
      let body = '';
      try {
        if (res.request().resourceType() === 'fetch' || res.request().resourceType() === 'xhr') {
          try {
            body = await res.text();
            if (body.length > 1000) body = body.substring(0, 1000) + '...';
          } catch (e) {}
        }
      } catch (e) {}
      responses.push({
        time: Date.now(),
        status: res.status(),
        url: url.substring(0, 250),
        body
      });
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  const reqsBeforeClick = requests.length;
  console.log(`初始加载: ${reqsBeforeClick} 个请求`);

  // 监听 hashchange
  await page.evaluate(() => {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function(...args) {
      console.log('PUSH_STATE:', JSON.stringify(args));
      return origPush.apply(this, args);
    };
    history.replaceState = function(...args) {
      console.log('REPLACE_STATE:', JSON.stringify(args));
      return origReplace.apply(this, args);
    };
    window.addEventListener('hashchange', e => {
      console.log('HASHCHANGE:', e.oldURL, '->', e.newURL);
    });
  });

  page.on('console', msg => {
    if (!msg.text().includes('Download the Vue Devtools')) {
      console.log(`[BROWSER ${msg.type()}]:`, msg.text());
    }
  });

  // 等待一下
  await page.waitForTimeout(1000);
  console.log('\n>>> 点击 prjName...');
  const firstRow = page.locator('.el-table__body .el-table__row').first();
  await firstRow.locator('.prjName').click();
  await page.waitForTimeout(5000);

  console.log('\n>>> 点击 prjName (第二次)...');
  await firstRow.locator('.prjName').click();
  await page.waitForTimeout(5000);

  console.log('\n>>> 点击 "点我下载"...');
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await firstRow.locator('text=点我下载').click();
  const download = await downloadPromise;
  if (download) {
    console.log('下载触发:', download.suggestedFilename());
  } else {
    console.log('无下载');
  }
  await page.waitForTimeout(3000);

  console.log(`\n点击期间新增请求: ${requests.length - reqsBeforeClick}`);
  console.log('\n=== 期间所有 API 请求 ===');
  requests.slice(reqsBeforeClick).forEach(r => {
    if (r.resourceType === 'fetch' || r.resourceType === 'xhr' || r.url.includes('api') || r.url.includes('cms')) {
      console.log(`  ${r.method} ${r.resourceType}: ${r.url}`);
    }
  });

  console.log('\n=== 期间所有 API 响应 ===');
  responses.slice(reqsBeforeClick).forEach(r => {
    if (r.url.includes('api') || r.url.includes('cms') || r.url.includes('json') || r.url.includes('project') || r.url.includes('detail') || r.url.includes('notice')) {
      console.log(`  ${r.status} ${r.url}`);
      if (r.body) {
        console.log('  Body:', r.body.substring(0, 800));
      }
    }
  });

  // 看看 body 里的所有可点击元素 (Vue 渲染后)
  const allClickables = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return els.filter(el => {
      const text = el.innerText?.trim();
      return text && el.children.length === 0 && text.length < 50 && el.offsetParent !== null;
    }).map(el => ({
      tag: el.tagName,
      text: text,
      className: el.className?.toString().substring(0, 50),
      style: el.getAttribute('style')?.substring(0, 80)
    })).filter(e => e.style?.includes('cursor: pointer') || e.className?.includes('link') || e.tag === 'A');
  });

  console.log('\n=== 可点击的元素 ===');
  allClickables.forEach(c => console.log(`  <${c.tag}> "${c.text}" class="${c.className}" style="${c.style}"`));

  await browser.close();
}

main();
