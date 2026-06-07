/**
 * 抓取完整 API 响应，找到分页参数
 */
const { chromium } = require('playwright');
const fs = require('fs');

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

  let apiCall = null;
  let apiResponse = null;

  page.on('request', req => {
    if (req.url().includes('tendererNoticeList')) {
      apiCall = {
        method: req.method(),
        url: req.url(),
        headers: req.headers(),
        postData: req.postData()
      };
    }
  });

  page.on('response', async res => {
    if (res.url().includes('tendererNoticeList')) {
      apiResponse = {
        status: res.status(),
        headers: res.headers(),
        body: await res.text()
      };
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('.el-table__body', { timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('=== 请求 ===');
  console.log('Method:', apiCall?.method);
  console.log('URL:', apiCall?.url);
  console.log('PostData:', apiCall?.postData);
  console.log('\n=== 响应 ===');
  console.log('Status:', apiResponse?.status);
  console.log('Content-Type:', apiResponse?.headers?.['content-type']);

  // 把响应体存到文件
  fs.writeFileSync('data/api_list_response.json', apiResponse.body);
  console.log('响应已保存到 data/api_list_response.json');
  console.log('总长度:', apiResponse.body.length);

  // 解析一下分页信息
  const json = JSON.parse(apiResponse.body);
  console.log('\n=== 分页信息 ===');
  console.log('result:', json.result);
  console.log('data.total:', json.data?.total);
  console.log('data.size:', json.data?.size);
  console.log('data.current:', json.data?.current);
  console.log('data.pages:', json.data?.pages);
  console.log('records 数量:', json.data?.records?.length);
  console.log('\n=== 第一条记录关键字段 ===');
  if (json.data?.records?.[0]) {
    const r = json.data.records[0];
    console.log('  id:', r.id);
    console.log('  registrationId:', r.registrationId);
    console.log('  tenderPrjName:', r.tenderPrjName);
    console.log('  noticeStartDate:', r.noticeStartDate);
    console.log('  noticeEndDate:', r.noticeEndDate);
    console.log('  totalInvestment:', r.totalInvestment);
    console.log('  prjbuildCorpName:', r.prjbuildCorpName);
  }

  await browser.close();
}

main();
