/**
 * 从 Notion 业务数据库读取 scopeTags 推断规则
 * 每天凌晨爬取前动态加载一次
 *
 * 策略：Notion 优先，实时更新本地缓存；
 *       Notion 不可达时使用本地缓存副本；
 *       匹配不到任何规则则返回 "其他"
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { NOTION_TOKEN, SCOPE_RULES_DB } = require('../config/notionDatabases');

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const CACHE_FILE = path.join(__dirname, '..', 'data', 'scopeRulesCache.json');

// 内存缓存，进程内只加载一次
let _cachedRules = null;

function getNotionToken() {
  return NOTION_TOKEN;
}

function notionHeaders() {
  return {
    'Authorization': `Bearer ${getNotionToken()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

/**
 * 从本地缓存文件读取规则（同步，Notion 不可达时使用）
 */
function loadFromLocalCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cached = JSON.parse(raw);
    if (!Array.isArray(cached) || cached.length === 0) return null;
    // 反序列化：regex 是字符串，需要重新编译
    return cached.map(r => ({
      ...r,
      regex: new RegExp(r._regexSource)
    }));
  } catch (e) {
    return null;
  }
}

/**
 * 将规则保存到本地缓存（同步）
 */
function saveToLocalCache(rules) {
  // 序列化：regex 无法 JSON，保存其 source
  const serializable = rules.map(r => ({
    ...r,
    _regexSource: r.regex.source
  }));
  fs.writeFileSync(CACHE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
}

/**
 * 分页读取 Notion 数据库所有记录
 */
async function fetchAllPages(databaseId) {
  const results = [];
  let startCursor = undefined;

  do {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const res = await axios.post(
      `${NOTION_BASE}/databases/${databaseId}/query`,
      body,
      { headers: notionHeaders(), timeout: 20000 }
    );

    results.push(...res.data.results);
    startCursor = res.data.has_more ? res.data.next_cursor : undefined;
  } while (startCursor);

  return results;
}

/**
 * 将关键词列表字符串组装成正则表达式
 * "设备采购、器械采购" -> /设备采购|器械采购/
 */
function buildRegex(keywordList) {
  const keywords = keywordList
    .split(/[、,，]/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
  return new RegExp(keywords.join('|'));
}

/**
 * 读取并解析所有规则
 * @returns {Array} [{ priority, regex, tag, stopOnMatch }]
 */
async function loadScopeRules() {
  const pages = await fetchAllPages(SCOPE_RULES_DB);

  const rules = pages.map(page => {
    const props = page.properties;
    const keywordList = props['应匹配内容']?.rich_text?.[0]?.plain_text || '';
    const tag = props['应映射为']?.title?.[0]?.plain_text || '';
    const behavior = props['匹配行为']?.select?.name || 'stop';
    const priority = props['优先级']?.number ?? 999;

    if (!keywordList || !tag) return null;

    return {
      priority,
      regex: buildRegex(keywordList),
      tag,
      stopOnMatch: behavior === 'stop'
    };
  }).filter(Boolean);

  rules.sort((a, b) => a.priority - b.priority);
  return rules;
}

/**
 * 获取规则：Notion 优先 → 更新本地缓存；失败则读本地副本
 */
async function getScopeRules(forceReload = false) {
  if (_cachedRules && !forceReload) return _cachedRules;

  // 尝试从 Notion 加载（最多 2 次重试）
  const backoffs = [3000, 8000];
  let lastError = null;
  for (let i = 0; i < backoffs.length; i++) {
    try {
      _cachedRules = await loadScopeRules();
      console.log(`[scopeRules] 从 Notion 加载 ${_cachedRules.length} 条规则`);
      saveToLocalCache(_cachedRules);   // 实时更新本地缓存
      return _cachedRules;
    } catch (e) {
      lastError = e;
      if (i < backoffs.length - 1) {
        console.warn(`[scopeRules] Notion 加载失败(${e.code}), ${backoffs[i] / 1000}s 后重试...`);
        await new Promise(r => setTimeout(r, backoffs[i]));
      }
    }
  }

  // Notion 不可达，使用本地缓存
  const localRules = loadFromLocalCache();
  if (localRules) {
    _cachedRules = localRules;
    console.log(`[scopeRules] Notion 不可达，使用本地缓存 ${_cachedRules.length} 条规则`);
    return _cachedRules;
  }

  // 无缓存也无 Notion，抛出异常（不应发生在凌晨爬取场景）
  throw new Error(`[scopeRules] Notion 不可达且无本地缓存，上次错误: ${lastError?.message}`);
}

/**
 * 打印规则表（调试用）
 */
async function printRules() {
  const rules = await getScopeRules();
  console.log('\nscopeRules 规则表:');
  console.log('pri|behavior|tag          |keywords');
  console.log('--|--+--+-------------------');
  for (const r of rules) {
    console.log(
      String(r.priority).padStart(3),
      '|',
      r.stopOnMatch ? 'stop    ' : 'continue',
      '|',
      r.tag.padEnd(12),
      '|',
      '(已编译成正则)'
    );
  }
}

module.exports = { getScopeRules, printRules };
