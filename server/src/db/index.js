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
}

migrate();

console.log(`[db] SQLite 已就绪: ${DB_PATH}`);

module.exports = db;