import React, { useState } from 'react';
import { X, Check, AlertCircle, Key, ExternalLink, Loader2 } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveKey: (key: string) => void;
  hasServerKey: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveKey,
  hasServerKey,
}) => {
  const [inputVal, setInputVal] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    const keyToTest = inputVal.trim() || apiKey;
    setTesting(true);
    setTestResult(null);

    try {
      const headers: Record<string, string> = {};
      if (keyToTest) headers['x-gemini-api-key'] = keyToTest;

      const res = await fetch('/api/models', { headers });
      if (res.ok) {
        setTestResult({ ok: true, msg: 'API Key 验证通过，已成功联通 Gemini 服务！' });
      } else {
        const err = await res.json().catch(() => ({ error: '请求未授权' }));
        setTestResult({ ok: false, msg: `验证未通过: ${err.error || res.statusText}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: `连接失败: ${e?.message || '网络异常'}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSaveKey(inputVal.trim());
    onClose();
  };

  const handleClear = () => {
    setInputVal('');
    onSaveKey('');
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-[hsl(var(--bg-card))] border border-[hsl(var(--border-subtle))] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border-subtle))]">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-[hsl(var(--fg-secondary))]" />
            <h2 className="text-sm font-semibold text-[hsl(var(--fg-primary))]">
              Gemini API Key 配置
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Server Key Hint */}
          <div className="p-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-xs space-y-1">
            <div className="flex items-center justify-between font-medium text-[hsl(var(--fg-primary))]">
              <span>服务端默认密钥 (.env):</span>
              <span className={`inline-flex items-center space-x-1 ${hasServerKey ? 'text-[hsl(var(--status-success))]' : 'text-[hsl(var(--fg-muted))]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasServerKey ? 'bg-[hsl(var(--status-success))]' : 'bg-zinc-400'}`} />
                <span>{hasServerKey ? '已载入' : '未检测到'}</span>
              </span>
            </div>
            <p className="text-[hsl(var(--fg-secondary))] text-[11px] leading-relaxed">
              若此处填入自定义 Key，将优先使用您本地输入的 Key，保存在浏览器缓存中，不会被上传泄漏。
            </p>
          </div>

          {/* Input field */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[hsl(var(--fg-secondary))]">
              自定义 API Key
            </label>
            <input
              type="password"
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                setTestResult(null);
              }}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] placeholder:text-[hsl(var(--fg-muted))] focus:outline-none focus:border-[hsl(var(--border-focus))] font-mono"
            />
          </div>

          {/* Test Status feedback */}
          {testResult && (
            <div
              className={`p-2.5 rounded-md text-xs flex items-start space-x-2 border ${
                testResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              }`}
            >
              {testResult.ok ? (
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span className="leading-tight">{testResult.msg}</span>
            </div>
          )}

          {/* Links */}
          <div className="flex items-center justify-between text-[11px] text-[hsl(var(--fg-muted))] pt-1">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1 text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] transition-colors"
            >
              <span>获取 Google Gemini API Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            {apiKey && (
              <button
                onClick={handleClear}
                className="text-[hsl(var(--status-error))] hover:underline cursor-pointer"
              >
                清除本地 Key
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] flex items-center justify-between">
          <button
            onClick={handleTest}
            disabled={testing || (!inputVal.trim() && !hasServerKey)}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] hover:bg-[hsl(var(--bg-hover))] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>测试连通性</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:bg-[hsl(var(--accent-hover))] transition-colors shadow-sm cursor-pointer"
            >
              保存生效
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
