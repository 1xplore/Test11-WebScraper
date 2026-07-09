/**
 * 业务常量单一源 —— 让 AI 自迭代服务 / API enums 共享事实。
 *
 * 当前收录：
 *   NOTICE_TYPE_SCOPE —— '公告类型' ENUM；同时给 /api/enums 和 AI 自迭代 prompt 用
 *
 * 不收录：
 *   matching.IN_SCOPE / OUT_OF_SCOPE —— 27+10 项大型 Set，散在 matching.js 里
 *   qualAi.QUAL_SCOPE —— 27 项资质类别，与项目主营关系不大；保持本地
 *
 * 维护原则：
 *   改了这里要同步改 services 与 enums 路由的引用点
 *   （当前唯一引用：server.js#/api/enums + noticeTypeAi.js）
 */

const NOTICE_TYPE_SCOPE = Object.freeze([
  '采购公告',
  '招标公告',
  '资格预审公告',
  '竞争性磋商公告',
  '公开招标',
  '公开公告',
  '竞争性磋商',
  '其他',
]);

module.exports = {
  NOTICE_TYPE_SCOPE,
};
