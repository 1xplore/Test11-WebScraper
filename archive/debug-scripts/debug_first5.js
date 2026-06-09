/**
 * 调试脚本：抓取列表页前 5 个公告的详情页内容
 * 目的：观察详情页结构，确定哪些 Notion 字段可被爬取
 */
const { chromium } = require('playwright');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  console.log('启动浏览器...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('访问列表页...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.waitForSelector('.el-table__body', { timeout: 30000 });

    // 抓取前 5 行
    const rows = await page.locator('.el-table__body .el-table__row').all();
    const top5 = rows.slice(0, 5);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`共 ${rows.length} 行，取前 5 条`);
    console.log('='.repeat(60));

    for (let i = 0; i < top5.length; i++) {
      const row = top5[i];
      const projectName = (await row.locator('.prjName').textContent()).replace(/\s+/g, ' ').trim();
      const cells = row.locator('.el-table__cell');
      const time = (await cells.nth(2).textContent()).replace(/\s+/g, ' ').trim();

      console.log(`\n${'#'.repeat(60)}`);
      console.log(`# [${i + 1}] ${projectName}`);
      console.log(`# 时间: ${time}`);
      console.log('#'.repeat(60));

      // 重新定位第 i 行（因为 goBack 后行索引会变）
      const freshRows = await page.locator('.el-table__body .el-table__row').all();
      const targetRow = freshRows[i];

      // 进入详情页 - 点击"点我下载"
      console.log('\n>>> 点击"点我下载"进入详情页...');
      const linkOrButton = targetRow.locator('text=点我下载').first();
      await linkOrButton.click();
      await page.waitForTimeout(4000);

      const currentUrl = page.url();
      console.log(`当前URL: ${currentUrl}`);

      // 抓取详情页所有文字
      const detail = await page.evaluate(() => {
        const result = {};
        result._fullText = document.body.innerText;

        // 抓取所有 label + value 模式
        const candidates = [
          { label: '项目编号', selectors: ['[class*="code"]', '[class*="bianhao"]'] },
          { label: '项目名称', selectors: ['[class*="project-name"]', '[class*="prj-name"]'] },
          { label: '招标人', selectors: ['[class*="tenderer"]', '[class*="bidder"]'] },
          { label: '代理机构', selectors: ['[class*="agent"]', '[class*="agency"]'] },
        ];

        result._candidates = {};
        for (const c of candidates) {
          for (const sel of c.selectors) {
            const el = document.querySelector(sel);
            if (el?.innerText) {
              result._candidates[c.label] = el.innerText.trim();
              break;
            }
          }
        }

        // 抓取所有带冒号的 label-value 模式
        const labels = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.children.length === 0 && el.innerText && el.innerText.includes(':')) {
            const text = el.innerText.trim();
            if (text.length < 200) {
              labels.push(text);
            }
          }
        }
        result._labels = [...new Set(labels)];

        return result;
      });

      console.log('\n--- 详情页关键信息 ---');
      console.log('候选元素:');
      for (const [k, v] of Object.entries(detail._candidates)) {
        if (v) console.log(`  ${k}: ${v}`);
      }

      console.log('\n带冒号的标签:');
      detail._labels.slice(0, 50).forEach(l => console.log(`  ${l}`));

      console.log('\n--- 详情页全部文本（前 5000 字符）---');
      console.log(detail._fullText.substring(0, 5000));

      // 返回列表页
      console.log('\n>>> 返回列表页...');
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.waitForSelector('.el-table__body', { timeout: 15000 });
    }

  } catch (error) {
    console.error('错误:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

main();
