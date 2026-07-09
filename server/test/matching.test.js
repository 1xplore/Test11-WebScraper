/**
 * server/test/matching.test.js —— Loop 27 unit tests for matching.js
 *
 * 覆盖关键业务逻辑（之前全靠手动 smoke）：
 *   - inferBusinessMatch：基于 IN_SCOPE / OUT_OF_SCOPE 集合的 4 档判定
 *   - inferProgress：基于日期字段的 5 档状态推断
 *   - inferNoticeType：regex 规则命中（loop 25 后 AND 语义）
 *
 * 跑法：node --test server/test/matching.test.js
 */

const test = require('node:test');
const strict = require('node:assert').strict;
const matching = require('../src/services/matching');

test('inferBusinessMatch: 空 / null', () => {
  strict.equal(matching.inferBusinessMatch([]), '待评估');
  strict.equal(matching.inferBusinessMatch(null), '待评估');
  strict.equal(matching.inferBusinessMatch(undefined), '待评估');
});

test('inferBusinessMatch: 仅 IN_SCOPE 命中 → 主营业务可做', () => {
  strict.equal(matching.inferBusinessMatch(['造价咨询']), '主营业务可做', 'IN_SCOPE 含 造价咨询');
  strict.equal(matching.inferBusinessMatch(['造价咨询', '审计']), '主营业务可做');
});

test('inferBusinessMatch: 仅 OUT_OF_SCOPE 命中 → 不可做', () => {
  strict.equal(matching.inferBusinessMatch(['施工']), '不可做', 'OUT_OF_SCOPE 含"施工"');
  strict.equal(matching.inferBusinessMatch(['EPC', '材料采购']), '不可做');
});

test('inferBusinessMatch: 同时命中 IN + OUT → 部分可做', () => {
  // IN 命中（如"造价咨询"）+ OUT 命中（如"材料采购"）
  strict.equal(matching.inferBusinessMatch(['造价咨询', '材料采购']), '部分可做');
});

test('inferBusinessMatch: 命中其它 tag（不在 IN/OUT 集合）→ 待评估', () => {
  strict.equal(matching.inferBusinessMatch(['其它类']), '待评估');
  strict.equal(matching.inferBusinessMatch(['XYZ']), '待评估');
});

test('inferProgress: 各状态分支', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const future = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  // 已中标：resultDate 过去
  strict.equal(
    matching.inferProgress({ resultDate: past, publicityDate: past, noticeStartDate: past, noticeEndDate: past }),
    '已中标',
    'resultDate < now → 已中标'
  );

  // 中标公示：publicityDate 过去、resultDate 未到
  strict.equal(
    matching.inferProgress({ publicityDate: past, noticeStartDate: past, noticeEndDate: past }),
    '中标公示',
    'publicityDate < now, resultDate null → 中标公示'
  );

  // 报名截止：end 过去
  strict.equal(
    matching.inferProgress({ noticeStartDate: past, noticeEndDate: past }),
    '报名截止',
    'end < now, pub/result null → 报名截止'
  );

  // 公告中：start < now < end
  strict.equal(
    matching.inferProgress({ noticeStartDate: past, noticeEndDate: future }),
    '公告中',
    'start past, end future → 公告中'
  );

  // null：全是 future
  strict.equal(
    matching.inferProgress({ noticeStartDate: future, noticeEndDate: future }),
    null,
    '全 future → null（未开始）'
  );
});

test('inferNoticeType: 命中 / 不命中', () => {
  const ruleLearner = require('../src/services/ruleLearner');
  const seed = ruleLearner.buildDynamicRules([
    { priority: 10, tag: '招标公告', keywords: '招标公告' },
    { priority: 10, tag: '资格预审公告', keywords: '资格预审公告' },
  ]);
  strict.deepEqual(
    matching.inferNoticeType('本项目为 招标公告', seed),
    ['招标公告']
  );
  strict.deepEqual(
    matching.inferNoticeType('资格预审公告', seed),
    ['资格预审公告']
  );
  strict.deepEqual(
    matching.inferNoticeType('与种子无关的公告', seed),
    []
  );
  strict.deepEqual(
    matching.inferNoticeType('招标公告 兼 资格预审公告', seed),
    ['招标公告', '资格预审公告'],
    '两个 seed 都命中应都返'
  );
});
