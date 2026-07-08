import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatStrip from '@/components/StatStrip.jsx';
import FilterBar from '@/components/FilterBar.jsx';
import AnnouncementCard from '@/components/AnnouncementCard.jsx';
import AnnouncementDetail from '@/components/AnnouncementDetail.jsx';
import { fetcher } from '@/lib/api';

const SORT_OPTIONS = [
  { value: 'notice_start_date_desc', label: '发布日期 ↓', sortBy: 'notice_start_date', sortDir: 'DESC' },
  { value: 'notice_start_date_asc',  label: '发布日期 ↑', sortBy: 'notice_start_date', sortDir: 'ASC' },
  { value: 'match_score_desc',       label: '匹配分 ↓',   sortBy: 'match_score', sortDir: 'DESC' },
  { value: 'contract_price_desc',    label: '预算 ↓',     sortBy: 'contract_price', sortDir: 'DESC' },
  { value: 'created_at_desc',        label: '入库时间 ↓', sortBy: 'created_at', sortDir: 'DESC' },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [sortKey, setSortKey] = useState('notice_start_date_desc');
  const [platforms, setPlatforms] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const sort = SORT_OPTIONS.find((o) => o.value === sortKey);
      const params = {
        ...filters,
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
        page,
        pageSize: PAGE_SIZE,
      };
      Object.keys(params).forEach((k) => { if (params[k] == null || params[k] === '') delete params[k]; });
      const [statsData, listData, platData] = await Promise.all([
        fetcher.getStats(),
        fetcher.listAnnouncements(params),
        fetcher.listPlatforms(),
      ]);
      setStats(statsData);
      setItems(listData.items);
      setTotal(listData.total);
      setPlatforms(platData);
    } finally {
      setLoading(false);
    }
  }, [filters, sortKey, page]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function applyFilters(patch) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function handleItemChanged(updated) {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? { ...it, ...updated } : it)));
  }

  return (
    <>
      <StatStrip stats={stats} />
      <FilterBar filters={filters} onChange={applyFilters} platforms={platforms} />

      <div className="filter-bar" style={{ paddingTop: 0, paddingBottom: 8 }}>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{loading ? '加载中…' : `共 ${total} 条`}</span>
          {Object.values(filters).filter(Boolean).length > 0 && (
            <span>· 已应用 {Object.values(filters).filter(Boolean).length} 个筛选</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted" />
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a
            href={fetcher.exportCsvUrl(filters)}
            download
            className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md border border-[#e6e6e6] bg-white text-slate-700 hover:bg-[#f6f5f4]"
          >
            <Download className="h-3.5 w-3.5" />
            导出 CSV
          </a>
          <Button size="sm" variant="ghost" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bid-card">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-6 w-full" />
              <div className="skeleton h-16 w-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">∅</div>
          <div>暂无匹配的招标公告</div>
          <div className="text-xs mt-2">试试调整筛选条件，或在「抓取来源」页触发一次手动抓取</div>
        </div>
      ) : (
        <div className="card-grid">
          {items.map((it) => (
            <AnnouncementCard key={it.id} item={it} onClick={(x) => setOpenId(x.id)} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2 pb-8">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="text-xs text-muted self-center">
            第 {page} 页 / 共 {Math.ceil(total / PAGE_SIZE)} 页
          </span>
          <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      )}

      <AnnouncementDetail
        id={openId}
        open={openId != null}
        onOpenChange={(o) => { if (!o) setOpenId(null); }}
        onChanged={handleItemChanged}
      />
    </>
  );
}