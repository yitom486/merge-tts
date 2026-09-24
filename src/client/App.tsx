import React, { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useTTS } from './hooks/useTTS';
import { Header } from './components/Header';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Editor } from './components/Editor';
import { VoicePicker } from './components/VoicePicker';
import { ModelPicker } from './components/ModelPicker';
import { StyleSelector } from './components/StyleSelector';
import { AudioPlayer } from './components/AudioPlayer';
import { AlertCircle } from 'lucide-react';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    apiKey,
    setApiKey,
    hasServerKey,
    models,
    selectedModel,
    setSelectedModel,
    modelsSource,
    isLoadingModels,
    refreshModels,
    voices,
    selectedVoice,
    setSelectedVoice,
    isLoadingVoices,
    text,
    setText,
    speechStyle,
    setSpeechStyle,
    isGenerating,
    audioUrl,
    audioBlob,
    error,
    clearError,
    generateAudio,
  } = useTTS();

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  const hasConfiguredKey = Boolean(apiKey || hasServerKey);

  const handleResetSample = () => {
    setText(
      `Welcome to Gemini 3.8 TTS Studio. [laughs] Listen to how natural and expressive speech can truly be. [short pause] Notice the nuanced pacing, and how emotional inflection carries through every syllable. [whispers] Try listening with headphones to feel the recording studio presence.`
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--bg-app))] text-[hsl(var(--fg-primary))]">
      {/* 顶部全局导航（内置一键生成按键与动态模型状态） */}
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        hasKey={hasConfiguredKey}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        modelName={selectedModel}
        modelsSource={modelsSource}
        onRefreshModels={refreshModels}
        isRefreshingModels={isLoadingModels}
        onGenerate={generateAudio}
        isGenerating={isGenerating}
        canGenerate={Boolean(text.trim())}
      />

      {/* 主体工作台 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {/* 未配置 Key 时的清淡提示条 */}
        {!hasConfiguredKey && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 animate-in fade-in duration-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                检测到尚未配置 Gemini API Key。请点击右侧按钮输入，或在根目录 <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">.env</code> 中添加。
              </span>
            </div>
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="px-2.5 py-1 rounded bg-amber-600 dark:bg-amber-500 text-white font-medium hover:opacity-90 transition-opacity shrink-0 ml-3 cursor-pointer"
            >
              立即配置
            </button>
          </div>
        )}

        {/* 错误提示条 */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 flex items-center justify-between text-xs text-red-700 dark:text-red-300 animate-in fade-in duration-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <div className="flex items-center space-x-2">
              {!hasConfiguredKey && (
                <button
                  onClick={() => setIsKeyModalOpen(true)}
                  className="underline hover:opacity-80 cursor-pointer"
                >
                  配置 Key
                </button>
              )}
              <button
                onClick={clearError}
                className="px-2 py-0.5 rounded hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {/* 主控制台：两列极简流线型布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* 左侧主要区域：剧本输入框（内嵌生成按钮） + 风格调优 + 实时监听播放器 (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[hsl(var(--fg-secondary))] uppercase tracking-wider">
                  台词与表演剧本 (Performance Script)
                </span>
                <span className="text-[11px] text-[hsl(var(--fg-muted))]">
                  支持行内情绪标签与 Ctrl + Enter 快捷生成
                </span>
              </div>
              <Editor
                text={text}
                onChange={setText}
                onReset={handleResetSample}
                isGenerating={isGenerating}
                onGenerate={generateAudio}
              />
            </div>

            {/* 演播风格调优 */}
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs">
              <StyleSelector
                style={speechStyle}
                onChangeStyle={setSpeechStyle}
                disabled={isGenerating}
              />
            </div>

            {/* 监听与下载播放器（置于输入框下方，声波立即可见，完全免去翻页查找） */}
            <AudioPlayer
              audioUrl={audioUrl}
              audioBlob={audioBlob}
              modelName={selectedModel}
              voiceName={selectedVoice}
            />
          </div>

          {/* 右侧设置区域：动态模型架构 + 精选音色库 (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* 动态模型选择（自适应版本排序，支持 TTS / Live 分类） */}
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs">
              <ModelPicker
                models={models}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                isLoading={isLoadingModels}
                modelsSource={modelsSource}
                onRefresh={refreshModels}
              />
            </div>

            {/* 音色库选择（紧凑可滚动，带即时搜索，不挤占竖向空间） */}
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs">
              <VoicePicker
                voices={voices}
                selectedVoice={selectedVoice}
                onSelectVoice={setSelectedVoice}
                isLoading={isLoadingVoices}
              />
            </div>
          </div>
        </div>
      </main>

      {/* 底部极简状态栏 */}
      <footer className="w-full border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] py-4 px-6 text-center text-xs text-[hsl(var(--fg-muted))]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Gemini TTS Studio • 录音棚级神经语音工程</span>
          <span>Google AI Studio • Bun • Hono • React • TailwindCSS</span>
        </div>
      </footer>

      {/* API Key 设置模态窗 */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        apiKey={apiKey}
        onSaveKey={setApiKey}
        hasServerKey={hasServerKey}
      />
    </div>
  );
}
export default App;
