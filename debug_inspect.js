/**
 * 检查列表行元素的真实属性和事件绑定
 */
const { chromium } = require('playwright');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 检查第一行的所有元素
  const inspection = await page.evaluate(() => {
    const rows = document.querySelectorAll('.el-table__body .el-table__row');
    if (rows.length === 0) return { error: 'no rows' };

    const firstRow = rows[0];

    // 检查 prjName 元素的所有属性
    const prjNameEl = firstRow.querySelector('.prjName');
    const prjNameInfo = {
      tagName: prjNameEl?.tagName,
      innerText: prjNameEl?.innerText?.trim(),
      innerHTML: prjNameEl?.innerHTML?.substring(0, 300),
      href: prjNameEl?.getAttribute('href'),
      onClick: prjNameEl?.getAttribute('onclick'),
      classList: prjNameEl?.className,
      allAttrs: {}
    };
    for (const attr of prjNameEl.attributes) {
      prjNameInfo.allAttrs[attr.name] = attr.value;
    }

    // 找一下所有可点击元素
    const clickables = Array.from(firstRow.querySelectorAll('a, button, [onclick], [class*="click"], [class*="btn"]')).map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim().substring(0, 50),
      href: el.getAttribute('href'),
      className: el.className
    }));

    // 检查 "点我下载" 元素
    const downloadEls = Array.from(firstRow.querySelectorAll('*')).filter(el =>
      el.innerText?.trim() === '点我下载' && el.children.length === 0
    ).map(el => ({
      tag: el.tagName,
      href: el.getAttribute('href'),
      className: el.className,
      attrs: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value]))
    }));

    // 找 prjName 下的子元素（可能有 a 标签）
    const prjNameChildren = Array.from(prjNameEl?.querySelectorAll('*') || []).map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim().substring(0, 30),
      href: el.getAttribute('href'),
      className: el.className
    }));

    // 看 hash 当前是什么
    const currentHash = window.location.hash;
    const fullUrl = window.location.href;

    return {
      prjNameInfo,
      prjNameChildren,
      clickables,
      downloadEls,
      currentHash,
      fullUrl
    };
  });

  console.log('=== 元素检查 ===');
  console.log(JSON.stringify(inspection, null, 2));

  // 现在尝试点击 prjName，看 hash 是否变化
  console.log('\n=== 点击 prjName 前后 ===');
  console.log('点击前 hash:', await page.evaluate(() => window.location.hash));

  // 监听 hash 变化
  await page.evaluate(() => {
    window.addEventListener('hashchange', () => {
      console.log('HASH CHANGED:', window.location.hash);
    });
  });

  // 拦截新的页面请求
  page.on('request', req => {
    if (req.url().includes('whzbtbxt') && !req.url().endsWith('.css') && !req.url().endsWith('.js')) {
      console.log('REQUEST:', req.method(), req.url().substring(0, 150));
    }
  });

  page.on('response', res => {
    const url = res.url();
    if (url.includes('whzbtbxt') && (url.includes('api') || url.includes('detail') || url.includes('project') || url.includes('cms'))) {
      console.log('RESPONSE:', res.status(), url.substring(0, 200));
    }
  });

  const firstRow = page.locator('.el-table__body .el-table__row').first();
  await firstRow.locator('.prjName').click();
  await page.waitForTimeout(5000);

  console.log('点击后 hash:', await page.evaluate(() => window.location.hash));
  console.log('点击后 URL:', page.url());
  console.log('点击后 body 前 500 字符:');
  console.log((await page.evaluate(() => document.body.innerText)).substring(0, 500));

  await browser.close();
}

main();
