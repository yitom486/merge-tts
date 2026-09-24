import React from 'react';
import { Sun, Moon, KeyRound, RefreshCw, Play, Loader2 } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';

interface HeaderProps {
  theme: Theme;
  toggleTheme: () => void;
  hasKey: boolean;
  onOpenKeyModal: () => void;
  modelName: string;
  modelsSource: 'remote' | 'fallback';
  onRefreshModels: () => void;
  isRefreshingModels: boolean;
  onGenerate?: () => void;
  isGenerating?: boolean;
  canGenerate?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  toggleTheme,
  hasKey,
  onOpenKeyModal,
  modelName,
  modelsSource,
  onRefreshModels,
  isRefreshingModels,
  onGenerate,
  isGenerating,
  canGenerate,
}) => {
  return (
    <header className="w-full border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] px-6 py-3.5 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-md bg-[hsl(var(--accent))] flex items-center justify-center text-[hsl(var(--accent-fg))] shadow-sm">
            <span className="font-semibold text-sm tracking-tighter">TTS</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-semibold text-[hsl(var(--fg-primary))] tracking-tight">
                Gemini TTS Studio
              </h1>
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-secondary))]">
                Audio Synthesizer
              </span>
            </div>
            <p className="text-xs text-[hsl(var(--fg-muted))] hidden sm:block">
              录音棚级高保真语音生成与情感表演控制台
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2.5">
          {/* Dynamic Model Status Pill */}
          <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-secondary))]">
            <span className={`w-1.5 h-1.5 rounded-full ${modelsSource === 'remote' ? 'bg-[hsl(var(--status-success))]' : 'bg-amber-500'}`} />
            <span className="font-mono text-[11px]">{modelName}</span>
            <button
              onClick={onRefreshModels}
              disabled={isRefreshingModels}
              title="从 Google API 重新同步可用模型"
              className="p-0.5 hover:text-[hsl(var(--fg-primary))] transition-colors ml-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Quick Header Synthesize Button (随时随地一键生成) */}
          {onGenerate && (
            <button
              onClick={onGenerate}
              disabled={isGenerating || !canGenerate}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] hover:bg-[hsl(var(--accent-hover))] active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">渲染中...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>生成语音</span>
                </>
              )}
            </button>
          )}

          {/* API Key Modal Button */}
          <button
            onClick={onOpenKeyModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] hover:bg-[hsl(var(--bg-hover))] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">API Key</span>
            <span
              className={`w-2 h-2 rounded-full ${
                hasKey ? 'bg-[hsl(var(--status-success))]' : 'bg-[hsl(var(--status-error))]'
              }`}
              title={hasKey ? 'API Key 就绪' : '未检测到 API Key'}
            />
          </button>

          {/* Unified Synchronized Theme Switcher */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换至明亮模式' : '切换至暗黑模式'}
            aria-label="Toggle theme"
            className="p-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] hover:bg-[hsl(var(--bg-hover))] text-[hsl(var(--fg-secondary))] hover:text-[hsl(var(--fg-primary))] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
