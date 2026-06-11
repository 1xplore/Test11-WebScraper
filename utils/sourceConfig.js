/**
 * 从 Notion 招标线索来源数据库读取"是否启用抓取 = 已配置运行中"的平台脚本标识
 *
 * 策略：与 notionScopeRules.js 相同 —— Notion 优先 + 本地缓存 + 失败重试
 *   - Notion 成功 → 写本地缓存 + 更新内存
 *   - Notion 失败（2 次重试）→ 读本地缓存副本
 *   - 都失败 → 抛错（首次部署会触发）
 *
 * 用途：main.js --all（cron）按此过滤待运行的 scraper
 *       单站模式（node main.js <site>）不调用此模块
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { NOTION_TOKEN, SOURCE_DB } = require('../config/notionDatabases');

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const CACHE_FILE = path.join(__dirname, '..', 'data', 'enabledSourcesCache.json');
const ENABLED_STATUS = '已配置运行中';

let _cachedScriptIds = null;

function notionHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

function loadFromLocalCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.scriptIds) || cached.scriptIds.length === 0) return null;
    return new Set(cached.scriptIds);
  } catch (e) {
    return null;
  }
}

function saveToLocalCache(scriptIds) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({ fetchedAt: new Date().toISOString(), scriptIds: Array.from(scriptIds) }, null, 2),
    'utf-8'
  );
}

async function fetchEnabledScriptIds() {
  const ids = [];
  let cursor = undefined;
  do {
    const res = await axios.post(
      `${NOTION_BASE}/databases/${SOURCE_DB}/query`,
      {
        page_size: 100,
        start_cursor: cursor,
        filter: {
          property: '是否启用抓取',
          status: { equals: ENABLED_STATUS }
        }
      },
      { headers: notionHeaders(), timeout: 20000 }
    );
    for (const page of res.data.results) {
      const text = page.properties?.['平台抓取脚本标识']?.rich_text;
      if (text && text.length > 0) {
        const sid = text[0].plain_text;
        if (sid) ids.push(sid);
      }
    }
    cursor = res.data.has_more ? res.data.next_cursor : undefined;
  } while (cursor);
  return ids;
}

async function getEnabledSourceScriptIds(forceReload = false) {
  if (_cachedScriptIds && !forceReload) return _cachedScriptIds;

  const backoffs = [3000, 8000];
  let lastError = null;
  for (let i = 0; i < backoffs.length; i++) {
    try {
      const ids = await fetchEnabledScriptIds();
      _cachedScriptIds = new Set(ids);
      console.log(`[sourceConfig] Notion 加载 ${ids.length} 个已启用平台: ${ids.join(', ')}`);
      saveToLocalCache(_cachedScriptIds);
      return _cachedScriptIds;
    } catch (e) {
      lastError = e;
      if (i < backoffs.length - 1) {
        console.warn(`[sourceConfig] Notion 加载失败(${e.code || e.response?.status}), ${backoffs[i] / 1000}s 后重试...`);
        await new Promise(r => setTimeout(r, backoffs[i]));
      }
    }
  }

  const local = loadFromLocalCache();
  if (local) {
    _cachedScriptIds = local;
    console.warn(`[sourceConfig] Notion 不可达，使用本地缓存 ${local.size} 个已启用平台 (缓存时间见 ${CACHE_FILE})`);
    return _cachedScriptIds;
  }

  throw new Error(`[sourceConfig] Notion 不可达且无本地缓存，上次错误: ${lastError?.message}`);
}

async function printEnabledSources() {
  const ids = await getEnabledSourceScriptIds();
  console.log('\n已启用平台 (是否启用抓取=已配置运行中):');
  for (const id of ids) console.log(`  - ${id}`);
}

module.exports = { getEnabledSourceScriptIds, printEnabledSources };
