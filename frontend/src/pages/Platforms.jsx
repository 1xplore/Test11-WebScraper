import React, { useEffect, useState, useCallback } from 'react';
import { Power, AlertTriangle, RefreshCw, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetcher, fmt } from '@/lib/api';

const STATUS_VARIANT = {
  '已配置运行中': 'success',
  '有错误': 'danger',
  '访问受限故停用': 'warning',
  '已配置但停用': 'muted',
};

// scraper.site_key 映射（与 server/src/routes/scrape-trigger.js ALLOWED_SITES 一致）
const SITE_KEYS = [
  'whzbtbxt', 'whzfcgxt', 'dongxihu', 'huangpi', 'caidian', 'jingkai',
  'changjiangxinqu', 'xinzhou', 'qingshan', 'hongshan', 'donghuwx',
  'qiaokou', 'hanyang', 'donghu', 'jiangxia', 'jiangan', 'jianghan',
  'wuchang', 'hubeigov', 'huarun', 'dongfeng',
];

export default function Platforms() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [triggering, setTriggering] = useState(null); // { scriptId, taskId, status }
  const [tasks, setTasks] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetcher.listPlatforms();
      setList(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const data = await fetcher.listTriggerTasks();
      setTasks(data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTasks(); const t = setInterval(loadTasks, 2000); return () => clearInterval(t); }, [loadTasks]);

  function siteKeyFor(p) {
    // script_id 转 site_key（去掉 _district 后缀 → 取首段作为 key）
    // 例如 'wuhan_dongxihu_district' → 'dongxihu'?  但 main.js 里 site 是 dongxihu，不是 wuhan_dongxihu
    // 我们的 scraper site key 列表（SITE_KEYS）跟 platforms.script_id 不一定一一对应
    // 简单方案：人工映射（script_id → site_key）
    const map = {
      'wuhan_public': 'whzbtbxt',
      'wuhan_zhongcai': 'whzfcgxt',
      'wuhan_dongxihu_district': 'dongxihu',
      'wuhan_huangpi_district': 'huangpi',
      'wuhan_caidian_district': 'caidian',
      'wuhan_jingkai_district': 'jingkai',
      'wuhan_changjiangxinqu_district': 'changjiangxinqu',
      'wuhan_xinzhou_district': 'xinzhou',
      'wuhan_qingshan_district': 'qingshan',
      'wuhan_hongshan_district': 'hongshan',
      'wuhan_donghuwx_district': 'donghuwx',
      'wuhan_qiaokou_district': 'qiaokou',
      'wuhan_hanyang_district': 'hanyang',
      'wuhan_donghu_district': 'donghu',
      'wuhan_jiangxia_district': 'jiangxia',
      'wuhan_jiangan_district': 'jiangan',
      'wuhan_jianghan_district': 'jianghan',
      'wuhan_wuchang_district': 'wuchang',
      'hubei_gov': 'hubeigov',
      'huarun': 'huarun',
      'dongfeng': 'dongfeng',
    };
    return map[p.script_id] || null;
  }

  async function toggle(p) {
    if (busy) return;
    setBusy(p.id);
    try {
      const newStatus = p.status === '已配置运行中' ? '已配置但停用' : '已配置运行中';
      await fetcher.patchPlatform(p.script_id, { status: newStatus });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function markError(p) {
    if (busy) return;
    setBusy(p.id);
    try {
      await fetcher.patchPlatform(p.script_id, { status: '有错误', last_error: '人工标记为有错误' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function trigger(p, pages = 1, size = 10) {
    const siteKey = siteKeyFor(p);
    if (!siteKey) {
      alert(`找不到 platform ${p.script_id} 对应的 scraper site key`);
      return;
    }
    setTriggering({ scriptId: p.script_id, status: 'starting' });
    try {
      const r = await fetcher.triggerScrape({ site: siteKey, pages, size });
      setTriggering({ scriptId: p.script_id, taskId: r.task_id, status: 'running' });
    } catch (e) {
      setTriggering({ scriptId: p.script_id, status: 'error', error: e.message });
      setTimeout(() => setTriggering(null), 3000);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">抓取来源管理</h1>
          <p className="text-xs text-muted mt-1">切换平台运行状态。下次 cron（每天 5:00）会按"已配置运行中"过滤执行。</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted py-12">加载中…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-[#e6e6e6] p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted font-mono mt-0.5">{p.script_id}</div>
                </div>
                <Badge variant={STATUS_VARIANT[p.status] || 'muted'}>{p.status}</Badge>
              </div>
              {p.homepage && (
                <a href={p.homepage} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline truncate">
                  {p.homepage}
                </a>
              )}
              <div className="text-xs text-muted flex gap-4 border-t border-[#e6e6e6] pt-3">
                <span>运行 {p.total_runs} 次</span>
                <span>最近 {p.last_run_at ? fmt.dateTime(p.last_run_at) : '—'}</span>
              </div>
              {p.last_error && (
                <div className="text-xs text-danger bg-[#fef2f2] px-2 py-1 rounded truncate" title={p.last_error}>
                  {p.last_error}
                </div>
              )}
              <div className="flex gap-2 mt-auto flex-wrap">
                <Button size="sm" variant={p.status === '已配置运行中' ? 'outline' : 'default'} onClick={() => toggle(p)} disabled={busy === p.id}>
                  <Power className="h-3.5 w-3.5" />
                  {p.status === '已配置运行中' ? '停用' : '启用'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => trigger(p, 1, 10)} disabled={busy === p.id || (triggering?.scriptId === p.script_id && triggering?.status === 'running')}>
                  {triggering?.scriptId === p.script_id && triggering?.status === 'running' ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />运行中</>
                  ) : (
                    <><Play className="h-3.5 w-3.5" />立即抓取</>
                  )}
                </Button>
                {p.status !== '有错误' && (
                  <Button size="sm" variant="ghost" onClick={() => markError(p)} disabled={busy === p.id}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    标记有错
                  </Button>
                )}
              </div>
              {triggering?.scriptId === p.script_id && (
                <div className={`text-xs mt-2 px-2 py-1 rounded ${triggering.status === 'error' ? 'bg-[#fce4e4] text-[#c63838]' : 'bg-[#e0eaff] text-[#1e40af]'}`}>
                  {triggering.status === 'error' ? `✗ ${triggering.error}` : '✓ 已触发，2 秒后看 scrape-runs 页面'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}