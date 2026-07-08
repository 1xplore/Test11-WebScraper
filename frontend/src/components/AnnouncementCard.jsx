import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmt } from '@/lib/api';

function BusinessBadge({ value }) {
  const map = {
    '主营业务可做': { variant: 'success', icon: '✓' },
    '部分可做':     { variant: 'warning', icon: '~' },
    '不可做':       { variant: 'danger',  icon: '✕' },
    '待评估':       { variant: 'muted',   icon: '?' },
  };
  const cfg = map[value] || map['待评估'];
  return (
    <Badge variant={cfg.variant}>
      <span className="mr-0.5 font-bold">{cfg.icon}</span>{value || '待评估'}
    </Badge>
  );
}

function ProgressBadge({ value }) {
  if (!value) return null;
  const map = {
    '公告中':    { variant: 'info' },
    '报名截止':  { variant: 'warning' },
    '中标公示':  { variant: 'success' },
    '已中标':    { variant: 'success' },
    '已流标':    { variant: 'danger' },
    '已终止':    { variant: 'danger' },
    '已结束':    { variant: 'muted' },
  };
  const cfg = map[value] || { variant: 'muted' };
  return <Badge variant={cfg.variant}>{value}</Badge>;
}

function daysUntil(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline.replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  const diff = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return diff;
}

function DeadlineBadge({ deadline, label = '截止' }) {
  const days = daysUntil(deadline);
  if (days == null) return null;
  if (days < 0) return <Badge variant="muted">已{label}</Badge>;
  let variant = 'muted';
  let text = `${label} ${days} 天`;
  if (days <= 3)  { variant = 'danger';  text = `🔥 ${days} 天 ${label}`; }
  else if (days <= 7)  { variant = 'warning'; text = `${days} 天 ${label}`; }
  return <Badge variant={variant}>{text}</Badge>;
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

function ScoreBadge({ score }) {
  if (score == null) return null;
  const tone = score >= 0.7 ? 'success' : score >= 0.4 ? 'warning' : 'danger';
  return (
    <Badge variant={tone} className="tabular">
      {fmt.score(score)}
    </Badge>
  );
}

export default function AnnouncementCard({ item, onClick }) {
  const tags = item.scope_tags || [];
  const districts = item.district || [];
  return (
    <article
      className="bid-card"
      data-biz={item.business_match || '待评估'}
      onClick={() => onClick(item)}
    >
      <div className="bid-card-header">
        <div className="bid-card-chips">
          <BusinessBadge value={item.business_match} />
          <ProgressBadge value={item.project_progress} />
          <DeadlineBadge deadline={item.bid_submit_deadline || item.notice_end_date} />
          <ReviewBadge value={item.review_status} />
          <ScoreBadge score={item.match_score} />
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
        <div className="bid-card-tags">
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="bid-card-tag">{t}</span>
          ))}
          {tags.length > 4 && <span className="bid-card-tag">+{tags.length - 4}</span>}
        </div>
      )}

      <div className="bid-card-meta">
        <div>
          <div className="bid-card-meta-label">招标人</div>
          <div className="bid-card-meta-value">{item.tender_corp || '—'}</div>
        </div>
        <div>
          <div className="bid-card-meta-label">代理</div>
          <div className="bid-card-meta-value">{item.agency_corp || '—'}</div>
        </div>
        <div>
          <div className="bid-card-meta-label">区域</div>
          <div className="bid-card-meta-value">{districts[0] || '—'}</div>
        </div>
        <div>
          <div className="bid-card-meta-label">类型</div>
          <div className="bid-card-meta-value">{item.notice_type || '—'}</div>
        </div>
      </div>

      <div className="bid-card-footer">
        <div className="bid-card-date">
          {fmt.date(item.notice_start_date)}
          {item.notice_end_date && (
            <span className="ml-2 text-subtle">截止 {fmt.date(item.notice_end_date)}</span>
          )}
        </div>
        {item.detail_url && (
          <a
            href={item.detail_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="bid-card-link"
          >
            原文 <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}