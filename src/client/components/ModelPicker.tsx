import React, { useState } from 'react';
import { Cpu, Check, RefreshCw, Radio, Sparkles, Volume2 } from 'lucide-react';
import type { ModelInfo, ModelCategory } from '../hooks/useTTS';

interface ModelPickerProps {
  models: ModelInfo[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  isLoading: boolean;
  modelsSource: 'remote' | 'fallback';
  onRefresh: () => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  models,
  selectedModel,
  onSelectModel,
  isLoading,
  modelsSource,
  onRefresh,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'tts' | 'live'>('all');

  const ttsCount = models.filter((m) => m.category === 'tts').length;
  const liveCount = models.filter((m) => m.category === 'live').length;

  const filteredModels = models.filter((model) => {
    if (filterCategory === 'all') return true;
    return model.category === filterCategory;
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[hsl(var(--fg-secondary))] flex items-center space-x-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[hsl(var(--fg-muted))]" />
          <span>语音专用模型 (动态筛选)</span>
        </label>
        <div className="flex items-center space-x-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              modelsSource === 'remote'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            {modelsSource === 'remote' ? '语音模型已同步' : '本地备用列表'}
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="从 Google API 重新同步最新语音模型"
            className="p-1 rounded text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Category Tabs: 全部 / TTS 演播 / Live 对话 */}
      <div className="flex items-center space-x-1 p-0.5 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-xs">
        <button
          type="button"
          onClick={() => setFilterCategory('all')}
          className={`flex-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all cursor-pointer ${
            filterCategory === 'all'
              ? 'bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] shadow-2xs'
              : 'text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))]'
          }`}
        >
          全部语音 ({models.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterCategory('tts')}
          className={`flex-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all cursor-pointer ${
            filterCategory === 'tts'
              ? 'bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] shadow-2xs'
              : 'text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))]'
          }`}
        >
          TTS 演播诵读 ({ttsCount})
        </button>
        {liveCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterCategory('live')}
            className={`flex-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all cursor-pointer ${
              filterCategory === 'live'
                ? 'bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] shadow-2xs'
                : 'text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))]'
            }`}
          >
            Live 对话 ({liveCount})
          </button>
        )}
      </div>

      {/* Filtered Models List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filteredModels.map((model) => {
          const isSelected = model.id === selectedModel;
          const isFlagship = model.id === 'gemini-3.8-flash-tts';
          const isLite = model.id === 'gemini-3.8-flash-lite-tts';

          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelectModel(model.id)}
              className={`text-left p-3 rounded-lg border transition-all cursor-pointer relative ${
                isSelected
                  ? 'border-[hsl(var(--accent))] bg-[hsl(var(--bg-card))] ring-1 ring-[hsl(var(--accent))] shadow-xs'
                  : 'border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] hover:bg-[hsl(var(--bg-hover))]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    <span className="text-xs font-semibold text-[hsl(var(--fg-primary))]">
                      {model.displayName || model.id}
                    </span>
                    {isFlagship ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))] border border-[hsl(var(--tag-border))]">
                        旗舰演播
                      </span>
                    ) : isLite ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))] border border-[hsl(var(--tag-border))]">
                        极速低延
                      </span>
                    ) : model.category === 'live' ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        Live 对话
                      </span>
                    ) : (
                      <span className="text-[10px] px-1 py-0.2 rounded font-mono bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))] border border-[hsl(var(--tag-border))]">
                        TTS
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[hsl(var(--fg-muted))] mt-1 line-clamp-2 leading-relaxed">
                    {model.description || model.id}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] flex items-center justify-center shrink-0 ml-2 mt-0.5">
                    <Check className="w-2.5 h-2.5" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
