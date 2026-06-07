/**
 * 通用工具函数
 */

const fs = require('fs');
const path = require('path');

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 保存数据为JSON文件
 */
function saveAsJson(data, filePath) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`已保存: ${filePath}`);
}

/**
 * 格式化日期
 */
function formatDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 创建带时间戳的文件名
 */
function createFileName(prefix, ext) {
  const timestamp = formatDate(new Date());
  return `${prefix}_${timestamp}.${ext}`;
}

module.exports = {
  ensureDir,
  saveAsJson,
  formatDate,
  createFileName
};