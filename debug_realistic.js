/**
 * 用更真实的浏览器配置重试
 * 监听 dialog/popup/newPage/console
 */
const { chromium } = require('playwright');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    acceptDownloads: true
  });
  // 隐藏 webdriver 标识
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  // 监听 dialog
  page.on('dialog', async d => {
    console.log('[DIALOG]:', d.type(), d.message());
    await d.dismiss();
  });

  // 监听新窗口
  context.on('page', p => {
    console.log('[NEW PAGE]:', p.url());
  });

  // 监听 console
  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('Download the Vue Devtools') && !text.includes('ERR_')) {
      console.log(`[CONSOLE ${msg.type()}]:`, text.substring(0, 300));
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 检查：所有 row 中是否有 hidden 元素或 modal
  const initialState = await page.evaluate(() => {
    return {
      visibleModals: Array.from(document.querySelectorAll('.el-dialog, .el-message-box, .modal, [class*="dialog"], [class*="modal"]')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
      }).map(el => ({ class: el.className, text: el.innerText?.substring(0, 100) })),
      bodyClasses: document.body.className,
      hiddenRows: document.querySelectorAll('.el-table__row.expanded').length
    };
  });
  console.log('初始状态:', JSON.stringify(initialState, null, 2));

  console.log('\n=== 尝试 1: 点击 .prjName (带子 span) ===');
  const firstRow = page.locator('.el-table__body .el-table__row').first();

  // 监听请求变化
  const reqsBefore1 = [];
  page.on('request', req => reqsBefore1.push({ time: Date.now(), url: req.url() }));

  await firstRow.locator('.prjName span').first().click();
  await page.waitForTimeout(5000);

  const afterClick1 = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    bodyStart: document.body.innerText.substring(0, 800)
  }));
  console.log('点击后 URL:', afterClick1.url);
  console.log('点击后 hash:', afterClick1.hash);
  console.log('点击后 body 前 800 字符:');
  console.log(afterClick1.bodyStart);
  console.log('点击后新增请求:', reqsBefore1.length);

  // 看看是否有 dialog 弹出
  const afterModals = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.el-dialog, .el-message-box, .modal, [class*="dialog"]')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(el => ({ class: el.className, text: el.innerText?.substring(0, 200) }));
  });
  console.log('点击后可见 modal/dialog:', JSON.stringify(afterModals, null, 2));

  await page.waitForTimeout(2000);

  console.log('\n=== 尝试 2: 点击 "点我下载" ===');
  // 重新定位 row
  const firstRow2 = page.locator('.el-table__body .el-table__row').first();
  const reqsBefore2 = reqsBefore1.length;
  await firstRow2.locator('text=点我下载').click();
  await page.waitForTimeout(5000);

  const afterClick2 = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    bodyStart: document.body.innerText.substring(0, 800)
  }));
  console.log('点击后 URL:', afterClick2.url);
  console.log('点击后 hash:', afterClick2.hash);
  console.log('点击后 body 前 800 字符:');
  console.log(afterClick2.bodyStart);
  console.log('点击后新增请求:', reqsBefore1.length - reqsBefore2);

  const afterModals2 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.el-dialog, .el-message-box, .modal, [class*="dialog"], [class*="popup"], [class*="form"]')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(el => ({ class: el.className, text: el.innerText?.substring(0, 200) }));
  });
  console.log('点击后可见 modal/dialog/form:', JSON.stringify(afterModals2, null, 2));

  // 截图
  await page.screenshot({ path: 'data/debug_after_clicks.png', fullPage: false });
  console.log('\n已截图: data/debug_after_clicks.png');

  await browser.close();
}

main();
