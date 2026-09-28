import React, { useState, useMemo } from 'react';
import { Mic, Check, Search, X, ChevronDown, Sparkles, Play, Square } from 'lucide-react';
import type { VoiceInfo } from '../hooks/useTTS';

interface VoicePickerProps {
  voices: VoiceInfo[];
  selectedVoice: string;
  onSelectVoice: (id: string) => void;
  isLoading: boolean;
  auditioningId?: string | null;
  onAudition?: (id: string) => void;
}

// Azure 系音色 ID 自带 locale 前缀（zh-CN-XiaoxiaoNeural），动态分组筛选就靠它
function localeOf(id: string): { lang: string; locale: string } | null {
  const m = id.match(/^([a-z]{2,3})-([A-Za-z]{2})/);
  if (!m) return null;
  return { lang: m[1].toLowerCase(), locale: `${m[1].toLowerCase()}-${m[2].toUpperCase()}` };
}

const LANG_NAMES: Record<string, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', yue: '粵語',
  fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano', pt: 'Português',
  ru: 'Русский', ar: 'العربية', hi: 'हिन्दी', th: 'ไทย', vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', tr: 'Türkçe', nl: 'Nederlands',
  pl: 'Polski', uk: 'Українська',
};

export const VoicePicker: React.FC<VoicePickerProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  isLoading,
  auditioningId = null,
  onAudition,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [langFilter, setLangFilter] = useState('');

  const handleApplyCustom = () => {
    if (customVoiceId.trim()) {
      onSelectVoice(customVoiceId.trim());
      setShowCustomInput(false);
    }
  };

  const isPreset = voices.some((v) => v.id === selectedVoice);
  const currentVoiceObj = voices.find((v) => v.id === selectedVoice);

  // 排序与搜索过滤：自定义音色置顶，其余按名称字母序（无写死优先级），且支持快速检索
  const sortedAndFilteredVoices = useMemo(() => {
    let list = [...voices];

    list.sort((a, b) => {
      const customA = a.kind && a.kind !== 'prebuilt' ? 0 : 1;
      const customB = b.kind && b.kind !== 'prebuilt' ? 0 : 1;
      if (customA !== customB) return customA - customB;
      return a.name.localeCompare(b.name);
    });

    // 语言分组：有 locale 前缀的列表可按语言筛选，默认看全部（不替用户做选择）
    const effectiveLang = langFilter || 'all';
    if (effectiveLang !== 'all') {
      list = list.filter((v) => localeOf(v.id)?.lang === effectiveLang);
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        (v.tone && v.tone.toLowerCase().includes(q))
    );
  }, [voices, searchQuery, langFilter]);

  // 语言分组选项（动态统计各语言数量，纯字母序）
  const langOptions = useMemo(() => {
    const groups = new Map<string, number>();
    for (const v of voices) {
      const loc = localeOf(v.id);
      if (loc) groups.set(loc.lang, (groups.get(loc.lang) || 0) + 1);
    }
    const arr = [...groups.entries()];
    arr.sort((a, b) => a[0].localeCompare(b[0]));
    return arr;
  }, [voices]);

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
          {/* 语言筛选（Azure 系按 locale 动态分组，默认中文） */}
          {langOptions.length > 1 && (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-[hsl(var(--fg-muted))] shrink-0">语言</span>
              <select
                value={langFilter || 'all'}
                onChange={(e) => setLangFilter(e.target.value === 'all' ? '' : e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] text-xs outline-none focus:border-[hsl(var(--border-focus))]"
              >
                <option value="all">全部语言 ({voices.length})</option>
                {langOptions.map(([lang, count]) => (
                  <option key={lang} value={lang}>
                    {LANG_NAMES[lang] || lang} ({count})
                  </option>
                ))}
              </select>
            </div>
          )}
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
              const loc = localeOf(voice.id);
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
                    <div className="flex items-center space-x-1 shrink-0">
                      {loc && (
                        <span className="text-[9px] px-1 py-px rounded font-mono bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-muted))]">
                          {loc.locale}
                        </span>
                      )}
                      {voice.kind && voice.kind !== 'prebuilt' && (
                        <span className="text-[9px] px-1 py-px rounded border border-[hsl(var(--tag-border))] bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))]">
                          {voice.kind === 'prompted' ? '设计' : voice.kind === 'replicated' ? '复刻' : '自定义'}
                        </span>
                      )}
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--accent))] shrink-0" />
                      ) : voice.gender ? (
                        <span className="text-[10px] text-[hsl(var(--fg-muted))] capitalize font-mono shrink-0">
                          {voice.gender === 'female' ? '女' : voice.gender === 'male' ? '男' : '中性'}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {voice.tone && (
                    <div className="text-[10px] font-mono text-[hsl(var(--fg-muted))] truncate mb-1">
                      {voice.tone}
                    </div>
                  )}

                  <p className="text-[10px] text-[hsl(var(--fg-secondary))] line-clamp-2 leading-tight">
                    {voice.description}
                  </p>

                  {/* 单音色试听：固定短文本 + 当前风格，点两次停止 */}
                  {onAudition && (
                    <button
                      type="button"
                      title={auditioningId === voice.id ? '停止试听' : `试听 ${voice.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAudition(voice.id);
                      }}
                      className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-[hsl(var(--bg-card))] border border-[hsl(var(--border-subtle))] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--accent))] hover:border-[hsl(var(--accent))] flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                    >
                      {auditioningId === voice.id ? (
                        <Square className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 ml-px" />
                      )}
                    </button>
                  )}
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
                onClick={() => { const first = voices[0]; if (first) onSelectVoice(first.id); }}
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
