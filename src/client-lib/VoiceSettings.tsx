import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Square, Search } from 'lucide-react';
import { createTTSClient } from './api';
import type { VoiceInfo } from './api';

export interface VoiceSettingsProps {
  /** 服务根地址，默认 ''（同源）；prefix 需与服务端 createTTSApp 一致 */
  baseUrl?: string;
  prefix?: string;
  /** 凭证头（含 x-{provider}-api-key 等），支持动态函数 */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** 受控：当前厂商 / 音色；不传则组件内部管理 */
  provider?: string;
  value?: string;
  onChange?: (voiceId: string, voice: VoiceInfo | undefined) => void;
  /** 是否展示厂商页签，默认 true */
  showProviders?: boolean;
  /** 试听文案（试听固定用它，避免计费 surprises），默认中英短句 */
  previewText?: string;
  disabled?: boolean;
}

/**
 * 可发布的音色设置组件（Lingua Studio 可直接嵌入）：
 * 厂商页签 + 搜索 + 音色列表 + 试听 + 自定义 ID，自带数据拉取。
 * 样式依赖随包发布的 client.css（CSS 变量主题，无需宿主配 Tailwind）。
 */
export const VoiceSettings: React.FC<VoiceSettingsProps> = ({
  baseUrl = '',
  prefix = 'api',
  headers,
  provider: controlledProvider,
  value,
  onChange,
  showProviders = true,
  previewText = '你好，很高兴认识你。Hello, nice to meet you!',
  disabled = false,
}) => {
  const client = useMemo(
    () => createTTSClient({ baseUrl, prefix, headers: headers || {} }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl, prefix, JSON.stringify(headers || {})]
  );
  const [providers, setProviders] = useState<Array<{ id: string; displayName: string }>>([]);
  const [innerProvider, setInnerProvider] = useState('gemini');
  const provider = controlledProvider || innerProvider;
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [customId, setCustomId] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    createTTSClient({ baseUrl, prefix, headers: headers || {} })
      .getProviders()
      .then(list => { if (!cancelled && list.length > 0) setProviders(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [baseUrl, prefix, headers]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client.getVoices(provider)
      .then(list => { if (!cancelled) setVoices(list); })
      .catch((e: any) => { if (!cancelled) { setVoices([]); setError(e?.message || '获取声音列表失败'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, provider]);

  const stop = () => {
    seqRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const preview = async (voice: VoiceInfo) => {
    if (playingId === voice.id) { stop(); return; }
    stop();
    const seq = ++seqRef.current;
    setPlayingId(voice.id);
    try {
      const r = await client.synthesizeUnified({
        text: previewText,
        preferredService: provider,
        voicePreference: { voiceId: voice.id },
      });
      if (seq !== seqRef.current) return;
      const blob = new Blob([Uint8Array.from(atob(r.audioBase64), c => c.charCodeAt(0))], { type: r.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(cur => (cur === voice.id ? null : cur));
      audio.onerror = () => setPlayingId(cur => (cur === voice.id ? null : cur));
      await audio.play();
    } catch (e: any) {
      setError(e?.message || '试听失败');
      setPlayingId(cur => (cur === voice.id ? null : cur));
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) ||
      (v.id.toLowerCase().includes(q))
    );
  }, [voices, query]);

  const pick = (v: VoiceInfo) => {
    stop();
    onChange?.(v.id, v);
  };

  const inputCls = 'w-full px-2.5 py-1.5 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] placeholder:text-[hsl(var(--fg-muted))] focus:outline-none focus:border-[hsl(var(--border-focus))] disabled:opacity-50';

  return (
    <div className="space-y-2.5">
      {showProviders && providers.length > 1 && (
        <div className="flex rounded-md border border-[hsl(var(--border-subtle))] overflow-hidden text-xs">
          {providers.map(p => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => { stop(); setInnerProvider(p.id); }}
              className={`flex-1 py-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                provider === p.id
                  ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] font-medium'
                  : 'bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-muted))]'
              }`}
            >
              {p.displayName}
            </button>
          ))}
        </div>
      )}

      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--fg-muted))]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={disabled}
            placeholder="搜索音色…"
            className={`${inputCls} pl-8`}
          />
        </div>
        <input
          value={customId}
          onChange={e => setCustomId(e.target.value)}
          disabled={disabled}
          placeholder="自定义 voiceId"
          className={`${inputCls} w-32 font-mono`}
          onKeyDown={e => {
            if (e.key === 'Enter' && customId.trim()) {
              onChange?.(customId.trim(), undefined);
              setCustomId('');
            }
          }}
        />
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
        {loading && (
          <p className="col-span-2 text-[11px] text-[hsl(var(--fg-muted))]">正在加载音色…</p>
        )}
        {!loading && filtered.length === 0 && !error && (
          <p className="col-span-2 text-[11px] text-[hsl(var(--fg-muted))]">无可用音色</p>
        )}
        {filtered.map(v => {
          const selected = value === v.id;
          const playing = playingId === v.id;
          return (
            <div
              key={v.id}
              className={`text-left p-2.5 rounded-lg border transition-colors relative ${
                selected
                  ? 'border-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent))]'
                  : 'border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))]'
              }`}
            >
              <button type="button" disabled={disabled} onClick={() => pick(v)} className="block w-full text-left cursor-pointer disabled:opacity-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[hsl(var(--fg-primary))] truncate mr-1">{v.name}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-[hsl(var(--accent))] shrink-0" />}
                </div>
                <p className="text-[10px] text-[hsl(var(--fg-secondary))] line-clamp-2 leading-tight pr-6">{v.description}</p>
              </button>
              <button
                type="button"
                disabled={disabled}
                title={playing ? '停止试听' : `试听 ${v.name}`}
                onClick={() => preview(v)}
                className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-[hsl(var(--bg-card))] border border-[hsl(var(--border-subtle))] text-[hsl(var(--fg-secondary))] flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                {playing ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 ml-px" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
