import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Loop 37: AI 学习时序迷你图（自绘 SVG，避免引外部 lib）
 *  3 个 rule_type 各画一组柱 + 共享 X 轴日期
 *  数字标签在顶；空数据态友好提示
 */
export default function TrendChart({ trend, days, onDaysChange }) {
  if (!trend || !trend.days || !trend.days.length) {
    return (
      <div className="bg-surface border border-rule rounded-md p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
            <TrendingUp className="h-4 w-4" />
            AI 学习趋势（最近 {days} 天）
          </div>
          <DaysPicker days={days} onChange={onDaysChange} />
        </div>
        <div className="text-xs text-ink-muted text-center py-6">暂无 AI 学习记录</div>
      </div>
    );
  }

  const days_arr = trend.days;
  const series = [
    { key: 'scope', label: '业务范围', color: 'var(--accent)' },
    { key: 'qual', label: '资质', color: 'var(--info)' },
    { key: 'notice_type', label: '公告类型', color: 'var(--success)' },
  ];
  // max value for scaling
  const allValues = series.flatMap((s) => trend.by_type[s.key] || []);
  const maxVal = Math.max(1, ...allValues);

  const W = 600, H = 100, PADDING = 8;
  const innerW = W - PADDING * 2;
  const innerH = H - PADDING * 2 - 14;  // 留 14 给 legend
  const barGroupW = innerW / Math.max(days_arr.length, 1);
  const barW = Math.min(8, barGroupW / 4);  // 每组 3 根柱

  return (
    <div className="bg-surface border border-rule rounded-md p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
          <TrendingUp className="h-4 w-4" />
          AI 学习趋势（最近 {days} 天）
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                <span style={{ background: s.color }} className="inline-block w-2.5 h-2.5 rounded-sm" />
                {s.label}
              </span>
            ))}
          </div>
          <DaysPicker days={days} onChange={onDaysChange} />
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24">
        {/* Y axis baseline */}
        <line x1={PADDING} y1={PADDING + innerH} x2={PADDING + innerW} y2={PADDING + innerH} stroke="var(--rule)" strokeWidth="0.5" />
        {days_arr.map((d, i) => {
          const groupX = PADDING + i * barGroupW;
          return series.map((s, j) => {
            const v = (trend.by_type[s.key] || [])[i] || 0;
            const h = (v / maxVal) * innerH;
            const x = groupX + j * (barW + 1) + (barGroupW - barW * 3 - 2) / 2;
            const y = PADDING + innerH - h;
            return (
              <g key={`${i}-${j}`}>
                <rect x={x} y={y} width={barW} height={h} fill={s.color} rx="1" />
                {v > 0 && h > 8 && (
                  <text x={x + barW / 2} y={y - 1} fontSize="6" textAnchor="middle" fill="var(--ink-muted)">
                    {v}
                  </text>
                )}
              </g>
            );
          });
        })}
        {/* X axis labels (every Nth) */}
        {days_arr.map((d, i) => {
          // 每 7 个日期才显示一次（避免挤）
          if (days_arr.length > 14 && i % 7 !== 0 && i !== days_arr.length - 1) return null;
          const x = PADDING + i * barGroupW + barGroupW / 2;
          return (
            <text key={`xl-${i}`} x={x} y={H - 2} fontSize="6" textAnchor="middle" fill="var(--ink-muted)">
              {d.slice(5)} {/* MM-DD */}
            </text>
          );
        })}
      </svg>
      <div className="text-[10px] text-ink-subtle text-center mt-1">
        总计: scope {trend.totals?.scope || 0} · qual {trend.totals?.qual || 0} · notice_type {trend.totals?.notice_type || 0}
      </div>
    </div>
  );
}

function DaysPicker({ days, onChange }) {
  const opts = [7, 14, 30];
  return (
    <Select value={String(days)} onValueChange={(v) => onChange(parseInt(v, 10))}>
      <SelectTrigger className="h-7 w-20 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((d) => (
          <SelectItem key={d} value={String(d)}>{d} 天</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
