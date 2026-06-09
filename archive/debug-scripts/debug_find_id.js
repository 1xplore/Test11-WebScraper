/**
 * 深入挖掘 prjName 元素，找到详情 URL 的 id 和 registrationId 来源
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

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 1. 收集 prjName 元素 + 所有 Vue 组件实例链上的 data
  const chainInfo = await page.evaluate(() => {
    const row = document.querySelector('.el-table__body .el-table__row');
    const prjName = row.querySelector('.prjName');

    function findVueRoot(el) {
      // 找到最近的带 __vue__ 的祖先
      let cur = el;
      while (cur) {
        if (cur.__vue__) return cur.__vue__;
        cur = cur.parentElement;
      }
      return null;
    }

    // 找到根 Vue 实例
    let rootVue = findVueRoot(prjName);
    if (!rootVue) return { error: 'no vue' };

    // 向上爬到根
    let topVue = rootVue;
    while (topVue.$parent) topVue = topVue.$parent;

    // 提取整个组件树中所有 data 字段
    const seen = new WeakSet();
    function collectData(vue, depth = 0) {
      if (!vue || seen.has(vue) || depth > 20) return null;
      seen.add(vue);

      const info = {
        componentName: vue.$options.name || vue.$options._componentTag || '?',
        data: {}
      };

      // 收集 data
      if (vue.$data) {
        for (const key of Object.keys(vue.$data)) {
          const val = vue.$data[key];
          if (val === null || val === undefined) continue;
          if (typeof val === 'object') {
            info.data[key] = Array.isArray(val) ? `[Array(${val.length})]` : '[Object]';
            if (Array.isArray(val) && val.length > 0 && val.length < 5) {
              info.data[key] = val.map(v => {
                if (v && typeof v === 'object') {
                  return JSON.stringify(v).substring(0, 200);
                }
                return String(v).substring(0, 100);
              });
            }
          } else {
            info.data[key] = String(val).substring(0, 200);
          }
        }
      }

      info.listeners = Object.keys(vue.$listeners || {});
      info.children = [];

      if (vue.$children) {
        for (const child of vue.$children) {
          const childInfo = collectData(child, depth + 1);
          if (childInfo) info.children.push(childInfo);
        }
      }

      return info;
    }

    const fullTree = collectData(topVue);

    // 2. 找所有 .prjName 元素的相关属性
    const allPrjNames = Array.from(document.querySelectorAll('.prjName'));
    const firstFew = allPrjNames.slice(0, 3).map(el => {
      return {
        text: el.innerText?.trim().substring(0, 50),
        outerHTML: el.outerHTML.substring(0, 300),
        attrs: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value.substring(0, 100)]))
      };
    });

    return {
      fullTree,
      firstFewPrjNames: firstFew
    };
  });

  // 写入文件便于查看
  const fs = require('fs');
  fs.writeFileSync('data/debug_vue_tree.json', JSON.stringify(chainInfo, null, 2));
  console.log('Vue 树已保存到 data/debug_vue_tree.json');

  // 简化打印：找 id/registrationId/notice 等关键字段
  const text = fs.readFileSync('data/debug_vue_tree.json', 'utf-8');
  const lines = text.split('\n');
  const relevant = lines.filter(l =>
    /\b(id|notice|project|registration|code|number|data|row|record|item)\b/i.test(l) &&
    l.length < 250
  );
  console.log('\n=== 相关字段 ===');
  relevant.slice(0, 80).forEach(l => console.log(l));

  await browser.close();
}

main();
