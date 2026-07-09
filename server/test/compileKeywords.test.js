/**
 * server/test/compileKeywords.test.js —— Loop 25 unit tests
 *
 * 用 node:test 内建（Node 22+ 标配，无 npm 依赖）
 * 跑法：node --test server/test/
 * 或单跑：node --test server/test/compileKeywords.test.js
 *
 * 覆盖 ruleLearner.compileKeywords 的:
 *   - 默认/空输入
 *   - 单 keyword
 *   - 多个 OR 段
 *   - 多个 AND 段 (loop 23 加)
 *   - OR + AND 混合 (loop 23 加)
 *   - regex 元字符 escape (reDoS 防御)
 *   - 空 segment 过滤
 *   - NFKC + Chinese 兼容 (loop 5 / 11 加)
 */

const test = require('node:test');
const strict = require('node:assert').strict;
const { compileKeywords, tagNormalize, buildDynamicRules, verifyKeywords } = require('../src/services/ruleLearner');

test('compileKeywords: empty / whitespace-only', () => {
  strict.equal(compileKeywords('').test('anything'), false,  '空 → 不匹配');
  strict.equal(compileKeywords('   ').test('anything'), false, '纯空白 → 不匹配');
});

test('compileKeywords: single keyword (substring OR semantics with one term)', () => {
  const re = compileKeywords('工程咨询');
  strict.equal(re.test('项目要求具备工程咨询资质'), true);
  strict.equal(re.test('工程'), false, '单 term 必须是 substring；不是 prefix match');
});

test('compileKeywords: OR with `|`', () => {
  const re = compileKeywords('工程咨询|甲级');
  strict.equal(re.test('项目要求具备工程咨询甲级资质'), true, '两个 term 都出现');
  strict.equal(re.test('项目要求具备工程咨询资质'), true, '只命中 1 个也应匹配');
  strict.equal(re.test('项目要求具备乙级'), false);
});

test('compileKeywords: AND with `&` (substring direction irrelevant)', () => {
  const re = compileKeywords('岩土工程勘察&甲级');
  strict.equal(re.test('具备甲级岩土工程勘察资质'), true,
    '顺序无关：input 重排了关键词');
  strict.equal(re.test('岩土工程勘察资质'), false, '缺 甲级 → 不匹配');
  strict.equal(re.test('岩土工程资质'), false, '缺 甲级 → 不匹配');
  strict.equal(re.test('甲级岩土工程勘察资质'), true,
    'input 含两 term 仍命中——AND 不依赖顺序，只依赖"都在"');
});

test('compileKeywords: mixed OR + AND', () => {
  const re = compileKeywords('工程咨询甲级&资质|工程造价咨询');
  strict.equal(re.test('项目要求具备工程咨询甲级资质'), true, 'AND 段命中');
  strict.equal(re.test('工程造价咨询'), true, 'OR 第二段命中');
  strict.equal(re.test('工程造价咨询资质'), true, 'OR + AND 都中');
  strict.equal(re.test('工程项目管理'), false);
});

test('compileKeywords: regex metacharacters escaped (reDoS defense)', () => {
  const re = compileKeywords('.*+?|)^$([[');
  // 输入含每个元字符；都不应解释为 regex 元
  strict.equal(re.test('.*+?|)^$([['), true,  'regex 元字符作字面匹配');
});

test('compileKeywords: ignore empty segments', () => {
  const re1 = compileKeywords('|kw1|');
  strict.equal(re1.test('kw1'), true);
  const re2 = compileKeywords('a&&b');
  // && 中间空 split → ['a', '', 'b'] → filter → ['a', 'b'] → 2 terms → AND 匹配
  strict.equal(re2.test('a something b'), true, 'a & b 都在 input');
  strict.equal(re2.test('only a'), false, '缺 b');
  const re3 = compileKeywords('a&');
  // 末尾空 term 被过滤
  strict.equal(re3.test('a'), true, '单 term 模式');
  const re4 = compileKeywords('&a');
  // 起始空 term 被过滤
  strict.equal(re4.test('a'), true);
});

test('tagNormalize: NFKC + strip whitespace + lowercase', () => {
  strict.equal(tagNormalize('工程 甲级'), '工程甲级');
  strict.equal(tagNormalize('审计服务'), '审计服务');
  strict.equal(tagNormalize('FULL-width'), 'full-width');
  strict.equal(tagNormalize(null), '');
  strict.equal(tagNormalize(undefined), '');
});

test('buildDynamicRules: scope vs qual differing on stopOnMatch', () => {
  const scopeRule = { priority: 1, tag: 'X', keywords: 'kw1', stop_on_match: 1 };
  const qualRule = { priority: 1, tag: 'X', keywords: 'kw1' };
  const dynScope = buildDynamicRules([scopeRule], { withStopOnMatch: true });
  const dynQual = buildDynamicRules([qualRule]);
  strict.equal(dynScope[0].stopOnMatch, true, 'scope 路径带 stopOnMatch');
  strict.equal(dynQual[0].stopOnMatch, undefined, 'qual 路径无 stopOnMatch');
  strict.equal(dynScope[0].regex.test('kw1'), true);
});

test('verifyKeywords: minLen default 2 + 字面命中 + 长度过滤', () => {
  strict.deepEqual(
    verifyKeywords(['kw1', 'kw2', 'a'], 'kw1kw2 中含 a'),
    ['kw1', 'kw2'],
    'a 长度 < 2 默认过滤掉'
  );
  strict.deepEqual(
    verifyKeywords(['kw1', 'kw2'], 'kw1kw2', { minLen: 1 }),
    ['kw1', 'kw2'],
    'minLen=1 时 a 类似短字符串也能入'
  );
  strict.deepEqual(
    verifyKeywords(['kw-too-long-12345678901234567890-1234'], 'text 包含 kw-too-long-12345678901234567890-1234 字面段'),
    [],
    '超 maxLen=30 的过滤掉'
  );
});

test('end-to-end: inferQual-style pipeline (buildDynamicRules + verifyKeywords)', () => {
  // 模拟 scopeAi 推理流程的最后一步：AI 验证 keywords → 写库
  const aiKeywords = ['工程咨询甲级', '资质'];
  const inputText = '项目要求具备工程咨询甲级资质';
  const verified = verifyKeywords(aiKeywords, inputText);
  strict.deepEqual(verified, aiKeywords, '全部 substring 命中，OR 入库');
  // 注意：AI 输出 OR（verified.join("|")）；如果 AI 改用 AND（"工程咨询甲级&资质"），loop 23 已支持
});
