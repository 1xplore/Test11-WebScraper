import React, { useEffect, useState } from 'react';
import { Sparkles, ExternalLink, Check, X as XIcon, Eye, Pause, Trophy, ThumbsDown, ThumbsUp, Brain } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetcher, fmt, auth } from '@/lib/api';

const REVIEW_OPTIONS = ['A.未关注', 'A.关注中', 'H.已投标', 'X.已放弃', 'Y.未中标', 'Z.已中标'];

const REVIEW_QUICK = [
  { value: 'A.关注中', label: '关注', icon: Eye,        variant: 'secondary' },
  { value: 'H.已投标', label: '投标', icon: ThumbsUp,   variant: 'warning' },
  { value: 'X.已放弃', label: '放弃', icon: XIcon,     variant: 'ghost' },
  { value: 'Y.未中标', label: '未中标', icon: ThumbsDown, variant: 'muted' },
  { value: 'Z.已中标', label: '中标', icon: Trophy,    variant: 'success' },
  { value: 'A.未关注', label: '重置', icon: Pause,     variant: 'ghost' },
];

export default function AnnouncementDetail({ id, open, onOpenChange, onChanged }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [learnResult, setLearnResult] = useState(null);
  const [learnLoading, setLearnLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    if (!open || !id) return;
    let cancelled = false;
    setLoading(true);
    setAiResult(null);
    fetcher.getAnnouncement(id).then((data) => {
      if (cancelled) return;
      setItem(data);
      setReviewNote(data.review_note || '');
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, id]);

  async function setReview(value) {
    if (!item || saving) return;
    setSaving(true);
    try {
      const updated = await fetcher.patchReview(item.id, {
        reviewStatus: value,
        reviewNote,
        reviewedBy: 'me',
      });
      setItem(updated);
      onChanged?.(updated);
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if (!item || saving) return;
    setSaving(true);
    try {
      const user = auth.getUser();
      const updated = await fetcher.patchReview(item.id, {
        reviewNote,
        reviewStatus: item.review_status,
        reviewedBy: user?.username,
      });
      setItem(updated);
      onChanged?.(updated);
    } finally {
      setSaving(false);
    }
  }

  async function runAiMatch() {
    if (!item || aiLoading) return;
    setAiLoading(true);
    try {
      const r = await fetcher.aiMatch(item.id);
      setAiResult(r);
    } catch (e) {
      setAiResult({ error: e.message });
    } finally {
      setAiLoading(false);
    }
  }

  async function runLearnFromMiss() {
    if (!item || learnLoading) return;
    setLearnLoading(true);
    setLearnResult(null);
    try {
      const r = await fetcher.learnFromMiss(item.id);
      setLearnResult(r);
      if (r.applied) {
        const fresh = await fetcher.getAnnouncement(item.id);
        setItem(fresh);
        onChanged?.(fresh);
      }
    } catch (e) {
      setLearnResult({ applied: false, error: e.message });
    } finally {
      setLearnLoading(false);
    }
  }

  async function markReviewed() {
    if (!item || saving) return;
    setSaving(true);
    try {
      const updated = await fetcher.markReviewed(item.id);
      setItem(updated);
      onChanged?.(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        {loading || !item ? (
          <div className="py-10 text-center text-ink-muted">加载中…</div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <DialogTitle className="text-xl leading-tight">{item.title}</DialogTitle>
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    {item.business_match && <Badge variant={item.business_match === '主营业务可做' ? 'success' : item.business_match === '不可做' ? 'danger' : 'warning'}>{item.business_match}</Badge>}
                    {item.project_progress && <Badge variant="outline">{item.project_progress}</Badge>}
                    {item.review_status && <Badge variant="info">{item.review_status}</Badge>}
                    {item.match_score != null && <Badge variant="outline" className="font-mono">分 {fmt.score(item.match_score)}</Badge>}
                    {item.scrape_status && <Badge variant="muted">{item.scrape_status}</Badge>}
                  </div>
                </div>
                {item.detail_url && (
                  <a href={item.detail_url} target="_blank" rel="noopener noreferrer" className="text-accent text-xs flex items-center gap-1 hover:underline mt-1">
                    <ExternalLink className="h-3 w-3" />
                    原文
                  </a>
                )}
              </div>
            </DialogHeader>

            {/* 快速审核 */}
            <div className="flex flex-wrap items-center gap-2 py-3 border-y border-rule">
              <span className="text-xs text-ink-muted mr-1">快速审核:</span>
              {REVIEW_QUICK.map((q) => {
                const active = item.review_status === q.value;
                return (
                  <Button
                    key={q.value}
                    size="sm"
                    variant={active ? 'default' : q.variant}
                    disabled={saving}
                    onClick={() => setReview(q.value)}
                  >
                    <q.icon className="h-3.5 w-3.5" />
                    {q.label}
                  </Button>
                );
              })}
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={saving} onClick={markReviewed}>
                  <Check className="h-3.5 w-3.5" />
                  标记已审核
                </Button>
              </div>
            </div>

            {/* AI 复核 */}
            <div className="ai-banner mt-4">
              <div>
                <Sparkles className="h-3.5 w-3.5 inline mr-1 text-accent" />
                <span className="ai-banner-text">AI 业务复核</span>
                {aiResult?.result && (
                  <span className="ml-3 text-ink-muted">
                    新分 {fmt.score(aiResult.result.matchScore)}
                    {aiResult.result.aiReason ? ` · ${aiResult.result.aiReason}` : ''}
                  </span>
                )}
                {aiResult?.error && <span className="ml-3 text-danger">{aiResult.error}</span>}
              </div>
              <Button size="sm" variant="ghost" disabled={aiLoading} onClick={runAiMatch}>
                {aiLoading ? '计算中…' : '触发复核'}
              </Button>
            </div>

            {/* AI 学一下 —— 自迭代：把当前规则学不到的公告交给 AI，沉淀规则 */}
            <div className="ai-banner mt-2" style={{ borderColor: 'var(--accent)' }}>
              <div>
                <Brain className="h-3.5 w-3.5 inline mr-1 text-accent" />
                <span className="ai-banner-text">AI 学一下（自迭代沉淀）</span>
                {learnResult?.applied && (
                  <span className="ml-3 text-success-fg">
                    沉淀成功：tag=<b>{learnResult.rule?.tag}</b>，关键词={JSON.stringify(learnResult.rule?.keywords)}
                    {learnResult.reason ? ` · ${learnResult.reason}` : ''}
                  </span>
                )}
                {learnResult?.applied === false && learnResult?.message && (
                  <span className="ml-3 text-warning-fg">{learnResult.message}</span>
                )}
                {learnResult?.applied === false && learnResult?.error && (
                  <span className="ml-3 text-danger">{learnResult.error}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={learnLoading}
                onClick={runLearnFromMiss}
                title="让 AI 判断此公告应归哪个 tag、并沉淀让算法自动覆盖此类的关键词"
              >
                {learnLoading ? '学习中…' : 'AI 学一下'}
              </Button>
            </div>

            {/* 字段 */}
            <div className="mt-4">
              <div className="detail-section-title">基础信息</div>
              <dl className="detail-grid">
                <dt>项目编号</dt><dd>{item.project_code || '—'}</dd>
                <dt>公告 ID</dt><dd className="font-mono text-xs">{item.notice_id || '—'}</dd>
                <dt>公告类型</dt><dd>{item.notice_type || '—'}</dd>
                <dt>招标人</dt><dd>{item.tender_corp || '—'}{item.tender_link_man && <span className="text-ink-muted"> · {item.tender_link_man}{item.tender_link_phone ? ` ${item.tender_link_phone}` : ''}</span>}</dd>
                <dt>代理机构</dt><dd>{item.agency_corp || '—'}</dd>
                <dt>所属区域</dt><dd>{(item.district || []).join('、') || '—'}</dd>
                <dt>联系地址</dt><dd>{item.address || '—'}</dd>
                <dt>合同估算价</dt><dd>{fmt.price(item.contract_price)}</dd>
                <dt>投资估算额</dt><dd>{fmt.price(item.total_investment)}</dd>
                <dt>中标金额</dt><dd>{fmt.price(item.offer_price)}</dd>
                <dt>保证金</dt><dd>{fmt.price(item.tender_bond)}</dd>
                <dt>工期天数</dt><dd>{item.planned_period ?? '—'}</dd>
              </dl>

              <div className="detail-section-title">时间节点</div>
              <dl className="detail-grid">
                <dt>公告发布日期</dt><dd>{fmt.date(item.notice_start_date)}</dd>
                <dt>报名截止</dt><dd>{fmt.date(item.notice_end_date)}</dd>
                <dt>投标截止</dt><dd>{fmt.dateTime(item.bid_submit_deadline)}</dd>
                <dt>中标公示</dt><dd>{fmt.date(item.publicity_date)}</dd>
                <dt>中标时间</dt><dd>{fmt.date(item.result_date)}</dd>
                <dt>拟招标时间</dt><dd>{fmt.date(item.planned_tender_time)}</dd>
              </dl>

              {item.description && (
                <>
                  <div className="detail-section-title">项目详情</div>
                  <div className="detail-block">{item.description}</div>
                </>
              )}

              {item.requirement && (
                <>
                  <div className="detail-section-title">资质要求</div>
                  <div className="detail-block">{item.requirement}</div>
                </>
              )}

              <div className="detail-section-title">匹配标签</div>
              <div className="flex flex-wrap gap-1.5">
                {(item.scope_tags || []).map((t) => (
                  <Badge key={t} variant="outline">{t}</Badge>
                ))}
                {(!item.scope_tags || item.scope_tags.length === 0) && (
                  <span className="text-ink-muted text-sm">— 无 —</span>
                )}
              </div>

              <div className="detail-section-title">人工备注</div>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="记录跟进情况 / 关键联系人 / 弃标原因等..."
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-md border border-rule bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-y"
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">关闭</Button>
              </DialogClose>
              <Button onClick={saveNote} disabled={saving || reviewNote === (item.review_note || '')}>
                保存备注
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}