import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Pencil, Check, X, Plus, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import PageHeader from '@/components/PageHeader.jsx';
import { fetcher } from '@/lib/api';

export default function ScopeRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTag, setFilterTag] = useState('');
  const [filterSource, setFilterSource] = useState('');
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

  const filtered = rules
    .filter((r) => !filterTag || r.tag === filterTag)
    .filter((r) => !filterSource || r.source === filterSource);
  const uniqueTags = [...new Set(rules.map((r) => r.tag))].sort();
  const sources = [...new Set(rules.map((r) => r.source))].sort();

  return (
    <div className="pb-12">
      <PageHeader
        title="业务匹配规则"
        description={
          <>
            关键词以 <span className="font-mono text-ink">|</span> 分隔，按 priority 升序匹配，命中 stopOnMatch 即停止。改动后立刻对所有新抓取的公告生效。
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3.5 w-3.5" />
              新增规则
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </>
        }
      />

      <div className="max-w-[1200px] mx-auto px-7">
        {showCreate && (
          <Card className="p-5 mb-5 border-2 border-accent/30">
            <div className="text-sm font-semibold mb-3 text-ink">新增 scope 规则</div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-ink-muted mb-1.5">Priority</label>
                <Input
                  type="number"
                  step="0.1"
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-ink-muted mb-1.5">Tag *</label>
                <Input
                  value={createForm.tag}
                  onChange={(e) => setCreateForm({ ...createForm, tag: e.target.value })}
                  placeholder="如：可行性研究"
                />
              </div>
              <div className="col-span-5">
                <label className="block text-xs text-ink-muted mb-1.5">Keywords（用 | 分隔）*</label>
                <Input
                  value={createForm.keywords}
                  onChange={(e) => setCreateForm({ ...createForm, keywords: e.target.value })}
                  placeholder="如：可研|项目策划|投资评估"
                  className="font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-muted mb-1.5">停止匹配</label>
                <select
                  value={createForm.stop_on_match}
                  onChange={(e) => setCreateForm({ ...createForm, stop_on_match: parseInt(e.target.value) })}
                  className="flex h-9 w-full rounded-md border border-rule bg-surface px-3 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  <option value={0}>累积</option>
                  <option value={1}>停止</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
              <Button size="sm" onClick={submitCreate}><Plus className="h-3.5 w-3.5" />创建</Button>
            </div>
          </Card>
        )}

        {/* Tag filter chips */}
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            onClick={() => setFilterTag('')}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              !filterTag
                ? 'bg-accent text-accent-fg border-accent'
                : 'bg-surface text-ink-muted border-rule hover:border-accent hover:text-accent'
            }`}
          >
            全部 ({rules.length})
          </button>
          {uniqueTags.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTag(t)}
              className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                filterTag === t
                  ? 'bg-accent text-accent-fg border-accent'
                  : 'bg-surface text-ink-muted border-rule hover:border-accent hover:text-accent'
              }`}
            >
              {t} ({rules.filter((r) => r.tag === t).length})
            </button>
          ))}
        </div>

        {/* Source filter chips (highlight AI-learned for self-growth mechanism) */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <span className="text-xs text-ink-subtle mr-1">来源：</span>
          <button
            onClick={() => setFilterSource('')}
            className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
              !filterSource
                ? 'bg-ink text-canvas border-ink'
                : 'bg-surface text-ink-muted border-rule hover:border-ink'
            }`}
          >
            all
          </button>
          {sources.map((s) => {
            const count = rules.filter((r) => r.source === s).length;
            const isAi = s === 'ai-learned';
            return (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                  filterSource === s
                    ? isAi
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'bg-ink text-canvas border-ink'
                    : isAi
                      ? 'bg-accent-soft text-accent border-accent/40 hover:border-accent'
                      : 'bg-surface text-ink-muted border-rule hover:border-ink'
                }`}
                title={isAi ? 'AI 自迭代沉淀规则（priority 999，最后匹配）' : '系统 / 手工规则'}
              >
                <span>{s}</span>
                <span className={filterSource === s ? 'opacity-80' : 'text-ink-subtle'}>({count})</span>
                {isAi && <Sparkles className="h-3 w-3 inline-block" />}
              </button>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-xs text-ink-muted">
              <tr>
                <th className="text-left px-4 py-2.5 w-20 font-semibold">Priority</th>
                <th className="text-left px-4 py-2.5 w-32 font-semibold">Tag</th>
                <th className="text-left px-4 py-2.5 w-24 font-semibold">来源</th>
                <th className="text-left px-4 py-2.5 font-semibold">关键词</th>
                <th className="text-left px-4 py-2.5 w-24 font-semibold">Stop</th>
                <th className="text-left px-4 py-2.5 w-24 font-semibold">状态</th>
                <th className="text-left px-4 py-2.5 w-24 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-ink-muted">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-ink-muted">无匹配规则</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t border-rule hover:bg-canvas transition-colors">
                  {editingId === r.id ? (
                    <>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number"
                          step="0.1"
                          value={editForm.priority}
                          onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                          className="w-16 h-8 px-2 text-xs font-mono border-accent"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          value={editForm.tag}
                          onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })}
                          className="w-28 h-8 px-2 text-xs border-accent"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={r.source === 'ai-learned' ? 'default' : 'muted'} className="capitalize">
                          {r.source || '-'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          value={editForm.keywords}
                          onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                          className="h-8 px-2 text-xs font-mono border-accent"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={editForm.stop_on_match ? 1 : 0}
                          onChange={(e) => setEditForm({ ...editForm, stop_on_match: parseInt(e.target.value) })}
                          className="h-8 px-2 text-xs rounded-md border border-accent bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          <option value={0}>累积</option>
                          <option value={1}>停止</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={editForm.enabled ? 1 : 0}
                          onChange={(e) => setEditForm({ ...editForm, enabled: parseInt(e.target.value) })}
                          className="h-8 px-2 text-xs rounded-md border border-accent bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          <option value={1}>启用</option>
                          <option value={0}>禁用</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={saveEdit}
                            className="p-1.5 text-success hover:bg-success-soft rounded-md"
                            title="保存"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 text-ink-muted hover:bg-surface-sunken rounded-md"
                            title="取消"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink tabular-nums">{r.priority}</td>
                      <td className="px-4 py-2.5"><Badge variant="outline">{r.tag}</Badge></td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={r.source === 'ai-learned' ? 'default' : 'muted'}
                          className="font-mono uppercase tracking-wider"
                          title={r.source === 'ai-learned' ? 'AI 自迭代沉淀规则 · priority 999' : '系统 / 手工规则'}
                        >
                          {r.source || '-'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink break-all">{r.keywords}</td>
                      <td className="px-4 py-2.5">
                        {r.stop_on_match ? <Badge variant="warning">停止</Badge> : <Badge variant="muted">累积</Badge>}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggleEnabled(r)} className="cursor-pointer" title="点击切换">
                          {r.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="muted">禁用</Badge>}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => startEdit(r)}
                          className="p-1.5 text-ink-muted hover:bg-accent-soft hover:text-accent rounded-md transition-colors"
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
        </Card>
      </div>
    </div>
  );
}