import React from 'react';
import { Cpu, Check, Sparkles, RefreshCw } from 'lucide-react';
import type { ModelInfo } from '../hooks/useTTS';

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
  const currentModel = models.find((m) => m.id === selectedModel) || models[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[hsl(var(--fg-secondary))] flex items-center space-x-1.5">
          <Cpu className="w-3.5 h-3.5 text-[hsl(var(--fg-muted))]" />
          <span>TTS 模型架构 (动态获取)</span>
        </label>
        <div className="flex items-center space-x-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              modelsSource === 'remote'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            {modelsSource === 'remote' ? 'API 同步就绪' : '本地备用列表'}
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="从服务端 / Google API 重新检索最新模型"
            className="p-1 rounded text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Model Selection Dropdown or Radio Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {models.map((model) => {
          const isSelected = model.id === selectedModel;
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
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-semibold text-[hsl(var(--fg-primary))]">
                      {model.displayName || model.id}
                    </span>
                    {model.isTtsRecommended && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))] border border-[hsl(var(--tag-border))] font-mono">
                        TTS
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[hsl(var(--fg-muted))] mt-1 line-clamp-2 leading-relaxed">
                    {model.description || model.id}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] flex items-center justify-center shrink-0 ml-2">
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
