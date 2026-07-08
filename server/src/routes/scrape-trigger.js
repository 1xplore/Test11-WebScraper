/**
 * 手动触发抓取：通过 child_process spawn `node main.js <site>`
 *
 * 设计：异步触发（不等子进程结束），返回 task_id 供前端轮询 scrape_runs 进度
 */
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const storage = require('../storage/adapter');

const router = express.Router();

// 站点 key → scraper.meta.scriptId 映射（只列 --all 模式下可能被触发的）
const ALLOWED_SITES = [
  'whzbtbxt', 'whzfcgxt', 'dongxihu', 'huangpi', 'caidian', 'jingkai',
  'changjiangxinqu', 'xinzhou', 'qingshan', 'hongshan', 'donghuwx',
  'qiaokou', 'hanyang', 'donghu', 'jiangxia', 'jiangan', 'jianghan',
  'wuchang', 'hubeigov', 'huarun', 'dongfeng',
];

// task_id → { child, status, startedAt, finishedAt, site, exitCode, stdout }
const tasks = new Map();

router.get('/tasks', (req, res) => {
  res.json(
    [...tasks.entries()].map(([id, t]) => ({
      id,
      site: t.site,
      status: t.status,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      exitCode: t.exitCode,
    }))
  );
});

router.get('/tasks/:id', (req, res) => {
  const t = tasks.get(parseInt(req.params.id, 10));
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ id: parseInt(req.params.id, 10), ...t });
});

// POST /api/scrape-trigger  body: { site, pages?, size? }
router.post('/', (req, res) => {
  const { site, pages = 1, size = 10 } = req.body || {};
  if (!site || !ALLOWED_SITES.includes(site)) {
    return res.status(400).json({ error: `未知 site: ${site}（可选：${ALLOWED_SITES.join(', ')}）` });
  }

  const id = Date.now();
  const mainPath = path.join(__dirname, '../../../main.js');
  const child = spawn(
    process.execPath,
    [mainPath, site, '--pages', String(pages), '--size', String(size), '--no-skip-existing'],
    { cwd: path.join(__dirname, '../../..'), env: { ...process.env, STORAGE: 'sqlite' } }
  );

  const task = {
    site,
    pages, size,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
    child,
  };
  tasks.set(id, task);

  child.stdout.on('data', (d) => { task.stdout += d.toString(); });
  child.stderr.on('data', (d) => { task.stderr += d.toString(); });
  child.on('exit', (code) => {
    task.status = code === 0 ? 'success' : 'failed';
    task.exitCode = code;
    task.finishedAt = new Date().toISOString();
    // 只保留最近 10 个 task
    if (tasks.size > 10) {
      const oldest = [...tasks.keys()].slice(0, tasks.size - 10);
      oldest.forEach((k) => tasks.delete(k));
    }
  });

  res.json({ task_id: id, status: 'started', site, pages, size });
});

module.exports = router;