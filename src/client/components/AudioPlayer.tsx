import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Download, Volume2, RotateCcw, Radio, X } from 'lucide-react';
import { formatTime } from '../lib/utils';

interface AudioPlayerProps {
  audioUrl: string | null;
  audioBlob: Blob | null;
  modelName: string;
  voiceName: string;
  isGenerating?: boolean;
  isStreaming?: boolean;
  streamedSeconds?: number;
  streamedChunks?: number;
  onCancel?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  audioBlob,
  modelName,
  voiceName,
  isGenerating = false,
  isStreaming = false,
  streamedSeconds = 0,
  streamedChunks = 0,
  onCancel,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [audioUrl]);

  if (!audioUrl) {
    return (
      <div className="rounded-xl border border-dashed border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-2 text-[hsl(var(--fg-muted))]">
          <div className="w-9 h-9 rounded-full bg-[hsl(var(--bg-subtle))] flex items-center justify-center">
            {isStreaming ? (
              <Radio className="w-4 h-4 text-[hsl(var(--accent))] animate-pulse" />
            ) : (
              <Volume2 className="w-4 h-4 text-[hsl(var(--fg-muted))]" />
            )}
          </div>
          {isStreaming ? (
            <>
              <p className="text-xs font-medium text-[hsl(var(--fg-primary))]">
                正在流式合成并实时播放…已接收 {streamedSeconds.toFixed(1)}s 音频（{streamedChunks} 片）
              </p>
              <p className="text-[11px]">首包即播，无需等待整段生成完成</p>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="mt-1 flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] border border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--bg-hover))] text-[hsl(var(--fg-primary))] transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>取消生成</span>
                </button>
              )}
            </>
          ) : (
            <p className="text-xs">
              配置台词与音色后，点击下方「生成音频」，生成的录音棚高保真音频将在此实时播放与下载。
            </p>
          )}
        </div>
      </div>
    );
  }

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `gemini-3.8-tts-${voiceName.toLowerCase()}-${dateStr}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fileSizeKb = audioBlob ? (audioBlob.size / 1024).toFixed(1) : null;

  return (
    <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] p-4 shadow-xs space-y-3">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Top Meta info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-[hsl(var(--fg-primary))]">
            音频监听台 (Master Monitor)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))] text-[hsl(var(--fg-secondary))]">
            {voiceName} • {modelName.replace('models/', '')}
          </span>
        </div>
        {fileSizeKb && (
          <span className="text-[11px] font-mono text-[hsl(var(--fg-muted))]">
            WAV • {fileSizeKb} KB
          </span>
        )}
        {isStreaming && (
          <span className="text-[11px] font-mono text-[hsl(var(--accent))] animate-pulse">
            ● 流式接收 {streamedSeconds.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Modern Waveform Visualizer Bar */}
      <div className="h-10 bg-[hsl(var(--bg-subtle))] rounded-lg flex items-center justify-between px-3 gap-1 overflow-hidden relative">
        {/* Background waveform columns */}
        {Array.from({ length: 48 }).map((_, i) => {
          const heightSeed = Math.sin(i * 0.45) * 12 + 16;
          const isActive = (i / 48) * 100 <= progressPercent;
          return (
            <div
              key={i}
              style={{
                height: `${heightSeed}px`,
                animationDelay: `${(i % 5) * 80}ms`,
              }}
              className={`flex-1 min-w-[2px] rounded-full transition-all duration-150 ${
                isActive
                  ? 'bg-[hsl(var(--accent))]'
                  : 'bg-[hsl(var(--border-subtle))]'
              } ${isPlaying ? 'animate-pulse' : ''}`}
            />
          );
        })}
      </div>

      {/* Progress slider */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Audio progress slider"
          className="w-full h-1 bg-[hsl(var(--border-subtle))] rounded-lg appearance-none cursor-pointer accent-[hsl(var(--accent))]"
        />
        <div className="flex justify-between text-[11px] font-mono text-[hsl(var(--fg-muted))]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2">
          {/* Play / Pause Button */}
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className="w-9 h-9 rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] flex items-center justify-center hover:bg-[hsl(var(--accent-hover))] active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Replay */}
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
                audioRef.current.play();
                setIsPlaying(true);
              }
            }}
            aria-label="Replay audio"
            className="p-2 rounded-md text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer"
            title="从头重播"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Download WAV button */}
        <button
          onClick={handleDownload}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] hover:bg-[hsl(var(--bg-hover))] text-[hsl(var(--fg-primary))] transition-colors shadow-2xs cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>下载 WAV 音频</span>
        </button>
      </div>
    </div>
  );
};
