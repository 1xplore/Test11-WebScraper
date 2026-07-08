import React from 'react';
import { ExternalLink, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt } from '@/lib/api';

function BusinessBadge({ value }) {
  const map = {
    '主营业务可做': { variant: 'success', emoji: '✓' },
    '部分可做': { variant: 'warning', emoji: '~' },
    '不可做': { variant: 'danger', emoji: '✕' },
    '待评估': { variant: 'muted', emoji: '?' },
  };
  const cfg = map[value] || { variant: 'muted', emoji: '?' };
  return (
    <Badge variant={cfg.variant}>
      <span className="mr-0.5">{cfg.emoji}</span>{value || '待评估'}
    </Badge>
  );
}

function ProgressBadge({ value }) {
  if (!value) return null;
  const map = {
    '公告中': { variant: 'info' },
    '报名截止': { variant: 'warning' },
    '中标公示': { variant: 'success' },
    '已中标': { variant: 'success' },
    '已流标': { variant: 'danger' },
    '已终止': { variant: 'danger' },
    '已结束': { variant: 'muted' },
  };
  const cfg = map[value] || { variant: 'muted' };
  return <Badge variant={cfg.variant}>{value}</Badge>;
}

function ReviewBadge({ value }) {
  if (!value || value === 'A.未关注') return null;
  const map = {
    'A.关注中': { variant: 'info' },
    'H.已投标': { variant: 'warning' },
    'X.已放弃': { variant: 'muted' },
    'Y.未中标': { variant: 'muted' },
    'Z.已中标': { variant: 'success' },
  };
  const cfg = map[value] || { variant: 'muted' };
  return <Badge variant={cfg.variant}>{value}</Badge>;
}

export default function AnnouncementCard({ item, onClick }) {
  const tags = item.scope_tags || [];
  const districts = item.district || [];
  return (
    <article
      className="bid-card"
      onClick={() => onClick(item)}
    >
      <div className="bid-card-header">
        <div className="bid-card-chips">
          <BusinessBadge value={item.business_match} />
          <ProgressBadge value={item.project_progress} />
          <ReviewBadge value={item.review_status} />
          {item.match_score != null && (
            <Badge variant="outline" className="font-mono">
              {fmt.score(item.match_score)}
            </Badge>
          )}
        </div>
        <div className="bid-card-price">
          {item.contract_price != null && (
            <>
              <div className="bid-card-price-amount">{fmt.price(item.contract_price)}</div>
              <div className="bid-card-price-label">预算</div>
            </>
          )}
        </div>
      </div>

      <div className="bid-card-title">{item.title}</div>

      {tags.length > 0 && (
        <div className="text-xs text-muted">
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="inline-block mr-1 px-1.5 py-0.5 bg-[#f6f5f4] rounded text-slate-600">{t}</span>
          ))}
          {tags.length > 4 && <span className="text-muted">+{tags.length - 4}</span>}
        </div>
      )}

      <div className="bid-card-meta">
        <div>
          <span className="bid-card-meta-label">招标人</span>
          <span className="bid-card-meta-value">{item.tender_corp || '—'}</span>
        </div>
        <div>
          <span className="bid-card-meta-label">代理</span>
          <span className="bid-card-meta-value">{item.agency_corp || '—'}</span>
        </div>
        <div>
          <span className="bid-card-meta-label">区域</span>
          <span className="bid-card-meta-value">{districts[0] || '—'}</span>
        </div>
        <div>
          <span className="bid-card-meta-label">类型</span>
          <span className="bid-card-meta-value">{item.notice_type || '—'}</span>
        </div>
      </div>

      <div className="bid-card-footer">
        <div className="bid-card-date flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {fmt.date(item.notice_start_date)}
          {item.notice_end_date && (
            <span className="ml-2 text-muted">截止 {fmt.date(item.notice_end_date)}</span>
          )}
        </div>
        {item.detail_url && (
          <a
            href={item.detail_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            原文
          </a>
        )}
      </div>
    </article>
  );
}