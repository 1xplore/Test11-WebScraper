/**
 * 直接 dump 列表的原始 HTML，看真实结构
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 抓取前 5 行的完整 HTML
  const rowsHtml = await page.evaluate(() => {
    const rows = document.querySelectorAll('.el-table__body .el-table__row');
    return Array.from(rows).slice(0, 5).map(r => r.outerHTML);
  });

  const dataDir = path.join(__dirname, 'data');
  fs.writeFileSync(path.join(dataDir, 'debug_rows.html'), rowsHtml.join('\n\n===== ROW =====\n\n'));
  console.log(`已保存 5 行 HTML 到 data/debug_rows.html (${rowsHtml.join('').length} 字符)`);

  // 抓取整个 body 简化版（只看 class 和文字）
  const structure = await page.evaluate(() => {
    function walk(el, depth = 0) {
      if (depth > 8) return '';
      const text = el.children.length === 0 ? el.innerText?.trim() : '';
      const className = el.className?.toString().substring(0, 30) || '';
      const tag = el.tagName;
      const style = el.getAttribute('style')?.substring(0, 50) || '';
      let result = `${'  '.repeat(depth)}<${tag} class="${className}" style="${style}">${text ? ' ' + text.substring(0, 80) : ''}\n`;
      for (const child of el.children) {
        result += walk(child, depth + 1);
      }
      return result;
    }
    return walk(document.body);
  });

  fs.writeFileSync(path.join(dataDir, 'debug_body.txt'), structure);
  console.log(`已保存 body 结构到 data/debug_body.txt`);

  // 特别检查第一行的 click 事件
  const firstRowListeners = await page.evaluate(() => {
    const row = document.querySelector('.el-table__body .el-table__row');
    const prjName = row.querySelector('.prjName');
    return {
      rowAttrs: Object.fromEntries(Array.from(row.attributes).map(a => [a.name, a.value.substring(0, 100)])),
      prjNameAttrs: Object.fromEntries(Array.from(prjName.attributes).map(a => [a.name, a.value.substring(0, 100)])),
      // 用 vue 实例检测
      hasVueInstance: !!row.__vue__,
      hasPrjVue: !!prjName.__vue__
    };
  });

  console.log('\n第一行 attrs:');
  console.log(JSON.stringify(firstRowListeners, null, 2));

  // 找到 prjName 对应的 Vue 组件，检查它的事件
  const vueEventInfo = await page.evaluate(() => {
    const prjName = document.querySelector('.prjName');
    if (!prjName.__vue__) return 'no vue instance on prjName';

    let comp = prjName.__vue__;
    const events = [];
    let depth = 0;
    while (comp && depth < 5) {
      const listeners = comp.$listeners || comp._events || {};
      events.push({
        depth,
        componentName: comp.$options.name || comp.$options._componentTag || 'unknown',
        listeners: Object.keys(listeners),
        data: Object.keys(comp.$data || {}).slice(0, 20)
      });
      comp = comp.$parent;
      depth++;
    }
    return events;
  });

  console.log('\nVue 事件:');
  console.log(JSON.stringify(vueEventInfo, null, 2));

  await browser.close();
}

main();
