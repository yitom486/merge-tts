import React, { useState } from 'react';
import { Mic, Check, User, Plus } from 'lucide-react';
import type { VoiceInfo } from '../hooks/useTTS';

interface VoicePickerProps {
  voices: VoiceInfo[];
  selectedVoice: string;
  onSelectVoice: (id: string) => void;
  isLoading: boolean;
}

export const VoicePicker: React.FC<VoicePickerProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  isLoading,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customVoiceId, setCustomVoiceId] = useState('');

  const handleApplyCustom = () => {
    if (customVoiceId.trim()) {
      onSelectVoice(customVoiceId.trim());
      setShowCustomInput(false);
    }
  };

  const isPreset = voices.some((v) => v.id === selectedVoice);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[hsl(var(--fg-secondary))] flex items-center space-x-1.5">
          <Mic className="w-3.5 h-3.5 text-[hsl(var(--fg-muted))]" />
          <span>声音与角色音色 (Voice Persona)</span>
        </label>
        <button
          type="button"
          onClick={() => setShowCustomInput(!showCustomInput)}
          className="text-[11px] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] hover:underline cursor-pointer"
        >
          {showCustomInput ? '收起自定义' : '+ 输入自定义 Voice ID'}
        </button>
      </div>

      {/* Optional Custom Voice ID Input */}
      {showCustomInput && (
        <div className="p-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] space-y-2 animate-in fade-in duration-150">
          <p className="text-[11px] text-[hsl(var(--fg-secondary))]">
            输入您在 Google AI Studio 中使用 Voice Design 或 Voice Replication 生成的音色 ID：
          </p>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={customVoiceId}
              onChange={(e) => setCustomVoiceId(e.target.value)}
              placeholder="e.g. voice_custom_persona_123"
              className="flex-1 px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] focus:outline-none focus:border-[hsl(var(--border-focus))] font-mono"
            />
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!customVoiceId.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:bg-[hsl(var(--accent-hover))] transition-colors disabled:opacity-50 cursor-pointer"
            >
              应用
            </button>
          </div>
        </div>
      )}

      {/* Voice Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {voices.map((voice) => {
          const isSelected = voice.id === selectedVoice;
          return (
            <button
              key={voice.id}
              type="button"
              onClick={() => onSelectVoice(voice.id)}
              className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative ${
                isSelected
                  ? 'border-[hsl(var(--accent))] bg-[hsl(var(--bg-card))] ring-1 ring-[hsl(var(--accent))] shadow-xs'
                  : 'border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] hover:bg-[hsl(var(--bg-hover))]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-[hsl(var(--fg-primary))]">
                  {voice.name}
                </span>
                {isSelected ? (
                  <Check className="w-3.5 h-3.5 text-[hsl(var(--accent))] shrink-0" />
                ) : voice.gender ? (
                  <span className="text-[10px] text-[hsl(var(--fg-muted))] capitalize font-mono">
                    {voice.gender === 'female' ? '女' : voice.gender === 'male' ? '男' : '中性'}
                  </span>
                ) : null}
              </div>

              {voice.tone && (
                <div className="text-[10px] font-mono text-[hsl(var(--fg-muted))] truncate mb-1">
                  {voice.tone}
                </div>
              )}

              <p className="text-[10px] text-[hsl(var(--fg-secondary))] line-clamp-2 leading-tight">
                {voice.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* If current selected voice is a custom non-preset ID */}
      {!isPreset && selectedVoice && (
        <div className="px-3 py-1.5 rounded-md text-xs border border-[hsl(var(--border-focus))] bg-[hsl(var(--bg-card))] flex items-center justify-between">
          <span className="text-[hsl(var(--fg-primary))] font-mono text-[11px]">
            当前自定义声音: <strong>{selectedVoice}</strong>
          </span>
          <button
            type="button"
            onClick={() => onSelectVoice(voices[0]?.id || 'Puck')}
            className="text-[11px] text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] underline cursor-pointer"
          >
            切回预置
          </button>
        </div>
      )}
    </div>
  );
};
