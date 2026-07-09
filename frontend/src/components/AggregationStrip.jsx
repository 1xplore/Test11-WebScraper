import React, { useMemo } from 'react';

const DEFAULT_TOP_N = 6;

function buildRows(raw, topN, nameKey, countKey) {
  if (!raw || raw.length === 0) return [];
  const sorted = [...raw].sort((a, b) => (b[countKey] || 0) - (a[countKey] || 0));
  const sliced = sorted.slice(0, topN);
  const max = sliced[0]?.[countKey] || 1;
  return sliced.map((row) => ({
    key: row[nameKey] || '(未命名)',
    count: row[countKey] || 0,
    pct: max > 0 ? Math.round((row[countKey] / max) * 100) : 0,
  }));
}

function AggCard({ title, total, rows, onRowClick, emptyHint }) {
  return (
    <div className="agg-card">
      <div className="agg-card-header">
        <div className="agg-card-title">{title}</div>
        {total > 0 && <div className="agg-card-count">合计 {total}</div>}
      </div>
      {rows.length === 0 ? (
        <div className="agg-empty">{emptyHint}</div>
      ) : (
        rows.map((row) => (
          <div
            key={row.key}
            className="agg-row"
            onClick={onRowClick ? () => onRowClick(row.key) : undefined}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row.key); } } : undefined}
          >
            <div className="agg-row-name" title={row.key}>{row.key}</div>
            <div className="agg-bar">
              <div className="agg-bar-fill" style={{ width: `${row.pct}%` }} />
            </div>
            <div className="agg-row-count">{row.count}</div>
          </div>
        ))
      )}
    </div>
  );
}

export default function AggregationStrip({ stats, platforms = [], topN = DEFAULT_TOP_N, onSelectDistrict, onSelectPlatform }) {
  const platformRows = useMemo(() => {
    const raw = (stats?.by_platform || []).map((r) => ({ key: r.platform, count: r.n }));
    return buildRows(raw, topN, 'key', 'count');
  }, [stats, topN]);

  const districtRows = useMemo(() => {
    return buildRows(stats?.by_district || [], topN, 'k', 'n');
  }, [stats, topN]);

  const platformTotals = platformRows.reduce((s, r) => s + r.count, 0);
  const districtTotals = districtRows.reduce((s, r) => s + r.count, 0);

  const platformNameToId = useMemo(() => {
    const map = new Map();
    for (const p of platforms || []) map.set(p.name, p.id);
    return map;
  }, [platforms]);

  function handlePlatform(name) {
    if (!onSelectPlatform) return;
    const id = platformNameToId.get(name);
    onSelectPlatform(id ?? null, name);
  }

  function handleDistrict(name) {
    if (!onSelectDistrict) return;
    onSelectDistrict(name);
  }

  return (
    <div className="agg-strip">
      <AggCard
        title="平台分布"
        total={platformTotals}
        rows={platformRows}
        onRowClick={onSelectPlatform ? handlePlatform : null}
        emptyHint="暂无抓取记录"
      />
      <AggCard
        title={`区域分布（Top ${topN}）`}
        total={districtTotals}
        rows={districtRows}
        onRowClick={onSelectDistrict ? handleDistrict : null}
        emptyHint="暂无区域数据"
      />
    </div>
  );
}
