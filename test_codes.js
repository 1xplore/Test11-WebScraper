const axios = require('axios');
const url = 'https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeDetail';

async function check(id) {
  const form = new URLSearchParams({ t: Date.now().toString(), id });
  const res = await axios.post(url, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const m = res.data.data.model;
  return { title: m.tenderPrjName, projectCode: m.constructionNo };
}

(async () => {
  // 从列表拿前 5 条 id
  const listRes = await axios.post('https://www.whzbtbxt.cn/whebd-server/cmsHomePage/tendererNoticeList',
    new URLSearchParams({ t: Date.now().toString(), current: '1', size: '5' }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  for (const r of listRes.data.data.records) {
    const c = await check(r.id);
    console.log(`  id=${r.id} | projectCode=${c.projectCode} | ${c.title.substring(0, 30)}`);
  }
})();
