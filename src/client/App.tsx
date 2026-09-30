import React, { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useTTS } from './hooks/useTTS';
import { Header } from './components/Header';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Editor } from './components/Editor';
import { VoicePicker } from './components/VoicePicker';
import { VoiceStudio } from './components/VoiceStudio';
import { ModelPicker } from './components/ModelPicker';
import { StyleSelector } from './components/StyleSelector';
import { AudioPlayer } from './components/AudioPlayer';
import { AlertCircle } from 'lucide-react';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    provider,
    setProvider,
    providers,
    apiKey,
    setApiKey,
    azureKey,
    setAzureKey,
    azureRegion,
    setAzureRegion,
    hasServerKey,
    providerServerKeys,
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
    language,
    setLanguage,
    isDialogue,
    setIsDialogue,
    secondVoice,
    setSecondVoice,
    dialogueLabeled,
    applyDialogueTemplate,
    isGenerating,
    isStreaming,
    streamNote,
    streamedSeconds,
    streamedChunks,
    audioUrl,
    audioBlob,
    error,
    clearError,
    generateAudio,
    cancelGeneration,
    auditioningId,
    auditionVoice,
    isManagingVoice,
    designVoice,
    replicateVoice,
    fetchVoiceSample,
    deleteVoice,
  } = useTTS();

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  const azureServerKey = Boolean(providerServerKeys['azure']);
  const activeServerKey = provider === 'azure' ? azureServerKey : hasServerKey;
  const activeLocalKey = provider === 'azure' ? azureKey : apiKey;
  const hasConfiguredKey = Boolean(activeLocalKey || activeServerKey);
  const isGemini = provider === 'gemini';

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
                检测到当前厂商（{provider === 'azure' ? 'Azure Speech' : 'Gemini'}）尚未配置 API Key。请点击右侧按钮输入，或在根目录 <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">.env</code> 中添加。
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
                isGenerating={isGenerating}
                onGenerate={generateAudio}
              />
            </div>

            {/* 演播风格调优（仅 Gemini；Azure 不支持风格与表演标签） */}
            {isGemini && (
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs space-y-3">
              <StyleSelector
                style={speechStyle}
                onChangeStyle={setSpeechStyle}
                disabled={isGenerating}
              />
              {/* 合成语言（官方 80+ locale，留空=自动） */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-[hsl(var(--fg-muted))] shrink-0">合成语言</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isGenerating}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] text-xs outline-none focus:border-[hsl(var(--border-focus))] disabled:opacity-50"
                >
                  <option value="">自动（跟随文本）</option>
                  <option value="cmn-cn">简体中文（cmn-cn）</option>
                  <option value="cmn-tw">繁體中文（cmn-tw）</option>
                  <option value="en-us">English (US)</option>
                  <option value="en-gb">English (UK)</option>
                  <option value="ja-jp">日本語</option>
                  <option value="ko-kr">한국어</option>
                  <option value="fr-fr">Français</option>
                  <option value="de-de">Deutsch</option>
                  <option value="es-es">Español</option>
                  <option value="it-it">Italiano</option>
                  <option value="pt-br">Português (BR)</option>
                  <option value="ru-ru">Русский</option>
                  <option value="ar-001">العربية</option>
                </select>
              </div>
            </div>
            )}

            {/* 双人对话模式（官方 multi-speaker，仅 Gemini）：剧本用 Speaker 1: / Speaker 2: 开头分角色 */}
            {isGemini && (
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs">
              <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDialogue}
                  onChange={(e) => setIsDialogue(e.target.checked)}
                  disabled={isGenerating}
                  className="w-3.5 h-3.5 accent-[hsl(var(--accent))]"
                />
                <span className="font-medium text-[hsl(var(--fg-primary))]">双人对话模式</span>
                <span className="text-[11px] text-[hsl(var(--fg-muted))]">下方分别为两路角色独立选角</span>
              </label>
              {isDialogue && (
                <div className="mt-2.5 space-y-2">
                  {/* 双人独立选角：两路音色互不干扰，单人模式沿用右侧音色库选择 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-[hsl(var(--fg-muted))] shrink-0">Speaker 1</span>
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        disabled={isGenerating}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] text-xs outline-none focus:border-[hsl(var(--border-focus))]"
                      >
                        {voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} — {v.description.slice(0, 24)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-[hsl(var(--fg-muted))] shrink-0">Speaker 2</span>
                      <select
                        value={secondVoice}
                        onChange={(e) => setSecondVoice(e.target.value)}
                        disabled={isGenerating}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-primary))] text-xs outline-none focus:border-[hsl(var(--border-focus))]"
                      >
                        {voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} — {v.description.slice(0, 24)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[hsl(var(--fg-muted))]">
                    剧本每行以 <code className="font-mono px-1 rounded bg-[hsl(var(--bg-subtle))]">Speaker 1:</code> /
                    <code className="font-mono px-1 rounded bg-[hsl(var(--bg-subtle))]">Speaker 2:</code> 开头分角色，
                    例：<code className="font-mono">Speaker 1: Hello!</code>
                    <button
                      type="button"
                      onClick={applyDialogueTemplate}
                      disabled={isGenerating}
                      className="ml-1 underline hover:text-[hsl(var(--fg-primary))] cursor-pointer disabled:opacity-50"
                    >
                      填入对话示例
                    </button>
                  </p>
                  {!dialogueLabeled && (
                    <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                      当前剧本未检测到 Speaker 标记，生成时将自动降级为单人朗读。
                    </p>
                  )}
                </div>
              )}
            </div>
            )}

            {/* 监听与下载播放器（置于输入框下方，声波立即可见，完全免去翻页查找） */}
            <AudioPlayer
              audioUrl={audioUrl}
              audioBlob={audioBlob}
              modelName={selectedModel}
              voiceName={isDialogue && dialogueLabeled ? `${selectedVoice}+${secondVoice}` : selectedVoice}
              isGenerating={isGenerating}
              isStreaming={isStreaming}
              streamedSeconds={streamedSeconds}
              streamedChunks={streamedChunks}
              note={streamNote}
              onCancel={cancelGeneration}
            />
          </div>

          {/* 右侧设置区域：厂商切换 + 动态模型架构 + 精选音色库 (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* TTS 厂商切换 */}
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-3 shadow-xs">
              <div className="flex rounded-lg border border-[hsl(var(--border-subtle))] overflow-hidden text-xs">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    disabled={isGenerating}
                    className={`flex-1 px-2 py-2 transition-colors cursor-pointer disabled:opacity-50 ${
                      provider === p.id
                        ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] font-medium'
                        : 'bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))]'
                    }`}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
              {!isGemini && (
                <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--fg-muted))]">
                  Azure 按 SSE 单包下发（微软 REST 无真流式），前端同一套播放；F0 每月 50 万字符免费，Key 与区域必须同区。语言由音色决定，请在音色库用语言筛选；[laughs] 类表演标签会自动去掉不发音。
                </p>
              )}
            </div>

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
                auditioningId={auditioningId}
                onAudition={auditionVoice}
              />
            </div>

            {/* 自定义音色工作室（设计 / 复刻 / 删除，仅 Gemini） */}
            {isGemini && (
            <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs">
              <VoiceStudio
                voices={voices}
                selectedVoice={selectedVoice}
                onSelectVoice={setSelectedVoice}
                disabled={isGenerating}
                isBusy={isManagingVoice}
                onDesign={designVoice}
                onReplicate={replicateVoice}
                onPreviewSample={fetchVoiceSample}
                onDelete={deleteVoice}
              />
            </div>
            )}
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
        provider={provider}
        apiKey={apiKey}
        onSaveKey={setApiKey}
        hasServerKey={hasServerKey}
        azureKey={azureKey}
        onSaveAzureKey={setAzureKey}
        azureRegion={azureRegion}
        onSaveAzureRegion={setAzureRegion}
        azureServerKey={azureServerKey}
      />
    </div>
  );
}
export default App;
