import React, { useState } from 'react';
import { Wand2, Copy, Check, Trash2, FlaskConical, Loader2 } from 'lucide-react';
import type { VoiceInfo } from '../hooks/useTTS';

interface VoiceStudioProps {
  voices: VoiceInfo[];
  selectedVoice: string;
  onSelectVoice: (id: string) => void;
  disabled?: boolean;
  isBusy: boolean;
  onDesign: (
    input: string,
    opts?: { displayName?: string; gender?: string; languageCode?: string }
  ) => Promise<{ id: string; displayName?: string; sampleUrl: string | null }>;
  onReplicate: (args: {
    displayName?: string;
    sourceFile: File;
    consentFile: File;
  }) => Promise<{ id: string; key?: string }>;
  onDelete: (id: string) => Promise<void>;
}

const CONSENT_TEXT = 'I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.';

export const VoiceStudio: React.FC<VoiceStudioProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  disabled = false,
  isBusy,
  onDesign,
  onReplicate,
  onDelete,
}) => {
  const [mode, setMode] = useState<'design' | 'replicate'>('design');
  const [prompt, setPrompt] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ id: string; sampleUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const customVoices = voices.filter((v) => v.kind && v.kind !== 'prebuilt');

  const runDesign = async () => {
    if (!prompt.trim()) {
      setLocalError('请先输入音色描述（1–2 句，如年龄、音色、口音）');
      return;
    }
    setLocalError(null);
    setLastResult(null);
    try {
      const r = await onDesign(prompt.trim(), {
        displayName: displayName.trim() || undefined,
        gender: gender || undefined,
      });
      setLastResult({ id: r.id, sampleUrl: r.sampleUrl });
    } catch (e: any) {
      setLocalError(e?.message || '设计音色失败');
    }
  };

  const runReplicate = async () => {
    if (!sourceFile || !consentFile) {
      setLocalError('复刻需要上传参考音频与授权声明朗读两段音频');
      return;
    }
    setLocalError(null);
    setLastResult(null);
    try {
      const r = await onReplicate({
        displayName: displayName.trim() || undefined,
        sourceFile,
        consentFile,
      });
      setLastResult({ id: r.id, sampleUrl: null });
    } catch (e: any) {
      setLocalError(e?.message || '复刻音色失败');
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时忽略
    }
  };

  const busy = disabled || isBusy;
  const inputCls =
    'w-full px-2.5 py-1.5 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] placeholder:text-[hsl(var(--fg-muted))] focus:outline-none focus:border-[hsl(var(--border-focus))] disabled:opacity-50';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center space-x-2">
        <FlaskConical className="w-3.5 h-3.5 text-[hsl(var(--fg-muted))]" />
        <span className="text-xs font-semibold text-[hsl(var(--fg-secondary))]">自定义音色工作室</span>
        <span className="text-[10px] text-[hsl(var(--fg-muted))]">200 个/项目 · 1 年有效</span>
      </div>

      {/* 模式切换 */}
      <div className="flex rounded-md border border-[hsl(var(--border-subtle))] overflow-hidden text-xs">
        {(['design', 'replicate'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setLocalError(null); setLastResult(null); }}
            className={`flex-1 py-1.5 transition-colors cursor-pointer ${
              mode === m
                ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] font-medium'
                : 'bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))]'
            }`}
          >
            {m === 'design' ? '自然语言设计' : '声音复刻'}
          </button>
        ))}
      </div>

      {mode === 'design' ? (
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder="如：A warm, thoughtful narrator in his 40s with a gentle British accent…"
            className={`${inputCls} resize-none`}
          />
          <div className="flex space-x-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
              placeholder="展示名（可选）"
              className={inputCls}
            />
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={busy}
              className={`${inputCls} w-24 shrink-0`}
            >
              <option value="">性别不限</option>
              <option value="female">女</option>
              <option value="male">男</option>
            </select>
          </div>
          <button
            type="button"
            onClick={runDesign}
            disabled={busy || !prompt.trim()}
            className="w-full py-1.5 rounded-md text-xs font-medium bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:bg-[hsl(var(--accent-hover))] transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            <span>生成音色（含试听小样）</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={busy}
            placeholder="展示名（可选）"
            className={inputCls}
          />
          <label className="block text-[11px] text-[hsl(var(--fg-secondary))]">
            参考音频（10–30s 干净人声，24kHz WAV 最佳）
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full text-[11px] text-[hsl(var(--fg-muted))]"
            />
          </label>
          <label className="block text-[11px] text-[hsl(var(--fg-secondary))]">
            授权声明朗读（同一人朗读下方英文声明）
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={(e) => setConsentFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full text-[11px] text-[hsl(var(--fg-muted))]"
            />
          </label>
          <p className="text-[10px] font-mono leading-relaxed p-2 rounded-md bg-[hsl(var(--bg-subtle))] border border-[hsl(var(--border-subtle))] text-[hsl(var(--fg-muted))]">
            “{CONSENT_TEXT}”
          </p>
          <button
            type="button"
            onClick={runReplicate}
            disabled={busy || !sourceFile || !consentFile}
            className="w-full py-1.5 rounded-md text-xs font-medium bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:bg-[hsl(var(--accent-hover))] transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            <span>复刻并保存到项目</span>
          </button>
        </div>
      )}

      {localError && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{localError}</p>
      )}

      {/* 最近一次成果：试听 + 选用 */}
      {lastResult && (
        <div className="p-2.5 rounded-lg border border-[hsl(var(--accent))] bg-[hsl(var(--bg-subtle))] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono truncate text-[hsl(var(--fg-primary))]">{lastResult.id}</span>
            <button
              type="button"
              onClick={() => copyId(lastResult.id)}
              className="shrink-0 p-1 rounded text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] cursor-pointer"
              title="复制音色 ID"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {lastResult.sampleUrl && (
            <audio controls src={lastResult.sampleUrl} className="w-full h-8" />
          )}
          <button
            type="button"
            onClick={() => onSelectVoice(lastResult.id)}
            className="w-full py-1 rounded-md text-[11px] font-medium border border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--bg-hover))] text-[hsl(var(--fg-primary))] transition-colors cursor-pointer"
          >
            {selectedVoice === lastResult.id ? '当前正在使用 ✓' : '选用该音色合成'}
          </button>
        </div>
      )}

      {/* 已有自定义音色 */}
      {customVoices.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[hsl(var(--fg-muted))]">本项目自定义（{customVoices.length}）</p>
          {customVoices.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))]"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[hsl(var(--fg-primary))] truncate">{v.name}</p>
                <p className="text-[10px] font-mono text-[hsl(var(--fg-muted))] truncate">{v.id}</p>
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectVoice(v.id)}
                  disabled={busy}
                  className="text-[11px] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] hover:underline cursor-pointer disabled:opacity-50"
                >
                  {selectedVoice === v.id ? '使用中' : '选用'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(v.id).catch((e: any) => setLocalError(e?.message || '删除失败'))}
                  disabled={busy}
                  title="删除该自定义音色"
                  className="p-1 rounded text-[hsl(var(--fg-muted))] hover:text-red-500 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
