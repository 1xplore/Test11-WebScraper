/**
 * 测试 seed：插入 6 条示例公告（含各种状态），便于本地验证 API + 前端
 * 运行：node server/test/seed-announcements.js
 */
const storage = require('../src/storage/adapter');
const matching = require('../src/services/matching');

const PLATFORM_ID = storage.getPlatformByScriptId('wuhan_public').id;

const SAMPLES = [
  {
    id: 'wh-test-001',
    title: '武汉市江岸区某医院建设工程监理项目招标公告',
    projectCode: 'ZB-2026-001',
    detailUrl: 'https://example.com/001',
    noticeType: '招标公告',
    noticeStartDate: '2026-07-08',
    noticeEndDate: '2026-07-22',
    bidSubmitDeadline: '2026-07-25 09:30',
    district: ['江岸区'],
    tenderCorp: '武汉市江岸区卫生健康局',
    agencyCorp: '湖北某招标代理有限公司',
    contractPrice: 285.5,
    description: '本项目为武汉市江岸区某医院新建工程的施工监理服务，包含土建、安装、装修全过程的监理工作。',
    requirement: '市政公用工程监理甲级资质',
    rawText: '武汉市江岸区某医院建设工程监理项目招标公告...',
  },
  {
    id: 'wh-test-002',
    title: '武昌区市政道路 EPC 总承包招标公告',
    projectCode: 'ZB-2026-002',
    detailUrl: 'https://example.com/002',
    noticeType: '公开招标',
    noticeStartDate: '2026-07-07',
    noticeEndDate: '2026-07-21',
    district: ['武昌区'],
    tenderCorp: '武昌区建设局',
    agencyCorp: '武汉某代理机构',
    contractPrice: 15800,
    description: '设计施工总承包，包含勘察、设计、施工。',
    rawText: '武昌区市政道路 EPC 总承包招标...',
  },
  {
    id: 'wh-test-003',
    title: '东西湖区工程造价咨询服务采购公告',
    projectCode: 'ZB-2026-003',
    detailUrl: 'https://example.com/003',
    noticeType: '采购公告',
    noticeStartDate: '2026-07-06',
    noticeEndDate: '2026-07-20',
    district: ['东西湖区'],
    tenderCorp: '东西湖区城建局',
    contractPrice: 98,
    description: '为某安置房项目提供全过程造价咨询服务。',
    rawText: '东西湖区工程造价咨询服务采购...',
  },
  {
    id: 'wh-test-004',
    title: '洪山区某软件平台开发项目',
    projectCode: 'ZB-2026-004',
    detailUrl: 'https://example.com/004',
    noticeType: '竞争性磋商',
    noticeStartDate: '2026-07-05',
    noticeEndDate: '2026-07-19',
    district: ['洪山区'],
    tenderCorp: '洪山区某局',
    contractPrice: 320,
    description: '业务系统软件开发，含前端、后端、数据库。',
    rawText: '洪山区软件平台开发...',
  },
  {
    id: 'wh-test-005',
    title: '青山区某老旧小区改造工程地质勘察',
    projectCode: 'ZB-2026-005',
    detailUrl: 'https://example.com/005',
    noticeType: '招标公告',
    noticeStartDate: '2026-06-15',
    noticeEndDate: '2026-06-25',
    district: ['青山区'],
    tenderCorp: '青山区房管局',
    contractPrice: 45,
    description: '岩土工程勘察，包括钻探、原位测试等。',
    rawText: '青山区老旧小区改造工程地质勘察...',
  },
  {
    id: 'wh-test-006',
    title: '汉阳区某公园园林绿化养护服务',
    projectCode: 'ZB-2026-006',
    detailUrl: 'https://example.com/006',
    noticeType: '采购公告',
    noticeStartDate: '2026-06-10',
    noticeEndDate: '2026-06-20',
    district: ['汉阳区'],
    tenderCorp: '汉阳区城管局',
    contractPrice: 78,
    description: '园林绿化养护服务期 2 年。',
    rawText: '汉阳区公园园林绿化养护服务...',
  },
];

for (const sample of SAMPLES) {
  // 走 inferScope（基于真实规则引擎）
  const text = [sample.title, sample.description].filter(Boolean).join(' ');
  sample.scopeTags = matching.inferScope(text);
  sample.businessMatch = matching.inferBusinessMatch(sample.scopeTags);
  sample.matchScore = matching.computeLocalScore(sample.scopeTags, sample.title);
  sample.projectProgress = matching.inferProgress(sample);
  const status = storage.upsertAnnouncement(sample, PLATFORM_ID, { forceUpdate: true });
  console.log(`  ${status.padEnd(7)} | ${sample.businessMatch.padEnd(6, '　')} | ${(sample.matchScore ?? 0).toFixed(2)} | ${sample.scopeTags.join(',')} | ${sample.title.slice(0, 30)}`);
}

console.log(`\n插入完成。当前公告总数: ${storage.listAnnouncements({ pageSize: 1 }).total}`);