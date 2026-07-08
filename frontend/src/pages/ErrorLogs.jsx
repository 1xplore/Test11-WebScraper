import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Sparkles, Plus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetcher, fmt } from '@/lib/api';

export default function ErrorLogs() {
  const [kind, setKind] = useState('scope');
  const [resolvedFilter, setResolvedFilter] = useState(false);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null); // 当前正在一键建规则的 log id
  const [createForm, setCreateForm] = useState({ tag: '', priority: 30, stop_on_match: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetcher.listErrorLogs({
        kind, resolved: resolvedFilter ? 'true' : 'false', limit: 100,
      });
      setItems(data.items);
      setCounts(data.counts);
    } finally {
      setLoading(false);
    }
  }, [kind, resolvedFilter]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id) {
    await fetcher.resolveErrorLog(id, { tag: '(人工已处理)' });
    await load();
  }

  async function submitCreateRule(errorLogId, announcementTitle) {
    if (!createForm.tag) return;
    const log = items.find((i) => i.id === errorLogId);
    if (!log) return;
    // 把 raw_text 拆成关键词（按空格和标点切分，过滤短词和常见停用词）
    const tokens = (log.raw_text || '')
      .replace(/[\s,，。.;；、()（）\[\]【】"'"]/g, '|')
      .split('|')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 12)
      .slice(0, 6);
    const keywords = [...new Set(tokens)].join('|');
    if (!keywords) {
      alert('无法从 raw_text 提取关键词，请手动填 keywords');
      return;
    }
    await fetcher.createScopeRule({
      priority: createForm.priority,
      tag: createForm.tag,
      keywords,
      stop_on_match: createForm.stop_on_match,
      enabled: 1,
      source: 'from_error_log',
    });
    await fetcher.resolveErrorLog(errorLogId, { tag: createForm.tag });
    setCreating(null);
    setCreateForm({ tag: '', priority: 30, stop_on_match: false });
    await load();
  }

  const scopeUnresolved = counts?.scope_unresolved ?? 0;
  const qualUnresolved = counts?.qual_unresolved ?? 0;

  return (
    <div className="max-w-[1280px] mx-auto p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">业务匹配错误日志</h1>
          <p className="text-xs text-muted mt-1">
            当 scope_tags 判定为"其他"或资质缺失时记录。可一键生成新 scope 规则后关闭。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 类型切换 + 计数 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center bg-white border border-[#e6e8ee] rounded-md overflow-hidden">
          <button
            onClick={() => setKind('scope')}
            className={`px-4 h-9 text-sm font-medium flex items-center gap-1.5 ${kind === 'scope' ? 'bg-[#0075de] text-white' : 'text-slate-700 hover:bg-[#f6f5f4]'}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            业务匹配
            <span className={`text-xs ${kind === 'scope' ? 'opacity-90' : 'text-muted'}`}>({scopeUnresolved})</span>
          </button>
          <button
            onClick={() => setKind('qual')}
            className={`px-4 h-9 text-sm font-medium flex items-center gap-1.5 ${kind === 'qual' ? 'bg-[#0075de] text-white' : 'text-slate-700 hover:bg-[#f6f5f4]'}`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            资质匹配
            <span className={`text-xs ${kind === 'qual' ? 'opacity-90' : 'text-muted'}`}>({qualUnresolved})</span>
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.checked)}
            className="rounded"
          />
          仅看已解决
        </label>
      </div>

      {loading ? (
        <div className="text-center text-muted py-12">加载中…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-12 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-[#0d9268] opacity-50 mb-3" />
          <div className="text-muted">
            {resolvedFilter ? '没有已解决的错误日志' : `没有待解决的${kind === 'scope' ? '业务' : '资质'}匹配错误 🎉`}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((log) => (
            <div
              key={log.id}
              className={`bg-white rounded-lg border p-4 ${log.resolved ? 'border-[#e6e6e6] opacity-60' : 'border-[#fcd34d] bg-[#fffbeb]/30'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 mb-1 truncate" title={log.announcement_title}>
                    {log.announcement_title || '(公告已删除)'}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>#{log.id}</span>
                    <span>·</span>
                    <span>{fmt.dateTime(log.created_at)}</span>
                    {log.business_match && <Badge variant="outline" className="text-xs">{log.business_match}</Badge>}
                    {log.resolved === 1 && (
                      <Badge variant="success" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" />
                        已解决 {log.resolved_tag && `· ${log.resolved_tag}`}
                      </Badge>
                    )}
                  </div>
                </div>
                {!log.resolved && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setCreating(creating === log.id ? null : log.id)}>
                      <Plus className="h-3.5 w-3.5" />
                      一键建规则
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve(log.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      标记已解决
                    </Button>
                  </div>
                )}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted hover:text-slate-900 select-none">
                  原始文本（点击展开）
                </summary>
                <div className="mt-2 p-3 bg-[#f6f5f4] rounded-md whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {log.raw_text || '(空)'}
                </div>
              </details>

              {creating === log.id && (
                <div className="mt-3 p-3 bg-[#dbeafe]/30 border border-[#0075de]/20 rounded-md">
                  <div className="text-xs font-semibold text-slate-900 mb-2">从 raw_text 自动提取关键词，新建 scope 规则</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-muted mb-1">Tag（必填）</label>
                      <input
                        value={createForm.tag}
                        onChange={(e) => setCreateForm({ ...createForm, tag: e.target.value })}
                        placeholder="如：可行性研究"
                        className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">Priority</label>
                      <input
                        type="number"
                        value={createForm.priority}
                        onChange={(e) => setCreateForm({ ...createForm, priority: parseFloat(e.target.value) || 30 })}
                        className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">stop_on_match</label>
                      <select
                        value={createForm.stop_on_match ? '1' : '0'}
                        onChange={(e) => setCreateForm({ ...createForm, stop_on_match: e.target.value === '1' })}
                        className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md"
                      >
                        <option value="0">累积（多 tag）</option>
                        <option value="1">停止（单 tag）</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setCreating(null)}>取消</Button>
                    <Button size="sm" onClick={() => submitCreateRule(log.id)} disabled={!createForm.tag}>
                      <Plus className="h-3.5 w-3.5" />
                      创建并标记已解决
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}