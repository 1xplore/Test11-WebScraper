import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const BUSINESS_OPTIONS = [
  { value: 'all', label: '全部匹配' },
  { value: '主营业务可做', label: '主营业务可做' },
  { value: '部分可做', label: '部分可做' },
  { value: '不可做', label: '不可做' },
  { value: '待评估', label: '待评估' },
];

const REVIEW_OPTIONS = [
  { value: 'all', label: '全部跟进' },
  { value: 'A.未关注', label: 'A.未关注' },
  { value: 'A.关注中', label: 'A.关注中' },
  { value: 'H.已投标', label: 'H.已投标' },
  { value: 'X.已放弃', label: 'X.已放弃' },
  { value: 'Y.未中标', label: 'Y.未中标' },
  { value: 'Z.已中标', label: 'Z.已中标' },
];

const PROGRESS_OPTIONS = [
  { value: 'all', label: '全部阶段' },
  { value: '公告中', label: '公告中' },
  { value: '报名截止', label: '报名截止' },
  { value: '中标公示', label: '中标公示' },
  { value: '已中标', label: '已中标' },
];

export default function FilterBar({ filters, onChange, platforms }) {
  const [q, setQ] = useState(filters.q || '');

  // 防抖：300ms 后才推送 query 变更
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== filters.q) onChange({ q });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function set(key, value) {
    onChange({ [key]: value === 'all' ? null : value });
  }

  const platformOptions = [{ id: null, name: '全部平台' }].concat(platforms || []);

  return (
    <div className="filter-bar">
      <div className="search-box">
        <Search className="h-3.5 w-3.5 text-ink-subtle" />
        <input
          placeholder="搜索标题 / 项目编号 / 招标人..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button onClick={() => setQ('')} className="text-ink-subtle hover:text-ink transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select value={filters.businessMatch || 'all'} onValueChange={(v) => set('businessMatch', v)}>
        <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {BUSINESS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.reviewStatus || 'all'} onValueChange={(v) => set('reviewStatus', v)}>
        <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {REVIEW_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.progress || 'all'} onValueChange={(v) => set('progress', v)}>
        <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PROGRESS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.platformId || 'all'} onValueChange={(v) => onChange({ platformId: v === 'all' ? null : parseInt(v, 10) })}>
        <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="全部平台" /></SelectTrigger>
        <SelectContent>
          {platformOptions.map((p) => (
            <SelectItem key={p.id || 'all'} value={p.id == null ? 'all' : String(p.id)}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(filters.q || filters.businessMatch || filters.reviewStatus || filters.progress || filters.platformId) && (
        <button
          onClick={() => { setQ(''); onChange({ q: null, businessMatch: null, reviewStatus: null, progress: null, platformId: null }); }}
          className="inline-flex items-center h-9 px-3 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors ml-2"
        >
          清空筛选
        </button>
      )}
    </div>
  );
}