const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function exploreDetail() {
  console.log('启动浏览器...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('访问网站...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 拦截所有网络请求
    const apiCalls = [];
    page.on('request', req => {
      const url = req.url();
      if (url.includes('api') || url.includes('json') || url.includes('ajax')) {
        apiCalls.push({ url, method: req.method() });
      }
    });

    page.on('response', async res => {
      const url = res.url();
      if (url.includes('api') || url.includes('json') || url.includes('ajax')) {
        try {
          const body = await res.text();
          console.log('\nAPI响应:', url);
          console.log('状态:', res.status());
          console.log('内容:', body.substring(0, 500));
        } catch (e) {}
      }
    });

    console.log('\n=== 点击第一条记录 ===');
    const firstRow = page.locator('.el-table__body .el-table__row').first();

    // 获取点击前的状态
    const htmlBefore = await page.content();
    const urlBefore = page.url();

    // 执行点击
    await firstRow.locator('.prjName').click();
    console.log('已点击，等待变化...');

    // 等待可能的网络请求或DOM变化
    await page.waitForTimeout(5000);

    // 获取点击后的状态
    const urlAfter = page.url();
    console.log('\n点击前URL:', urlBefore);
    console.log('点击后URL:', urlAfter);

    // 检查是否有新的对话框或弹窗
    const dialogs = await page.locator('[class*="dialog"], [class*="modal"], [class*="drawer"]').count();
    console.log('弹窗/对话框数量:', dialogs);

    // 检查URL是否变化
    if (urlBefore !== urlAfter) {
      console.log('URL已变化!');
    } else {
      console.log('URL未变化，可能在当前页展开');
    }

    // 查看是否有展开的详细内容
    const expandedCount = await page.locator('.el-table__row.expanded').count();
    console.log('展开的行数:', expandedCount);

    // 获取页面完整内容看看有什么变化
    const htmlAfter = await page.content();
    const diff = htmlAfter.length - htmlBefore.length;
    console.log('\nHTML长度变化:', diff > 0 ? `+${diff}` : diff);

    // 保存点击后的完整HTML
    const afterFile = path.join(__dirname, '../data/after_click.html');
    fs.writeFileSync(afterFile, htmlAfter, 'utf-8');
    console.log('已保存点击后HTML到:', afterFile);

    console.log('\n=== 网络请求 ===');
    console.log('API请求数量:', apiCalls.length);
    apiCalls.forEach((req, i) => {
      console.log(`${i + 1}. ${req.method} ${req.url}`);
    });

    // 分析表格行结构
    console.log('\n=== 分析行结构 ===');
    const rowInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body .el-table__row');
      const first = rows[0];
      if (!first) return 'No rows';

      // 检查是否有子元素
      const children = first.children;
      const innerHTML = first.innerHTML.substring(0, 500);

      return {
        childCount: children.length,
        hasExpandContent: first.querySelector('.expanded'),
        innerHTMLPreview: innerHTML
      };
    });
    console.log('行信息:', JSON.stringify(rowInfo, null, 2));

  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    await browser.close();
  }
}

exploreDetail();