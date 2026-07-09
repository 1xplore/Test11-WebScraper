-- =============================================================
-- 招标线索系统 SQLite schema（替代原 Notion 数据库）
-- =============================================================

-- ---------- 平台配置（替代 Notion SOURCE_DB + SOURCE_PAGES） ----------
CREATE TABLE IF NOT EXISTS platforms (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id       TEXT    UNIQUE NOT NULL,
  name            TEXT    NOT NULL,
  homepage        TEXT,
  status          TEXT    NOT NULL DEFAULT '已配置运行中',  -- 已配置运行中 / 有错误 / 访问受限故停用 / 已配置但停用
  enabled         INTEGER NOT NULL DEFAULT 1,              -- status 是否 = 已配置运行中（冗余便于快速过滤）
  last_run_at     TEXT,
  last_error      TEXT,
  total_runs      INTEGER NOT NULL DEFAULT 0,
  total_fetched   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 招标公告主表（替代 Notion 主库 32 字段） ----------
CREATE TABLE IF NOT EXISTS announcements (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id             TEXT,                          -- 源系统公告ID（联合 UNIQUE）
  project_code          TEXT,                          -- 项目编号
  source_platform_id    INTEGER NOT NULL REFERENCES platforms(id),

  title                 TEXT NOT NULL,
  detail_url            TEXT,
  notice_type           TEXT,                          -- 采购公告 / 招标公告 / 资格预审公告 / 竞争性磋商公告 ...

  notice_start_date     TEXT,                          -- 公告发布日期
  notice_end_date       TEXT,                          -- 报名截止日期
  bid_submit_deadline   TEXT,                          -- 投标截止时间
  publicity_date        TEXT,                          -- 中标公示时间
  result_date           TEXT,                          -- 中标时间
  planned_tender_time   TEXT,                          -- 拟招标时间

  district              TEXT,                          -- JSON array（multi_select，行政区）

  tender_corp           TEXT,                          -- 招标人/采购人
  tender_link_man       TEXT,
  tender_link_phone     TEXT,
  agency_corp           TEXT,                          -- 代理机构
  agency_link_man       TEXT,
  agency_link_phone     TEXT,
  address               TEXT,
  note_number           TEXT,                          -- 采购计划备案号

  contract_price        REAL,                          -- 合同估算价（万元）
  total_investment      REAL,                          -- 投资估算额（万元）
  offer_price           REAL,                          -- 中标金额（万元）
  tender_bond           REAL,                          -- 保证金（万元）
  planned_period        INTEGER,                       -- 工期天数

  description           TEXT,                          -- 项目详情（长文本）
  requirement           TEXT,                          -- 资质要求（长文本）
  raw_text              TEXT,                          -- 原始正文（供 AI 重算）

  -- 自动推断字段（爬虫写入，人工不直接改）
  scope_tags            TEXT,                          -- JSON array（招标范围标签）
  qual_tags             TEXT,                          -- JSON array（资质标签 —— 自迭代回写）
  business_match        TEXT,                          -- 主营业务可做 / 部分可做 / 不可做 / 待评估
  project_progress      TEXT,                          -- 公告中 / 报名截止 / 开标中 / 评标中 / 中标公示 / 已中标 / 已流标 / 已终止 / 已结束
  match_score           REAL,                          -- 综合匹配分（0~1，AI+算法）

  -- 抓取状态（爬虫维护，更新时不能覆盖人工审核）
  scrape_status         TEXT NOT NULL DEFAULT '已抓取',  -- 已抓取 / 已审核 / 已更新

  -- 人工审核/跟进状态（**核心运营字段**）
  review_status         TEXT NOT NULL DEFAULT 'A.未关注',  -- A.未关注 / A.关注中 / H.已投标 / X.已放弃 / Y.未中标 / Z.已中标
  review_note           TEXT,
  reviewed_at           TEXT,
  reviewed_by           TEXT,

  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(source_platform_id, notice_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_start_date   ON announcements(notice_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_ann_business     ON announcements(business_match);
CREATE INDEX IF NOT EXISTS idx_ann_review       ON announcements(review_status);
CREATE INDEX IF NOT EXISTS idx_ann_progress     ON announcements(project_progress);
CREATE INDEX IF NOT EXISTS idx_ann_platform     ON announcements(source_platform_id);
CREATE INDEX IF NOT EXISTS idx_ann_district     ON announcements(district);
CREATE INDEX IF NOT EXISTS idx_ann_title        ON announcements(title);

-- ---------- Scope 规则（替代 Notion SCOPE_RULES_DB） ----------
CREATE TABLE IF NOT EXISTS scope_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  priority        REAL NOT NULL,
  tag             TEXT NOT NULL,
  keywords        TEXT NOT NULL,                       -- 原始关键词字符串（以 | 分隔）
  stop_on_match   INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1,
  source          TEXT NOT NULL DEFAULT 'seed',         -- seed / manual / imported
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scope_priority ON scope_rules(priority);

-- 同 tag + 同 keywords 的 AI 沉淀规则去重（partial index：只对 source='ai-learned' 生效）
-- 普通 seed/manual/imported 行的重复由业务决定，不强制唯一
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_learned_tag_kw
  ON scope_rules(tag, keywords) WHERE source = 'ai-learned';

-- ---------- 资质规则（预留，当前代码未读取但表已建） ----------
CREATE TABLE IF NOT EXISTS qual_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  priority        REAL NOT NULL,
  tag             TEXT NOT NULL,
  keywords        TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  source          TEXT NOT NULL DEFAULT 'manual',       -- seed / manual / imported / ai-learned
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qual_priority ON qual_rules(priority);

-- AI 沉淀的资质规则去重（partial index，对应 source='ai-learned'）
-- 索引创建必须在 qual_rules.source 列存在之后；老库迁移见 db/index.js#migrate()
-- 新装本文件 IF NOT EXISTS 会自动建好（前提 schema 中已含 source 列）

-- ---------- 公告类型规则（notice_type_rules）—— 自迭代第三套（Loop 6）----------
-- 现行 schema 中 notice_type 是 ENUM 字段（见 enums），硬塞给 announcements
-- 新增 self-growth 表让 AI 学"招标公告 / 资格预审 / 竞争性磋商 / 公开招标 ..."的关键词
CREATE TABLE IF NOT EXISTS notice_type_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  priority        REAL NOT NULL,
  tag             TEXT NOT NULL,
  keywords        TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  source          TEXT NOT NULL DEFAULT 'manual',       -- seed / manual / imported / ai-learned
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notice_type_priority ON notice_type_rules(priority);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_learned_notice_type_tag_kw
  ON notice_type_rules(tag, keywords) WHERE source = 'ai-learned';

-- ---------- Scope 错误日志（替代 Notion SCOPE_ERROR_LOG_DB） ----------
CREATE TABLE IF NOT EXISTS scope_error_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id     INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
  raw_text            TEXT NOT NULL,
  resolved            INTEGER NOT NULL DEFAULT 0,
  resolved_rule_id    INTEGER REFERENCES scope_rules(id),
  resolved_tag        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 公告类型错误日志（Loop 8：与 scope / qual 平行，AI 失败原因记录） ----------
CREATE TABLE IF NOT EXISTS notice_type_error_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id     INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
  raw_text            TEXT NOT NULL,
  resolved            INTEGER NOT NULL DEFAULT 0,
  resolved_rule_id    INTEGER REFERENCES notice_type_rules(id),
  resolved_tag        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 资质错误日志（替代 Notion QUAL_ERROR_LOG_DB） ----------
CREATE TABLE IF NOT EXISTS qual_error_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id     INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
  raw_text            TEXT NOT NULL,
  resolved            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 抓取运行日志（替代 Notion SCRAPE_LOG_DB） ----------
CREATE TABLE IF NOT EXISTS scrape_runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  scrape_time         TEXT NOT NULL,
  date_begin          TEXT NOT NULL,
  date_end            TEXT NOT NULL,
  platform_ids        TEXT NOT NULL,                    -- JSON array
  announcement_ids    TEXT NOT NULL,                    -- JSON array
  scope_error_ids     TEXT NOT NULL,                    -- JSON array
  qual_error_ids      TEXT NOT NULL,                    -- JSON array
  total_created       INTEGER NOT NULL DEFAULT 0,
  total_updated       INTEGER NOT NULL DEFAULT 0,
  total_skipped       INTEGER NOT NULL DEFAULT 0,
  total_error         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_scrape_time ON scrape_runs(scrape_time DESC);

-- ---------- 用户（最简版：用户名 + token，无密码） ----------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT    UNIQUE NOT NULL,
  display_name    TEXT,
  token           TEXT    UNIQUE NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);

-- ---------- 系统设置（AI 配置等运维可改项） ----------
-- 单租户，跳过 enterprise_settings。key 真值（如 ai_api_key）通过 GET 路由脱敏，只返 hasApiKey。
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key     TEXT PRIMARY KEY,
  setting_value   TEXT,
  description     TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      INTEGER REFERENCES users(id)
);

-- 种子：首次启动给默认配置。后续 PUT 会覆盖。
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
  ('ai_provider', 'openai-compatible', 'AI 提供方（当前仅 OpenAI-compatible，base_url 自定义）'),
  ('ai_api_key',  '',                  'AI API Key（plain text；GET 不返回原值）'),
  ('ai_base_url', 'https://api.openai.com/v1', 'Chat Completions 端点 base URL'),
  ('ai_model',    'gpt-4o-mini',       '模型名');

-- ---------- 资质种子（loop 16） —— 让 inferQual 首次调用就有命中 ----------
-- 仅填空表（用 source='seed'）；已有行不动；human-edited source='manual' 行也不动
-- keywords 用整词组（NOT 拆分），因为 platform 关键词 regex 是 OR 语义：
--   拆分 "工程咨询|甲级" 会让 "工程咨询" 单独命中所有级别
--   整词 "工程咨询甲级" 才精确到级别（OR 语义下仍是 substring 匹配，自我场景稳健）
INSERT OR IGNORE INTO qual_rules (priority, tag, keywords, source) VALUES
  -- 工程咨询（整词缩到级别）
  (10, '工程咨询甲级',            '工程咨询甲级',  'seed'),
  (10, '工程咨询乙级',            '工程咨询乙级',  'seed'),
  (10, '工程咨询丙级',            '工程咨询丙级',  'seed'),
  -- 工程造价咨询
  (10, '工程造价咨询甲级',        '工程造价咨询甲级', 'seed'),
  (10, '工程造价咨询乙级',        '工程造价咨询乙级', 'seed'),
  -- 工程监理
  (10, '工程监理甲级',            '工程监理甲级',  'seed'),
  (10, '工程监理乙级',            '工程监理乙级',  'seed'),
  (10, '工程监理丙级',            '工程监理丙级',  'seed'),
  -- 工程设计
  (10, '工程设计甲级',            '工程设计甲级',  'seed'),
  (10, '工程设计乙级',            '工程设计乙级',  'seed'),
  -- 工程勘察
  (10, '工程勘察甲级',            '工程勘察甲级',  'seed'),
  (10, '工程勘察乙级',            '工程勘察乙级',  'seed'),
  -- 招标代理
  (10, '工程招标代理甲级',        '工程招标代理甲级', 'seed'),
  (10, '工程招标代理乙级',        '工程招标代理乙级', 'seed'),
  -- 审计 / 评估
  (10, '会计师事务所执业证书',     '会计师事务所执业证书', 'seed'),
  (10, '审计资质',               '审计资质',        'seed'),
  (10, '房地产估价资质',         '房地产估价资质',   'seed'),
  (10, '土地评估资质',           '土地评估资质',     'seed');

-- ---------- 公告类型种子（loop 16） —— 让 inferNoticeType 首次就有命中 ----------
INSERT OR IGNORE INTO notice_type_rules (priority, tag, keywords, source) VALUES
  (10, '采购公告',         '采购公告',                                 'seed'),
  (10, '招标公告',         '招标公告',                                 'seed'),
  (10, '资格预审公告',     '资格预审公告',                             'seed'),
  (10, '竞争性磋商公告',   '竞争性磋商公告',                           'seed'),
  (10, '公开招标',         '公开招标',                                 'seed'),
  (10, '公开公告',         '公开公告',                                 'seed'),
  (10, '竞争性磋商',       '竞争性磋商',                               'seed');
