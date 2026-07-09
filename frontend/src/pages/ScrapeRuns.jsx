import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Clock, Boxes, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import PageHeader from '@/components/PageHeader.jsx';
import { fetcher, fmt } from '@/lib/api';

export default function ScrapeRuns() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

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
    <div className="pb-12">
      <PageHeader
        title="抓取运行日志"
        description="每天 cron 完成一次写入，记录各平台抓取数量与异常。"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <div className="max-w-[1200px] mx-auto px-7">
        {loading ? (
          <div className="text-center text-ink-muted py-16 text-sm">加载中…</div>
        ) : runs.length === 0 ? (
          <Card className="p-16 text-center">
            <Clock className="h-10 w-10 mx-auto text-ink-subtle mb-3" />
            <div className="text-ink-muted">暂无抓取记录</div>
            <div className="text-xs text-ink-muted mt-2">
              运行 <code className="font-mono text-ink">node main.js --all</code> 后会生成第一条
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <Card key={r.id} className="overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-canvas transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronRight
                        className={`h-4 w-4 text-ink-muted transition-transform flex-shrink-0 ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-ink tabular-nums">
                          {fmt.dateTime(r.scrape_time)}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {fmt.dateTime(r.date_begin)} → {fmt.dateTime(r.date_end)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap flex-shrink-0">
                      {r.total_created > 0 && (
                        <Badge variant="info">+{r.total_created}</Badge>
                      )}
                      {r.total_updated > 0 && (
                        <Badge variant="warning">~{r.total_updated}</Badge>
                      )}
                      {r.total_skipped > 0 && (
                        <Badge variant="muted">·{r.total_skipped}</Badge>
                      )}
                      {r.total_error > 0 && (
                        <Badge variant="danger">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          {r.total_error}
                        </Badge>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-rule bg-canvas px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <div className="text-ink-muted mb-1 font-medium">涉及平台</div>
                        <div className="text-ink tabular-nums">{parseIds(r.platform_ids)} 个</div>
                      </div>
                      <div>
                        <div className="text-ink-muted mb-1 font-medium">新增 / 更新公告</div>
                        <div className="text-ink tabular-nums">{parseIds(r.announcement_ids)} 条</div>
                      </div>
                      <div>
                        <div className="text-ink-muted mb-1 font-medium">错误日志（scope）</div>
                        <div className="text-ink tabular-nums">{parseIds(r.scope_error_ids)} 条</div>
                      </div>
                      <div>
                        <div className="text-ink-muted mb-1 font-medium">错误日志（qual）</div>
                        <div className="text-ink tabular-nums">{parseIds(r.qual_error_ids)} 条</div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}