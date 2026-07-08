import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Clock, Boxes, AlertTriangle } from 'lucide-react';
import { fetcher, fmt } from '@/lib/api';

export default function ScrapeRuns() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetcher.listScrapeRuns(50);
      setRuns(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function parseIds(s) {
    try { const v = JSON.parse(s); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
  }

  return (
    <div className="max-w-[1200px] mx-auto p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">抓取运行日志</h1>
          <p className="text-xs text-muted mt-1">每天 cron 完成一次写入，记录各平台抓取数量与异常。</p>
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-accent hover:underline flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {loading ? (
        <div className="text-center text-muted py-12">加载中…</div>
      ) : runs.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-12 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted opacity-40 mb-3" />
          <div className="text-muted">暂无抓取记录</div>
          <div className="text-xs text-muted mt-2">运行 <code className="font-mono">node main.js --all</code> 后会生成第一条</div>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <div key={r.id} className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium text-sm">{fmt.dateTime(r.scrape_time)}</div>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-[#dbeafe] text-[#1e40af] rounded">+{r.total_created}</span>
                  <span className="px-2 py-0.5 bg-[#fef3c7] text-[#92400e] rounded">~{r.total_updated}</span>
                  <span className="px-2 py-0.5 bg-[#f6f5f4] text-slate-600 rounded">·{r.total_skipped}</span>
                  {r.total_error > 0 && (
                    <span className="px-2 py-0.5 bg-[#fee2e2] text-[#991b1b] rounded flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />{r.total_error}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted">
                <div>
                  <div className="font-medium text-slate-700 mb-0.5">时间窗</div>
                  <div>{fmt.dateTime(r.date_begin)} → {fmt.dateTime(r.date_end)}</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700 mb-0.5 flex items-center gap-1">
                    <Boxes className="h-3 w-3" />涉及平台
                  </div>
                  <div>{parseIds(r.platform_ids)} 个</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700 mb-0.5">新增 / 更新公告</div>
                  <div>{parseIds(r.announcement_ids)} 条</div>
                </div>
                <div>
                  <div className="font-medium text-slate-700 mb-0.5">错误日志</div>
                  <div>scope {parseIds(r.scope_error_ids)} · qual {parseIds(r.qual_error_ids)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}