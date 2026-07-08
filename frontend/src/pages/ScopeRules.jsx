import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Pencil, Check, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetcher } from '@/lib/api';

export default function ScopeRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ priority: 30, tag: '', keywords: '', stop_on_match: 0, enabled: 1 });

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

  function startEdit(rule) {
    setEditingId(rule.id);
    setEditForm({
      priority: rule.priority,
      tag: rule.tag,
      keywords: rule.keywords,
      stop_on_match: rule.stop_on_match,
      enabled: rule.enabled,
    });
  }

  async function saveEdit() {
    await fetcher.patchScopeRule(editingId, {
      priority: parseFloat(editForm.priority) || editForm.priority,
      tag: editForm.tag,
      keywords: editForm.keywords,
      stop_on_match: editForm.stop_on_match ? 1 : 0,
      enabled: editForm.enabled ? 1 : 0,
    });
    setEditingId(null);
    await load();
  }

  async function toggleEnabled(rule) {
    await fetcher.patchScopeRule(rule.id, { enabled: rule.enabled ? 0 : 1 });
    await load();
  }

  async function submitCreate() {
    if (!createForm.tag || !createForm.keywords) {
      alert('tag 和 keywords 必填');
      return;
    }
    await fetcher.createScopeRule({
      priority: parseFloat(createForm.priority) || 30,
      tag: createForm.tag,
      keywords: createForm.keywords,
      stop_on_match: createForm.stop_on_match ? 1 : 0,
      enabled: 1,
    });
    setShowCreate(false);
    setCreateForm({ priority: 30, tag: '', keywords: '', stop_on_match: 0, enabled: 1 });
    await load();
  }

  const filtered = filterTag ? rules.filter((r) => r.tag === filterTag) : rules;
  const uniqueTags = [...new Set(rules.map((r) => r.tag))].sort();

  return (
    <div className="max-w-[1280px] mx-auto p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">业务匹配规则</h1>
          <p className="text-xs text-muted mt-1">
            关键词以 <span className="font-mono">|</span> 分隔，按 priority 升序匹配，命中 stopOnMatch 即停止。改动后立刻对所有新抓取的公告生效。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5" />
            新增规则
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg border-2 border-[#0075de]/30 p-4 mb-4">
          <div className="text-sm font-semibold mb-3">新增 scope 规则</div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-muted mb-1">Priority</label>
              <input
                type="number" step="0.1"
                value={createForm.priority}
                onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-xs text-muted mb-1">Tag *</label>
              <input
                value={createForm.tag}
                onChange={(e) => setCreateForm({ ...createForm, tag: e.target.value })}
                placeholder="如：可行性研究"
                className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md"
              />
            </div>
            <div className="col-span-5">
              <label className="block text-xs text-muted mb-1">Keywords（用 | 分隔）*</label>
              <input
                value={createForm.keywords}
                onChange={(e) => setCreateForm({ ...createForm, keywords: e.target.value })}
                placeholder="如：可研|项目策划|投资评估"
                className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-muted mb-1">停止匹配</label>
              <select
                value={createForm.stop_on_match}
                onChange={(e) => setCreateForm({ ...createForm, stop_on_match: parseInt(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-[#e6e6e6] rounded-md"
              >
                <option value={0}>累积</option>
                <option value={1}>停止</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
            <Button size="sm" onClick={submitCreate}><Plus className="h-3.5 w-3.5" />创建</Button>
          </div>
        </div>
      )}

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
              <th className="text-left px-3 py-2 w-28">Tag</th>
              <th className="text-left px-3 py-2">关键词</th>
              <th className="text-left px-3 py-2 w-20">Stop</th>
              <th className="text-left px-3 py-2 w-20">状态</th>
              <th className="text-left px-3 py-2 w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted">加载中…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted">无匹配规则</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-t border-[#e6e6e6] hover:bg-[#fafafa]">
                {editingId === r.id ? (
                  <>
                    <td className="px-2 py-2">
                      <input
                        type="number" step="0.1"
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                        className="w-14 px-1 py-0.5 text-xs border border-[#0075de] rounded font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={editForm.tag}
                        onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })}
                        className="w-24 px-1 py-0.5 text-xs border border-[#0075de] rounded"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={editForm.keywords}
                        onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                        className="w-full px-1 py-0.5 text-xs border border-[#0075de] rounded font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={editForm.stop_on_match ? 1 : 0}
                        onChange={(e) => setEditForm({ ...editForm, stop_on_match: parseInt(e.target.value) })}
                        className="text-xs border border-[#0075de] rounded px-1 py-0.5"
                      >
                        <option value={0}>累积</option>
                        <option value={1}>停止</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={editForm.enabled ? 1 : 0}
                        onChange={(e) => setEditForm({ ...editForm, enabled: parseInt(e.target.value) })}
                        className="text-xs border border-[#0075de] rounded px-1 py-0.5"
                      >
                        <option value={1}>启用</option>
                        <option value={0}>禁用</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={saveEdit} className="p-1 text-[#0d9268] hover:bg-[#d4f0e1] rounded" title="保存">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="取消">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-mono text-xs">{r.priority}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{r.tag}</Badge></td>
                    <td className="px-3 py-2 font-mono text-xs break-all">{r.keywords}</td>
                    <td className="px-3 py-2">
                      {r.stop_on_match ? <Badge variant="warning">停止</Badge> : <Badge variant="muted">累积</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleEnabled(r)}
                        className="cursor-pointer"
                        title="点击切换"
                      >
                        {r.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="muted">禁用</Badge>}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => startEdit(r)}
                        className="p-1 text-slate-500 hover:bg-[#dbeafe] hover:text-[#0075de] rounded"
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}