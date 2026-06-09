const axios = require('axios');

const url = 'https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeList';
const form = new URLSearchParams({
  t: Date.now().toString(),
  tenderPrjName: '',
  evaluationMethod: '',
  prjbuildCorpName: '',
  regulators: '',
  noticeStartDate: '',
  noticeEndDate: '',
  bmFlag: '',
  prequalificationType: '',
  registrationId: '',
  current: '1',
  size: '3'  // 只取 3 条测试
});

axios.post(url, form.toString(), {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.whzbtbxt.cn/whebd/'
  }
}).then(res => {
  console.log('Status:', res.status);
  console.log('Total:', res.data.data?.total);
  console.log('Records:', res.data.data?.records?.length);
  res.data.data.records.forEach((r, i) => {
    console.log(`\n[${i+1}] ${r.tenderPrjName}`);
    console.log(`  id: ${r.id}`);
    console.log(`  registrationId: ${r.registrationId}`);
    console.log(`  详情URL: https://www.whzbtbxt.cn/whebd/#/cmsIndex?id=${r.id}&registrationId=${r.registrationId}&type=details&path=tendererNotice`);
  });
}).catch(e => {
  console.error('Error:', e.message);
  if (e.response) console.error('Response:', e.response.status, e.response.data);
});
