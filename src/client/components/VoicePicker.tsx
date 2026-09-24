import React, { useState, useMemo } from 'react';
import { Mic, Check, Search, X, ChevronDown, Sparkles } from 'lucide-react';
import type { VoiceInfo } from '../hooks/useTTS';

interface VoicePickerProps {
  voices: VoiceInfo[];
  selectedVoice: string;
  onSelectVoice: (id: string) => void;
  isLoading: boolean;
}

// 核心推荐声音优先排在顶部
const PRIORITY_VOICES = ['Puck', 'Kore', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orpheus', 'Zephyr'];

export const VoicePicker: React.FC<VoicePickerProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  isLoading,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleApplyCustom = () => {
    if (customVoiceId.trim()) {
      onSelectVoice(customVoiceId.trim());
      setShowCustomInput(false);
    }
  };

  const isPreset = voices.some((v) => v.id === selectedVoice);
  const currentVoiceObj = voices.find((v) => v.id === selectedVoice);

  // 排序与搜索过滤：核心预设声音在前，且支持快速检索
  const sortedAndFilteredVoices = useMemo(() => {
    let list = [...voices];

    list.sort((a, b) => {
      const idxA = PRIORITY_VOICES.indexOf(a.id);
      const idxB = PRIORITY_VOICES.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        (v.tone && v.tone.toLowerCase().includes(q))
    );
  }, [voices, searchQuery]);

  return (
    <div className="space-y-2.5">
      {/* 折叠/展开控制头部 */}
      <div className="flex items-center justify-between">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 cursor-pointer select-none group"
        >
          <label className="text-xs font-semibold text-[hsl(var(--fg-secondary))] group-hover:text-[hsl(var(--fg-primary))] transition-colors flex items-center space-x-1.5 cursor-pointer">
            <Mic className="w-3.5 h-3.5 text-[hsl(var(--fg-muted))]" />
            <span>角色音色库</span>
          </label>

          {/* 折叠时在标题旁展示当前选中的音色简报 */}
          {!isExpanded && (
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border border-[hsl(var(--tag-border))] bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))] flex items-center space-x-1 animate-in fade-in duration-150">
              <span>{selectedVoice}</span>
              {currentVoiceObj?.gender && (
                <span className="text-[9px] text-[hsl(var(--fg-muted))] capitalize">
                  ({currentVoiceObj.gender === 'female' ? '女' : currentVoiceObj.gender === 'male' ? '男' : '中性'})
                </span>
              )}
            </span>
          )}

          {isExpanded && (
            <span className="text-[10px] text-[hsl(var(--fg-muted))] font-normal">
              ({voices.length} 款可用)
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {isExpanded && (
            <button
              type="button"
              onClick={() => setShowCustomInput(!showCustomInput)}
              className="text-[11px] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] hover:underline cursor-pointer"
            >
              {showCustomInput ? '收起自定义' : '+ 自定义 ID'}
            </button>
          )}

          {/* 折叠切换箭头 */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? '折叠音色面板' : '展开音色面板'}
            className="p-1 rounded-md text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-all cursor-pointer flex items-center space-x-1 text-xs"
          >
            <span className="text-[11px] text-[hsl(var(--fg-muted))] hidden sm:inline">
              {isExpanded ? '收起' : '展开选择'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* 折叠状态下的单行预览卡片 */}
      {!isExpanded && (
        <div
          onClick={() => setIsExpanded(true)}
          className="p-2.5 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer flex items-center justify-between group"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] flex items-center justify-center text-xs font-semibold shrink-0">
              {selectedVoice.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-semibold text-[hsl(var(--fg-primary))] truncate">
                  {currentVoiceObj?.name || selectedVoice}
                </span>
                {currentVoiceObj?.tone && (
                  <span className="text-[10px] text-[hsl(var(--fg-muted))] font-mono truncate">
                    • {currentVoiceObj.tone}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[hsl(var(--fg-secondary))] truncate">
                {currentVoiceObj?.description || '当前激活的音色角色'}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-[hsl(var(--fg-muted))] group-hover:text-[hsl(var(--fg-primary))] transition-colors shrink-0 ml-2">
            更换音色 →
          </span>
        </div>
      )}

      {/* 展开状态下的完整音色面板 */}
      {isExpanded && (
        <div className="space-y-2 animate-in fade-in duration-200">
          {/* 搜索框 */}
          {voices.length > 6 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--fg-muted))]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="快速搜索音色名称或特点..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] placeholder:text-[hsl(var(--fg-muted))] focus:outline-none focus:border-[hsl(var(--border-focus))]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* 自定义 Voice ID 输入面板 */}
          {showCustomInput && (
            <div className="p-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] space-y-2 animate-in fade-in duration-150">
              <p className="text-[11px] text-[hsl(var(--fg-secondary))]">
                输入在 Google AI Studio 生成的音色 ID：
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

          {/* 限制高度的滚动音色列表 */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
            {sortedAndFilteredVoices.map((voice) => {
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
                    <span className="text-xs font-semibold text-[hsl(var(--fg-primary))] truncate mr-1">
                      {voice.name}
                    </span>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-[hsl(var(--accent))] shrink-0" />
                    ) : voice.gender ? (
                      <span className="text-[10px] text-[hsl(var(--fg-muted))] capitalize font-mono shrink-0">
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

          {/* 自定义声音当前选中状态 */}
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
      )}
    </div>
  );
};
