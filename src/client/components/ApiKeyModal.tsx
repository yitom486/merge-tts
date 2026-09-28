import React, { useState } from 'react';
import { X, Check, AlertCircle, Key, ExternalLink, Loader2 } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  apiKey: string;
  onSaveKey: (key: string) => void;
  hasServerKey: boolean;
  azureKey: string;
  onSaveAzureKey: (key: string) => void;
  azureRegion: string;
  onSaveAzureRegion: (region: string) => void;
  azureServerKey: boolean;
}

const AZURE_REGIONS = [
  'eastus', 'westus2', 'eastasia', 'southeastasia',
  'japaneast', 'koreacentral', 'northeurope', 'westeurope',
];

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  provider,
  apiKey,
  onSaveKey,
  hasServerKey,
  azureKey,
  onSaveAzureKey,
  azureRegion,
  onSaveAzureRegion,
  azureServerKey,
}) => {
  const [tab, setTab] = useState<'gemini' | 'azure'>(provider === 'azure' ? 'azure' : 'gemini');
  const [geminiInput, setGeminiInput] = useState(apiKey);
  const [azureInput, setAzureInput] = useState(azureKey);
  const [regionInput, setRegionInput] = useState(azureRegion);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!isOpen) return null;

  const isAzure = tab === 'azure';

  const handleTest = async () => {
    const headers: Record<string, string> = {};
    let url = '/api/models?provider=gemini';
    if (isAzure) {
      const keyToTest = azureInput.trim() || azureKey;
      if (keyToTest) headers['x-azure-api-key'] = keyToTest;
      url = `/api/models?provider=azure&region=${encodeURIComponent(regionInput.trim())}`;
    } else {
      const keyToTest = geminiInput.trim() || apiKey;
      if (keyToTest) headers['x-gemini-api-key'] = keyToTest;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const n = data.models?.length ?? data.voices?.length ?? 0;
        setTestResult({ ok: true, msg: `验证通过，已联通${isAzure ? ' Azure Speech' : ' Gemini'}服务（${n} 个模型/音色可见）！` });
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
    if (isAzure) {
      onSaveAzureKey(azureInput.trim());
      onSaveAzureRegion(regionInput.trim());
    } else {
      onSaveKey(geminiInput.trim());
    }
    onClose();
  };

  const handleClear = () => {
    if (isAzure) {
      setAzureInput('');
      onSaveAzureKey('');
    } else {
      setGeminiInput('');
      onSaveKey('');
    }
    setTestResult(null);
  };

  const serverKeyOk = isAzure ? azureServerKey : hasServerKey;
  const localKey = isAzure ? azureKey : apiKey;
  const inputCls =
    'w-full px-3 py-2 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] placeholder:text-[hsl(var(--fg-muted))] focus:outline-none focus:border-[hsl(var(--border-focus))] font-mono';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-[hsl(var(--bg-card))] border border-[hsl(var(--border-subtle))] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border-subtle))]">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-[hsl(var(--fg-secondary))]" />
            <h2 className="text-sm font-semibold text-[hsl(var(--fg-primary))]">
              API Key 配置
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider tabs */}
        <div className="flex border-b border-[hsl(var(--border-subtle))] text-xs">
          {(['gemini', 'azure'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setTestResult(null); }}
              className={`flex-1 py-2 transition-colors cursor-pointer ${
                tab === t
                  ? 'text-[hsl(var(--fg-primary))] font-medium border-b-2 border-[hsl(var(--accent))]'
                  : 'text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))]'
              }`}
            >
              {t === 'gemini' ? 'Google Gemini' : 'Azure Speech'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Server Key Hint */}
          <div className="p-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-xs space-y-1">
            <div className="flex items-center justify-between font-medium text-[hsl(var(--fg-primary))]">
              <span>服务端默认密钥 (.env):</span>
              <span className={`inline-flex items-center space-x-1 ${serverKeyOk ? 'text-[hsl(var(--status-success))]' : 'text-[hsl(var(--fg-muted))]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${serverKeyOk ? 'bg-[hsl(var(--status-success))]' : 'bg-zinc-400'}`} />
                <span>{serverKeyOk ? '已载入' : '未检测到'}</span>
              </span>
            </div>
            <p className="text-[hsl(var(--fg-secondary))] text-[11px] leading-relaxed">
              若此处填入自定义 Key，将优先使用您本地输入的 Key，保存在浏览器缓存中，不会被上传泄漏。
            </p>
          </div>

          {/* Key input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[hsl(var(--fg-secondary))]">
              自定义 {isAzure ? 'Speech Key' : 'API Key'}
            </label>
            <input
              type="password"
              value={isAzure ? azureInput : geminiInput}
              onChange={(e) => {
                if (isAzure) setAzureInput(e.target.value);
                else setGeminiInput(e.target.value);
                setTestResult(null);
              }}
              placeholder={isAzure ? 'Azure Speech Key...' : 'AIzaSy...'}
              className={inputCls}
            />
          </div>

          {/* Azure region */}
          {isAzure && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[hsl(var(--fg-secondary))]">
                区域 Region（必须与 Key 同区）
              </label>
              <div className="flex space-x-2">
                <select
                  value={regionInput ? (AZURE_REGIONS.includes(regionInput) ? regionInput : '__custom') : ''}
                  onChange={(e) => {
                    if (e.target.value !== '__custom') setRegionInput(e.target.value);
                  }}
                  className="px-2 py-2 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] focus:outline-none focus:border-[hsl(var(--border-focus))]"
                >
                  <option value="">选择区域…</option>
                  {AZURE_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="__custom">手动输入…</option>
                </select>
                <input
                  value={regionInput}
                  onChange={(e) => { setRegionInput(e.target.value); setTestResult(null); }}
                  placeholder="如 japaneast（留空则用服务端配置）"
                  className={inputCls}
                />
              </div>
            </div>
          )}

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
              href={isAzure ? 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices' : 'https://aistudio.google.com/app/apikey'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1 text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] transition-colors"
            >
              <span>{isAzure ? '去 Azure 创建 Speech 资源' : '获取 Google Gemini API Key'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            {localKey && (
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
            disabled={testing}
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
