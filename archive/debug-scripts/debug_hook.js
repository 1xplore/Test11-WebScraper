/**
 * Hook window.open 和 location.assign 抓取点击时的 URL
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

  // 监听新页面
  context.on('page', p => {
    console.log(`[NEW PAGE]: ${p.url()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // Hook 各种跳转方式
  await page.evaluate(() => {
    // 1. Hook window.open
    const origOpen = window.open;
    window.open = function(...args) {
      console.log('WINDOW_OPEN:', JSON.stringify(args));
      return origOpen.apply(this, args);
    };

    // 2. Hook location 变化
    const origAssign = location.assign.bind(location);
    location.assign = function(url) {
      console.log('LOCATION_ASSIGN:', url);
      return origAssign(url);
    };
    const origReplace = location.replace.bind(location);
    location.replace = function(url) {
      console.log('LOCATION_REPLACE:', url);
      return origReplace(url);
    };

    // 3. Hook hash 设置
    let lastHash = location.hash;
    const observer = new MutationObserver(() => {
      if (location.hash !== lastHash) {
        console.log('HASH_CHANGE:', lastHash, '->', location.hash);
        lastHash = location.hash;
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    setInterval(() => {
      if (location.hash !== lastHash) {
        console.log('HASH_CHANGE:', lastHash, '->', location.hash);
        lastHash = location.hash;
      }
    }, 100);

    // 4. Hook history.pushState / replaceState
    const origPush = history.pushState;
    history.pushState = function(state, title, url) {
      console.log('PUSH_STATE:', url, 'state:', JSON.stringify(state)?.substring(0, 200));
      return origPush.call(this, state, title, url);
    };
    const origReplaceState = history.replaceState;
    history.replaceState = function(state, title, url) {
      console.log('REPLACE_STATE:', url, 'state:', JSON.stringify(state)?.substring(0, 200));
      return origReplaceState.call(this, state, title, url);
    };

    // 5. Hook 所有 click 事件，查看是否有 event.stopPropagation 阻止
    document.addEventListener('click', e => {
      const target = e.target;
      if (target.classList?.contains('prjName') || target.closest('.prjName') || target.innerText === '点我下载') {
        console.log('CLICK_CAPTURED on:', target.tagName, target.className, 'text:', target.innerText?.substring(0, 30));
      }
    }, true);
  });

  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('WINDOW_OPEN') || t.startsWith('HASH_CHANGE') || t.startsWith('PUSH_STATE') || t.startsWith('REPLACE_STATE') || t.startsWith('CLICK_CAPTURED') || t.startsWith('LOCATION_')) {
      console.log(`[BROWSER]: ${t}`);
    }
  });

  // 点击 prjName
  console.log('\n>>> 点击第 1 行 prjName...');
  const firstRow = page.locator('.el-table__body .el-table__row').first();
  await firstRow.locator('.prjName').click();
  await page.waitForTimeout(5000);

  // 点击 "点我下载"
  console.log('\n>>> 点击第 2 行"点我下载"...');
  const secondRow = (await page.locator('.el-table__body .el-table__row').all())[1];
  await secondRow.locator('text=点我下载').click();
  await page.waitForTimeout(5000);

  // 再试第 5 行
  console.log('\n>>> 点击第 5 行 prjName...');
  const fifthRow = (await page.locator('.el-table__body .el-table__row').all())[4];
  await fifthRow.locator('.prjName').click();
  await page.waitForTimeout(5000);

  await browser.close();
}

main();
