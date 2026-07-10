/**
 * 种子数据：21 个平台 + 27 条 scope 规则 + AI 配置默认值 + 资质/公告类型规则
 * 仅在表为空时插入（幂等）
 *
 * 自动调用：db/index.js#migrate() 之后
 * 手动调用：node server/src/db/seed.js
 */

const PLATFORMS = [
  { script_id: 'wuhan_public',       name: '武汉公共资源交易中心',     homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_zhongcai',     name: '武汉市政府采购电子交易系统', homepage: 'https://www.whzfcgxt.cn' },
  { script_id: 'wuhan_dongxihu_district', name: '东西湖区政府采购',    homepage: 'http://zfcg.dxh.gov.cn:9090' },
  { script_id: 'wuhan_huangpi_district',  name: '黄陂区政府采购交易系统', homepage: 'http://47.111.115.168:10013' },
  { script_id: 'wuhan_caidian_district',  name: '蔡甸区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_jingkai_district',  name: '武汉经济技术开发区',    homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_changjiangxinqu_district', name: '长江新区',     homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_xinzhou_district',  name: '新洲区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_qingshan_district', name: '青山区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_hongshan_district', name: '洪山区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_donghuwx_district', name: '东湖风景区',          homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_qiaokou_district',  name: '硚口区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_hanyang_district',  name: '汉阳区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_donghu_district',   name: '东湖高新区',          homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_jiangxia_district', name: '江夏区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_jiangan_district',  name: '江岸区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_jianghan_district', name: '江汉区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'wuhan_wuchang_district',  name: '武昌区',              homepage: 'https://www.whzbtbxt.cn' },
  { script_id: 'hubei_gov',              name: '湖北省政府采购网',      homepage: 'http://www.ccgp-hubei.gov.cn' },
  { script_id: 'huarun',                 name: '华润守正采购交易平台',   homepage: 'https://www.crsc.com.cn' },
  { script_id: 'dongfeng',               name: '东风汽车采购招投标交易平台', homepage: 'https://www.dongfeng-tender.com' },
];

const SCOPE_RULES = [
  { priority: 1,    tag: 'EPC',                keywords: 'EPC|设计施工总承包|设计采购施工|设计施工', stop_on_match: 1 },
  { priority: 1.5,  tag: '建设施工',            keywords: '项目施工|建设施工|工程施工', stop_on_match: 1 },
  { priority: 2,    tag: '设备采购',            keywords: '设备采购|器械采购', stop_on_match: 1 },
  { priority: 3,    tag: '材料采购',            keywords: '材料采购', stop_on_match: 1 },
  { priority: 4,    tag: '货物采购',            keywords: '货物采购', stop_on_match: 1 },
  { priority: 6,    tag: '物业运维',            keywords: '运维|物业', stop_on_match: 0 },
  { priority: 7,    tag: '环卫养护',            keywords: '环卫|养护|园林|绿化|管护|清淤', stop_on_match: 1 },
  { priority: 8,    tag: '三防工程',            keywords: '三防', stop_on_match: 1 },
  { priority: 11,   tag: '餐饮外包',            keywords: '餐饮|餐饮服务|餐饮外包|食材供应', stop_on_match: 1 },
  { priority: 12,   tag: '安保服务',            keywords: '安保|安防|保卫', stop_on_match: 1 },
  { priority: 13,   tag: '保洁服务',            keywords: '保洁', stop_on_match: 1 },
  { priority: 16,   tag: '软件开发',            keywords: '软件开发|系统集成', stop_on_match: 0 },
  { priority: 17,   tag: '信息化服务',          keywords: '信息化|智慧社区|智慧城市', stop_on_match: 0 },
  { priority: 18,   tag: '环境调查',            keywords: '污染调查|环境调查', stop_on_match: 1 },
  { priority: 19,   tag: '安全评估',            keywords: '安全评估|风险评估', stop_on_match: 0 },
  { priority: 19.5, tag: '全过程工程咨询',      keywords: '全过程工程咨询', stop_on_match: 1 },
  { priority: 19.8, tag: '工程项目管理',        keywords: '工程项目管理|建设项目管理', stop_on_match: 0 },
  { priority: 20,   tag: '建筑设计',            keywords: '工程设计|设计服务|勘察设计|建筑设计', stop_on_match: 0 },
  { priority: 21,   tag: '工程监理',            keywords: '工程监理|建设监理|监理|施工监理', stop_on_match: 0 },
  { priority: 22,   tag: '造价预算',            keywords: '造价咨询|预算编制|造价预算', stop_on_match: 0 },
  { priority: 23,   tag: '投资估算',            keywords: '概算|估算|投资估算', stop_on_match: 0 },
  { priority: 24,   tag: '结算审计',            keywords: '结算审核|结算审计|审计服务', stop_on_match: 0 },
  { priority: 25,   tag: '决算审计',            keywords: '决算审核|决算审计', stop_on_match: 0 },
  { priority: 26,   tag: '造价跟踪',            keywords: '全过程造价|造价跟踪|跟踪造价|审计跟踪|跟踪审计', stop_on_match: 0 },
  { priority: 27,   tag: '地质勘查',            keywords: '工程勘察|岩土勘察|地质勘查|地勘', stop_on_match: 0 },
  { priority: 28,   tag: '工程验收',            keywords: '工程验收|工程复核', stop_on_match: 0 },
  { priority: 29,   tag: '可行性研究',          keywords: '投资咨询|投资评估|咨询评估|投资策划|项目策划|可行性研究|可研', stop_on_match: 0 },
];

// AI 配置默认值（首次启动给默认；后续 PUT 会覆盖）
const SYSTEM_SETTINGS_SEED = [
  { setting_key: 'ai_provider', setting_value: 'openai-compatible',         description: 'AI 提供方（当前仅 OpenAI-compatible，base_url 自定义）' },
  { setting_key: 'ai_api_key',  setting_value: '',                          description: 'AI API Key（plain text；GET 不返回原值）' },
  { setting_key: 'ai_base_url', setting_value: 'https://api.openai.com/v1', description: 'Chat Completions 端点 base URL' },
  { setting_key: 'ai_model',    setting_value: 'gpt-4o-mini',               description: '模型名' },
];

// 资质种子（loop 16 + loop 21）—— 让 inferQual 首次调用就有命中
// 仅填空表（用 source='seed'）；已有行不动；human-edited source='manual' 行也不动
// keywords 用整词组（NOT 拆分），因为 platform 关键词 regex 是 OR 语义
const QUAL_RULES_SEED = [
  // loop 16 — 行业大类资质
  { priority: 10, tag: '工程咨询甲级',            keywords: '工程咨询甲级',  source: 'seed' },
  { priority: 10, tag: '工程咨询乙级',            keywords: '工程咨询乙级',  source: 'seed' },
  { priority: 10, tag: '工程咨询丙级',            keywords: '工程咨询丙级',  source: 'seed' },
  { priority: 10, tag: '工程造价咨询甲级',        keywords: '工程造价咨询甲级', source: 'seed' },
  { priority: 10, tag: '工程造价咨询乙级',        keywords: '工程造价咨询乙级', source: 'seed' },
  { priority: 10, tag: '工程监理甲级',            keywords: '工程监理甲级',  source: 'seed' },
  { priority: 10, tag: '工程监理乙级',            keywords: '工程监理乙级',  source: 'seed' },
  { priority: 10, tag: '工程监理丙级',            keywords: '工程监理丙级',  source: 'seed' },
  { priority: 10, tag: '工程设计甲级',            keywords: '工程设计甲级',  source: 'seed' },
  { priority: 10, tag: '工程设计乙级',            keywords: '工程设计乙级',  source: 'seed' },
  { priority: 10, tag: '工程勘察甲级',            keywords: '工程勘察甲级',  source: 'seed' },
  { priority: 10, tag: '工程勘察乙级',            keywords: '工程勘察乙级',  source: 'seed' },
  { priority: 10, tag: '工程招标代理甲级',        keywords: '工程招标代理甲级', source: 'seed' },
  { priority: 10, tag: '工程招标代理乙级',        keywords: '工程招标代理乙级', source: 'seed' },
  { priority: 10, tag: '会计师事务所执业证书',     keywords: '会计师事务所执业证书', source: 'seed' },
  { priority: 10, tag: '审计资质',               keywords: '审计资质',        source: 'seed' },
  { priority: 10, tag: '房地产估价资质',         keywords: '房地产估价资质',   source: 'seed' },
  { priority: 10, tag: '土地评估资质',           keywords: '土地评估资质',     source: 'seed' },
  // loop 21 — 行业子领域资质（整词短语）
  { priority: 10, tag: '工程勘察综合甲级',       keywords: '工程勘察综合甲级',  source: 'seed' },
  { priority: 10, tag: '工程设计综合甲级',       keywords: '工程设计综合甲级',  source: 'seed' },
  { priority: 10, tag: '风景园林工程设计专项',   keywords: '风景园林工程设计专项|风景园林设计专项', source: 'seed' },
  { priority: 10, tag: '建筑装饰设计专项',       keywords: '建筑装饰设计专项',  source: 'seed' },
  { priority: 10, tag: '照明工程设计专项',       keywords: '照明工程设计专项',  source: 'seed' },
  { priority: 10, tag: '岩土工程勘察甲级',       keywords: '岩土工程勘察&甲级|岩土工程&甲级', source: 'seed' },
  { priority: 10, tag: '工程测量专业甲级',       keywords: '工程测量专业甲级|工程测量甲级', source: 'seed' },
  { priority: 10, tag: '房屋建筑工程监理甲级',   keywords: '房屋建筑工程监理甲级', source: 'seed' },
  { priority: 10, tag: '市政公用工程监理甲级',   keywords: '市政公用工程监理甲级', source: 'seed' },
  { priority: 10, tag: '矿业权评估资质',         keywords: '矿业权评估资质',    source: 'seed' },
  { priority: 10, tag: '测绘资质乙级',           keywords: '测绘资质乙级',      source: 'seed' },
  { priority: 10, tag: '安全评价资质',           keywords: '安全评价资质',      source: 'seed' },
  { priority: 10, tag: '环境监测资质',           keywords: '环境监测资质',      source: 'seed' },
  { priority: 10, tag: '工程造价咨询企业资质',   keywords: '工程造价咨询企业资质|工程造价咨询企业', source: 'seed' },
  { priority: 10, tag: '政府采购代理机构',       keywords: '政府采购代理机构',  source: 'seed' },
  { priority: 10, tag: '中央投资招标代理',       keywords: '中央投资项目招标代理资格|中央投资招标代理', source: 'seed' },
  { priority: 10, tag: '全过程工程咨询',         keywords: '全过程工程咨询|全过程咨询', source: 'seed' },
];

// 公告类型种子（loop 16）—— 让 inferNoticeType 首次就有命中
const NOTICE_TYPE_RULES_SEED = [
  { priority: 10, tag: '采购公告',         keywords: '采购公告',           source: 'seed' },
  { priority: 10, tag: '招标公告',         keywords: '招标公告',           source: 'seed' },
  { priority: 10, tag: '资格预审公告',     keywords: '资格预审公告',       source: 'seed' },
  { priority: 10, tag: '竞争性磋商公告',   keywords: '竞争性磋商公告',     source: 'seed' },
  { priority: 10, tag: '公开招标',         keywords: '公开招标',           source: 'seed' },
  { priority: 10, tag: '公开公告',         keywords: '公开公告',           source: 'seed' },
  { priority: 10, tag: '竞争性磋商',       keywords: '竞争性磋商',         source: 'seed' },
];

function seed(db) {
  // 平台
  const platformCount = db.prepare('SELECT COUNT(*) AS n FROM platforms').get().n;
  if (platformCount === 0) {
    const ins = db.prepare(
      'INSERT INTO platforms (script_id, name, homepage, status, enabled) VALUES (?, ?, ?, ?, ?)'
    );
    const tx = db.transaction((rows) => rows.forEach((r) =>
      ins.run(r.script_id, r.name, r.homepage, '已配置运行中', 1)
    ));
    tx(PLATFORMS);
    console.log(`[seed] 植入 ${PLATFORMS.length} 个平台`);
  } else {
    console.log(`[seed] 平台表已有 ${platformCount} 条记录，跳过`);
  }

  // scope 规则
  const ruleCount = db.prepare('SELECT COUNT(*) AS n FROM scope_rules').get().n;
  if (ruleCount === 0) {
    const ins = db.prepare(
      'INSERT INTO scope_rules (priority, tag, keywords, stop_on_match, enabled, source) VALUES (?, ?, ?, ?, 1, ?)'
    );
    const tx = db.transaction((rows) => rows.forEach((r) =>
      ins.run(r.priority, r.tag, r.keywords, r.stop_on_match, 'seed')
    ));
    tx(SCOPE_RULES);
    console.log(`[seed] 植入 ${SCOPE_RULES.length} 条 scope 规则`);
  } else {
    console.log(`[seed] scope 规则表已有 ${ruleCount} 条记录，跳过`);
  }

  // 系统设置（AI 配置默认值）
  const settingCount = db.prepare('SELECT COUNT(*) AS n FROM system_settings').get().n;
  if (settingCount === 0) {
    const ins = db.prepare(
      'INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)'
    );
    const tx = db.transaction((rows) => rows.forEach((r) =>
      ins.run(r.setting_key, r.setting_value, r.description)
    ));
    tx(SYSTEM_SETTINGS_SEED);
    console.log(`[seed] 植入 ${SYSTEM_SETTINGS_SEED.length} 条系统设置`);
  } else {
    console.log(`[seed] system_settings 已有 ${settingCount} 条记录，跳过`);
  }

  // 资质规则（loop 16 + loop 21）
  const qualCount = db.prepare("SELECT COUNT(*) AS n FROM qual_rules WHERE source = 'seed'").get().n;
  if (qualCount === 0) {
    const ins = db.prepare(
      'INSERT INTO qual_rules (priority, tag, keywords, enabled, source) VALUES (?, ?, ?, 1, ?)'
    );
    const tx = db.transaction((rows) => rows.forEach((r) =>
      ins.run(r.priority, r.tag, r.keywords, r.source)
    ));
    tx(QUAL_RULES_SEED);
    console.log(`[seed] 植入 ${QUAL_RULES_SEED.length} 条资质规则`);
  } else {
    console.log(`[seed] qual_rules 已有 ${qualCount} 条 seed 记录，跳过`);
  }

  // 公告类型规则
  const ntCount = db.prepare("SELECT COUNT(*) AS n FROM notice_type_rules WHERE source = 'seed'").get().n;
  if (ntCount === 0) {
    const ins = db.prepare(
      'INSERT INTO notice_type_rules (priority, tag, keywords, enabled, source) VALUES (?, ?, ?, 1, ?)'
    );
    const tx = db.transaction((rows) => rows.forEach((r) =>
      ins.run(r.priority, r.tag, r.keywords, r.source)
    ));
    tx(NOTICE_TYPE_RULES_SEED);
    console.log(`[seed] 植入 ${NOTICE_TYPE_RULES_SEED.length} 条公告类型规则`);
  } else {
    console.log(`[seed] notice_type_rules 已有 ${ntCount} 条 seed 记录，跳过`);
  }
}

if (require.main === module) {
  const db = require('./index');
  seed(db);
}

module.exports = seed;