const axios = require('axios');

const url = 'https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeDetail';
const form = new URLSearchParams({
  t: Date.now().toString(),
  id: '202606051922296751'
});

axios.post(url, form.toString(), {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.whzbtbxt.cn/whebd/'
  }
}).then(res => {
  const m = res.data.data.model;
  console.log('=== model 字段全打印 ===');
  for (const [key, val] of Object.entries(m)) {
    if (val === null || val === '') continue;
    const displayVal = typeof val === 'object' ? JSON.stringify(val).substring(0, 200) : String(val).substring(0, 200);
    console.log(`  ${key}: ${displayVal}`);
  }
  
  console.log('\n=== requirmentList (资质要求) ===');
  res.data.data.requirmentList.forEach((r, i) => {
    console.log(`  [${i+1}]`, JSON.stringify(r));
  });
  
  console.log('\n=== preList (资格预审) ===');
  res.data.data.preList.forEach((r, i) => {
    console.log(`  [${i+1}]`, JSON.stringify(r).substring(0, 300));
  });
  
  console.log('\n=== biddingPlanList (招标计划) ===');
  res.data.data.biddingPlanList.forEach((r, i) => {
    console.log(`  [${i+1}]`, JSON.stringify(r));
  });
  
  console.log('\n=== dissentDepartmentList (异议受理) ===');
  res.data.data.dissentDepartmentList.forEach((r, i) => {
    console.log(`  [${i+1}]`, JSON.stringify(r).substring(0, 400));
  });
  
  console.log('\n=== prjDetailList (项目标段) ===');
  res.data.data.prjDetailList.forEach((r, i) => {
    console.log(`  [${i+1}]`, JSON.stringify(r).substring(0, 400));
  });
}).catch(e => {
  console.error('Error:', e.message);
});
