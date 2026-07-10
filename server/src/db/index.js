/**
 * SQLite 连接管理 + 自动迁移
 *
 * 用 better-sqlite3（同步 API，简单可靠，性能好）
 * 首次启动自动执行 schema.sql；后续启动幂等
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../data/scraper.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

function migrate() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);

  // 增量迁移：给老库加缺失列（CREATE TABLE IF NOT EXISTS 不会给已存在的表补列）
  // 列存在性查 PRAGMA table_info；不存在则 ALTER ADD COLUMN
  const qualCols = db.prepare('PRAGMA table_info(qual_rules)').all().map((c) => c.name);
  if (!qualCols.includes('source')) {
    db.exec("ALTER TABLE qual_rules ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }
  if (!qualCols.includes('updated_at')) {
    db.exec("ALTER TABLE qual_rules ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  // announcements.qual_tags 列（loop 4: 资质自迭代回写公告用）
  const annCols = db.prepare('PRAGMA table_info(announcements)').all().map((c) => c.name);
  if (!annCols.includes('qual_tags')) {
    db.exec("ALTER TABLE announcements ADD COLUMN qual_tags TEXT");
  }
  // announcements.notice_type_tags 列（loop 6: 第三套自迭代回写）
  if (!annCols.includes('notice_type_tags')) {
    db.exec("ALTER TABLE announcements ADD COLUMN notice_type_tags TEXT");
  }

  // notice_type_rules 列（loop 6 incremental）
  const ntcCols = db.prepare('PRAGMA table_info(notice_type_rules)').all().map((c) => c.name);
  if (!ntcCols.includes('source')) {
    db.exec("ALTER TABLE notice_type_rules ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }
  if (!ntcCols.includes('updated_at')) {
    db.exec("ALTER TABLE notice_type_rules ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  // Loop 30: users.token_created_at (TTL 防御)
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('token_created_at')) {
    db.exec("ALTER TABLE users ADD COLUMN token_created_at TEXT");
  }

  // AI 沉淀去重索引：partial UNIQUE on (tag, keywords) WHERE source='ai-learned'
  // 必须在 source 列就位之后；schema.sql 的 IF NOT EXISTS 不够（老库没列就 fail）
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_learned_qual_tag_kw " +
    "ON qual_rules(tag, keywords) WHERE source = 'ai-learned'"
  );

  // Loop 17 修 loop 16 audit F1：UNIQUE 索引确保 INSERT OR IGNORE 真起作用
  // 必须先清重复行（保留每组 MIN(id)）再建索引
  db.exec(`
    DELETE FROM qual_rules
    WHERE source = 'seed' AND id NOT IN (
      SELECT MIN(id) FROM qual_rules WHERE source = 'seed' GROUP BY tag
    )
  `);
  db.exec(`
    DELETE FROM notice_type_rules
    WHERE source = 'seed' AND id NOT IN (
      SELECT MIN(id) FROM notice_type_rules WHERE source = 'seed' GROUP BY tag
    )
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS uniq_seed_qual_tag " +
    "ON qual_rules(tag) WHERE source = 'seed'"
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS uniq_seed_notice_type_tag " +
    "ON notice_type_rules(tag) WHERE source = 'seed'"
  );
}

migrate();
const seed = require('./seed');
seed(db);

console.log(`[db] SQLite 已就绪: ${DB_PATH}`);

module.exports = db;