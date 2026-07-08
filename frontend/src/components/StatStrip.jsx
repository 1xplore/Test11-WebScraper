import React from 'react';
import { fmt } from '@/lib/api';

const KPI_DEFS = [
  { key: 'total',     label: '总公告数',        sub: '全部平台累计' },
  { key: 'recent_7d', label: '近 7 天新增',    sub: '本期活跃度' },
  { key: 'in_scope',  label: '主营业务可做',   sub: '待人工关注' },
  { key: 'focused',   label: '已关注 / 投标',  sub: '已介入跟进' },
  { key: 'closed',    label: '中标 / 已结束',  sub: '终态记录' },
  { key: 'last_run',  label: '最近抓取',       sub: 'cron / 手动', isDate: true },
];

export default function StatStrip({ stats }) {
  const byBiz = Object.fromEntries((stats?.by_business_match || []).map((r) => [r.k, r.n]));
  const byRev = Object.fromEntries((stats?.by_review_status || []).map((r) => [r.k, r.n]));

  const values = {
    total:     stats?.total ?? '—',
    recent_7d: stats?.recent_7d ?? '—',
    in_scope:  byBiz['主营业务可做'] || 0,
    focused:   (byRev['A.关注中'] || 0) + (byRev['H.已投标'] || 0),
    closed:    (byRev['Y.未中标'] || 0) + (byRev['Z.已中标'] || 0),
    last_run:  stats?.last_run_at ? fmt.dateTime(stats.last_run_at) : '—',
  };

  return (
    <div className="kpi-strip">
      {KPI_DEFS.map((d) => (
        <div key={d.key} className="kpi">
          <div className="kpi-label">{d.label}</div>
          <div className="kpi-value">{values[d.key]}</div>
          <div className="kpi-sub">{d.sub}</div>
        </div>
      ))}
    </div>
  );
}