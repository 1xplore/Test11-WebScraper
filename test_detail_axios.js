const axios = require('axios');
const fs = require('fs');

const url = 'https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeDetail';
const form = new URLSearchParams({
  t: Date.now().toString(),
  id: '202606051922296751'  // 第一个公告的 id
});

axios.post(url, form.toString(), {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.whzbtbxt.cn/whebd/'
  }
}).then(res => {
  fs.writeFileSync('data/api_detail_response.json', JSON.stringify(res.data, null, 2));
  console.log('状态:', res.status);
  console.log('Total size:', JSON.stringify(res.data).length, '字符');
  console.log('已保存到 data/api_detail_response.json');
  
  // 打印所有非空字段
  const d = res.data.data;
  if (!d) return console.log('No data');
  
  console.log('\n=== 主要字段 ===');
  const fields = Object.keys(d);
  for (const key of fields) {
    const val = d[key];
    if (val === null || val === undefined || val === '') continue;
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        console.log(`${key}: [Array(${val.length})]`);
      } else {
        console.log(`${key}: [Object]`);
      }
    } else {
      console.log(`${key}: ${String(val).substring(0, 200)}`);
    }
  }
}).catch(e => {
  console.error('Error:', e.message);
  if (e.response) console.error('Response:', e.response.status, e.response.data);
});
