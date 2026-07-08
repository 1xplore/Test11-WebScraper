import React, { useEffect, useState, useCallback } from 'react';
import { Power, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetcher, fmt } from '@/lib/api';

const STATUS_VARIANT = {
  '已配置运行中': 'success',
  '有错误': 'danger',
  '访问受限故停用': 'warning',
  '已配置但停用': 'muted',
};

export default function Platforms() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetcher.listPlatforms();
      setList(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
              <div className="flex gap-2 mt-auto">
                <Button size="sm" variant={p.status === '已配置运行中' ? 'outline' : 'default'} onClick={() => toggle(p)} disabled={busy === p.id}>
                  <Power className="h-3.5 w-3.5" />
                  {p.status === '已配置运行中' ? '停用' : '启用'}
                </Button>
                {p.status !== '有错误' && (
                  <Button size="sm" variant="ghost" onClick={() => markError(p)} disabled={busy === p.id}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    标记有错
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}