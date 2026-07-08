import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fetcher } from '@/lib/api';

export default function ScopeRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetcher.listScopeRules();
      setRules(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterTag ? rules.filter((r) => r.tag === filterTag) : rules;
  const uniqueTags = [...new Set(rules.map((r) => r.tag))].sort();

  return (
    <div className="max-w-[1200px] mx-auto p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">业务匹配规则</h1>
          <p className="text-xs text-muted mt-1">关键词以 <span className="font-mono">|</span> 分隔，按 priority 升序匹配，命中 stopOnMatch 即停止。</p>
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-accent hover:underline flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setFilterTag('')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${!filterTag ? 'bg-[#0075de] text-white border-[#0075de]' : 'bg-white text-slate-600 border-[#e6e6e6] hover:border-[#0075de]'}`}
        >
          全部 ({rules.length})
        </button>
        {uniqueTags.map((t) => (
          <button
            key={t}
            onClick={() => setFilterTag(t)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${filterTag === t ? 'bg-[#0075de] text-white border-[#0075de]' : 'bg-white text-slate-600 border-[#e6e6e6] hover:border-[#0075de]'}`}
          >
            {t} ({rules.filter((r) => r.tag === t).length})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-[#e6e6e6] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f6f5f4] text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2 w-16">Priority</th>
              <th className="text-left px-3 py-2 w-32">Tag</th>
              <th className="text-left px-3 py-2">关键词</th>
              <th className="text-left px-3 py-2 w-24">Stop</th>
              <th className="text-left px-3 py-2 w-24">状态</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted">加载中…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted">无匹配规则</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-t border-[#e6e6e6] hover:bg-[#fafafa]">
                <td className="px-3 py-2 font-mono text-xs">{r.priority}</td>
                <td className="px-3 py-2"><Badge variant="outline"><Tag className="h-3 w-3 mr-1" />{r.tag}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs break-all">{r.keywords}</td>
                <td className="px-3 py-2">
                  {r.stop_on_match ? <Badge variant="warning">停止</Badge> : <Badge variant="muted">累积</Badge>}
                </td>
                <td className="px-3 py-2">
                  {r.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="muted">禁用</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}