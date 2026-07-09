import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, TestTube2, Check, AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { fetcher } from '@/lib/api';

const PROVIDER_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI 兼容（OpenAI / DeepSeek / 自建网关都走这个）' },
];

export default function AiConfigSettings() {
  const [cfg, setCfg] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetcher.getAiSettings()
      .then((data) => setCfg(data))
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  function flashSaved() {
    setSaved(true);
    setError('');
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleSave() {
    if (!cfg) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      };
      if (apiKey.length > 0) body.apiKey = apiKey;
      const next = await fetcher.saveAiSettings(body);
      setCfg(next);
      setApiKey('');
      setShowKey(false);
      flashSaved();
    } catch (e) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!cfg) return;
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const body = {
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      };
      if (apiKey.length > 0) body.apiKey = apiKey;
      const result = await fetcher.testAiSettings(body);
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, error: e.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  }

  async function handleClearKey() {
    if (!cfg?.hasApiKey) return;
    if (!confirm('确认要清除当前的 AI API Key？此操作不会影响其它设置。')) return;
    setSaving(true);
    setError('');
    try {
      const next = await fetcher.saveAiSettings({ clearApiKey: true });
      setCfg(next);
      setApiKey('');
      setShowKey(false);
      flashSaved();
    } catch (e) {
      setError(e.message || '清除失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !cfg) {
    return <div className="py-10 text-center text-ink-muted text-sm">加载中…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-ink-muted max-w-md">
          配置 AI 语义复核用的服务。留空时招标线索匹配仍可工作（只用本地算法）。
        </div>
        <Badge variant={cfg.hasApiKey ? 'success' : 'muted'}>
          {cfg.hasApiKey ? `已配置（${cfg.maskedKey}）` : '未启用'}
        </Badge>
      </div>

      <div className="grid gap-2">
        <label className="text-xs font-medium text-ink-muted">提供方</label>
        <Select
          value={cfg.provider}
          onValueChange={(v) => setCfg({ ...cfg, provider: v })}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <label className="text-xs font-medium text-ink-muted">Base URL</label>
        <Input
          value={cfg.baseUrl || ''}
          onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="max-w-md font-mono text-xs"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-xs font-medium text-ink-muted">模型</label>
        <Input
          value={cfg.model || ''}
          onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
          placeholder="gpt-4o-mini"
          className="max-w-md font-mono text-xs"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-xs font-medium text-ink-muted">
          API Key
          <span className="ml-2 font-normal text-ink-subtle">
            （{cfg.hasApiKey ? '已有 key，留空保存则保留不动' : '必填'}）
          </span>
        </label>
        <div className="flex max-w-md gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg.hasApiKey ? cfg.maskedKey || '留空保留现有' : 'sk-...'}
              className="pr-10 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink p-1"
              title={showKey ? '隐藏' : '显示'}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rule">
        <Button onClick={handleSave} disabled={saving || testing} variant="default" size="sm">
          <Check className="h-3.5 w-3.5" />
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button onClick={handleTest} disabled={saving || testing} variant="outline" size="sm">
          <TestTube2 className="h-3.5 w-3.5" />
          {testing ? '测试中…' : '测试连接'}
        </Button>
        {cfg.hasApiKey && (
          <Button onClick={handleClearKey} disabled={saving || testing} variant="ghost" size="sm" className="text-danger">
            <Trash2 className="h-3.5 w-3.5" />
            清除 API Key
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs">
          {saved && <span className="text-success-fg inline-flex items-center gap-1"><Check className="h-3 w-3" />已保存</span>}
          {testResult && (testResult.ok
            ? <span className="text-success-fg inline-flex items-center gap-1"><Check className="h-3 w-3" />{testResult.latencyMs ? `连接正常（${testResult.latencyMs}ms）` : '连接正常'}</span>
            : <span className="text-danger inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" />{testResult.error}</span>
          )}
          {error && <span className="text-danger inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</span>}
        </div>
      </div>

      {cfg.source && (
        <div className="text-xs text-ink-subtle pt-2">
          配置来源：提供方 {cfg.source.provider} · Key {cfg.source.apiKey}。
          {cfg.source.apiKey === 'env' && '（当前走环境变量，未走 DB 持久化）'}
        </div>
      )}
    </div>
  );
}
