/**
 * Notion 数据库 ID 集中配置
 *
 * 各数据库用途说明：
 *
 * 招标线索登记数据库（主数据库）
 *   - 写入爬虫抓取的每条招标公告记录
 *   - 是所有错误日志的 source relation 目标
 *
 * 招标线索来源数据库（平台配置）
 *   - 登记各爬虫站点的 sourcePageId 和元数据
 *   - 爬虫运行时从这里读取 sourcePageId 再写入主数据库的 公告发布平台 字段
 *
 * 招标线索业务数据库（scope 规则库）
 *   - 人类可编辑，存储 scopeTags 匹配规则（keyword → tag）
 *   - 爬虫每日凌晨从 Notion 获取最新规则，同步到本地 scopeRulesCache.json
 *
 * 招标线索资质数据库（qual 规则库）
 *   - 结构同 scope 规则库，存储资质类型匹配规则
 *   - 爬虫从 Notion 获取，写入本地 qualRulesCache.json
 *
 * 招标线索业务匹配错误日志数据库
 *   - scopeTags 未识别时写入，记录 pageId + 原始文本，供人类调优
 *   - 人类填入正确匹配内容后，通过按钮写回 业务数据库
 *
 * 招标线索资质匹配错误日志数据库
 *   - 资质未识别时写入（排除"特定资格要求：无"）
 *   - 结构同 scope 错误日志，供人类调优后写回资质规则库
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;

// 主数据库
const NOTICE_DB = '32d9e857b37a80f8bfdad0de856ee030';

// 平台配置（各 scraper 的 sourcePageId 使用）
const SOURCE_PAGES = {
  dongxihu: '32d9e857-b37a-81bf-9976-c49aa0e892aa',
  huangpi: '32d9e857-b37a-8138-9649-cf435a5d3ffa',
  caidian: '32d9e857-b37a-818c-9196-d04116a5114f',
  jingkai: '32d9e857-b37a-81b4-a04a-f2cfc0d7b919',
  changjiangxinqu: '32d9e857-b37a-8152-a9a8-d0ca57fa764d',
  xinzhou: '32d9e857-b37a-81a3-9134-da74d244e733',
};

// 规则库（人类可编辑，爬虫每日同步）
const SCOPE_RULES_DB = '3799e857b37a806c836fcdcf73af63d5';     // 招标线索业务数据库（scope 规则）
const QUAL_RULES_DB = '3799e857b37a80f3b268e75a32c614b3';     // 招标线索资质数据库（qual 规则）

// 错误日志数据库（仅写入，不读取）
const SCOPE_ERROR_LOG_DB = '3799e857b37a804ab5a3e3522321d6a2'; // 招标线索业务匹配错误日志
const QUAL_ERROR_LOG_DB = '3799e857b37a8021a15efeb99fd05c5b';  // 招标线索资质匹配错误日志

module.exports = {
  NOTION_TOKEN,
  NOTICE_DB,
  SOURCE_PAGES,
  SCOPE_RULES_DB,
  QUAL_RULES_DB,
  SCOPE_ERROR_LOG_DB,
  QUAL_ERROR_LOG_DB,
};