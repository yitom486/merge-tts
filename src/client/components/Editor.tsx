import React, { useRef } from 'react';
import { Sparkles, RotateCcw, Trash2, Smile, Wind, VolumeX, Pause, Activity } from 'lucide-react';

interface EditorProps {
  text: string;
  onChange: (val: string) => void;
  onReset: () => void;
  isGenerating: boolean;
}

interface VocalTag {
  label: string;
  tag: string;
  description: string;
  icon?: React.ReactNode;
}

const VOCAL_TAGS: VocalTag[] = [
  { label: '笑声', tag: '[laughs]', description: '自然的轻笑与欢愉语气' },
  { label: '叹息', tag: '[sighs]', description: '深长的叹气或松弛呼吸' },
  { label: '耳语', tag: '[whispers]', description: '气声轻语、私密亲近感' },
  { label: '短停顿', tag: '[short pause]', description: '节奏留白、思考间隙' },
  { label: '清嗓', tag: '[clears throat]', description: '真实的喉音与转折提示' },
  { label: '倒吸气', tag: '[gasp]', description: '惊讶与戏剧化呼吸' },
];

export const Editor: React.FC<EditorProps> = ({
  text,
  onChange,
  onReset,
  isGenerating,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 插入行内表演标签，并精准恢复光标位置
  const handleInsertTag = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(text + ' ' + tag + ' ');
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const insertion = (before.endsWith(' ') || before.length === 0 ? '' : ' ') +
      tag +
      (after.startsWith(' ') || after.length === 0 ? '' : ' ');

    const newText = before + insertion + after;
    onChange(newText);

    // 重新将光标置于标签之后
    setTimeout(() => {
      textarea.focus();
      const newPos = start + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] overflow-hidden shadow-xs">
      {/* Top Bar: Vocal Performance Tags Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-subtle))]">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
          <span className="text-[11px] font-medium text-[hsl(var(--fg-muted))] mr-1 shrink-0">
            表演动作:
          </span>
          {VOCAL_TAGS.map((item) => (
            <button
              key={item.tag}
              type="button"
              disabled={isGenerating}
              onClick={() => handleInsertTag(item.tag)}
              title={`${item.tag} - ${item.description}`}
              className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-mono font-medium border border-[hsl(var(--tag-border))] bg-[hsl(var(--tag-bg))] text-[hsl(var(--tag-fg))] hover:bg-[hsl(var(--tag-hover))] active:scale-95 transition-all cursor-pointer disabled:opacity-50 select-none shrink-0"
            >
              <span>{item.tag}</span>
              <span className="font-sans text-[10px] text-[hsl(var(--fg-muted))]">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Text Actions */}
        <div className="flex items-center space-x-1 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onReset}
            disabled={isGenerating}
            title="恢复默认示范文本"
            className="p-1 rounded-md text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg-primary))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer text-xs flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden sm:inline">重置</span>
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={isGenerating || !text}
            title="清空文本"
            className="p-1 rounded-md text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--status-error))] hover:bg-[hsl(var(--bg-hover))] transition-colors cursor-pointer text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Main Text Area */}
      <div className="relative p-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="在此输入需要由 Gemini 3.8 朗读的台词或文章，可点击上方按钮在光标处插入 [laughs]、[whispers] 等行内表演标签..."
          rows={6}
          disabled={isGenerating}
          className="w-full resize-y bg-transparent text-[hsl(var(--fg-primary))] text-sm leading-relaxed placeholder:text-[hsl(var(--fg-muted))] focus:outline-none font-normal"
        />
      </div>

      {/* Bottom Counter Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[11px] text-[hsl(var(--fg-muted))] font-mono">
        <div className="flex items-center space-x-3">
          <span>{charCount} 字符</span>
          <span>•</span>
          <span>{wordCount} 词</span>
        </div>
        <div className="text-[10px] text-[hsl(var(--fg-muted))] font-sans hidden sm:block">
          支持多语言朗读与情绪呼吸拟真
        </div>
      </div>
    </div>
  );
};
