/**
 * 点击"点我下载"，拦截下载请求看真实响应
 */
const { chromium } = require('playwright');

const BASE_URL = 'https://www.whzbtbxt.cn/whebd/#/cmsIndex?path=tendererNotice';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // 拦截所有请求，找到点击后的网络活动
  const apiResponses = [];

  page.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (url.includes('whzbtbxt') && (ct.includes('json') || ct.includes('xml') || ct.includes('octet') || ct.includes('pdf'))) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      if (body.length > 500) body = body.substring(0, 500) + '...';
      apiResponses.push({
        url: url.substring(0, 200),
        status: res.status(),
        ct,
        body
      });
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });

  // 触发点击"点我下载"，等待 download 事件或 API 响应
  console.log('>>> 点击"点我下载"前...');
  const before = apiResponses.length;

  // 同时等待下载和新响应
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  const responsePromise = new Promise(resolve => {
    const start = apiResponses.length;
    setTimeout(() => resolve(apiResponses.slice(start)), 8000);
  });

  await page.locator('.el-table__body .el-table__row').first().locator('text=点我下载').click();

  const download = await downloadPromise;
  const newResponses = await responsePromise;

  console.log('\n>>> 结果:');
  if (download) {
    console.log('触发下载:', download.suggestedFilename());
    console.log('下载URL:', download.url());
    const path = await download.path();
    console.log('保存路径:', path);
    const fs = require('fs');
    if (path) {
      const stats = fs.statSync(path);
      console.log('文件大小:', stats.size, 'bytes');
      if (stats.size < 50000) {
        const content = fs.readFileSync(path, 'utf-8');
        console.log('文件内容（前 2000 字符）:');
        console.log(content.substring(0, 2000));
      }
    }
  } else {
    console.log('未触发下载');
  }

  console.log('\n新增 API 响应:', newResponses.length);
  newResponses.forEach(r => {
    console.log(`\n${r.status} ${r.ct}: ${r.url}`);
    if (r.body) console.log('  Body:', r.body);
  });

  await browser.close();
}

main();
