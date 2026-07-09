import React from 'react';
import { cn } from '@/lib/utils';

/**
 * PageHeader — 标准页面顶部
 *
 * 设计意图：
 *   - 标题 + 描述 + 操作区，按 1 行布局；移动端 stack
 *   - 标题 22px / 描述 12px（仪表盘工具的常见节奏，密度大于 SaaS marketing 页）
 *   - 操作区用 ml-auto 推到右
 *   - 不强制 actions 顺序：放按钮、链接、计数都可以
 */
export default function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}) {
  return (
    <div
      className={cn(
        'max-w-[1200px] mx-auto px-7 pt-7 pb-5 flex items-start justify-between gap-6',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">{description}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}