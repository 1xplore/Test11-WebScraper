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
  last_seen_at    TEXT,
  token_created_at TEXT                                -- Loop 30：TTL 防御用
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

-- Loop 31：AI 自迭代学习历史（dashboard 时序数据源）
-- 每次 scopeAi/qualAi/noticeTypeAi 学成功时 INSERT 一行
CREATE TABLE IF NOT EXISTS ai_learned_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  learned_at       TEXT NOT NULL DEFAULT (datetime('now')),
  rule_type        TEXT NOT NULL,                       -- scope / qual / notice_type / district
  tag              TEXT NOT NULL,
  announcement_id  INTEGER,
  source          TEXT NOT NULL DEFAULT 'ai-learned'
);
CREATE INDEX IF NOT EXISTS idx_ai_history_learned_at ON ai_learned_history(learned_at);
CREATE INDEX IF NOT EXISTS idx_ai_history_rule_type  ON ai_learned_history(rule_type, learned_at);


-- ---------- 区域（district_rules）—— 第四套 self-growth (Loop 32) ----------
-- scraper 当前 address 字段未解析 district；让 AI 从 address 抽取行政区/街道
CREATE TABLE IF NOT EXISTS district_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  priority        REAL NOT NULL,
  tag             TEXT NOT NULL,                          -- 行政区/街道名
  keywords        TEXT NOT NULL,                          -- substring 匹配
  enabled         INTEGER NOT NULL DEFAULT 1,
  source          TEXT NOT NULL DEFAULT 'manual',         -- seed / manual / imported / ai-learned
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_district_priority ON district_rules(priority);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_learned_district_tag_kw
  ON district_rules(tag, keywords) WHERE source = 'ai-learned';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_seed_district_tag
  ON district_rules(tag) WHERE source = 'seed';

-- 区域错误日志（与 scope/qual/notice_type 平行）
CREATE TABLE IF NOT EXISTS district_error_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id     INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
  raw_text            TEXT NOT NULL,
  resolved            INTEGER NOT NULL DEFAULT 0,
  resolved_rule_id    INTEGER REFERENCES district_rules(id),
  resolved_tag        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- announcements.district_tags 列（loop 32: 第四套自迭代回写）
-- 注意：announcements.district 字段早已存在（JSON array，loop 之前 schema）；
-- 这里只迁移"AI 提取"单独列（如 announce 有别于 scraper 提取）
-- 实际项目可省此列；保留以备
