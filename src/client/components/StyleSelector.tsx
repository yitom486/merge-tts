import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface StyleSelectorProps {
  style: string;
  onChangeStyle: (style: string) => void;
  disabled: boolean;
}

const PRESET_STYLES = [
  { label: '自然生动', value: 'Natural, fluent and expressive' },
  { label: '温和亲切', value: 'Warm, soothing, and friendly conversational tone' },
  { label: '有声书叙事', value: 'Audiobook narrator, measured pacing, immersive storytelling' },
  { label: '戏剧张力', value: 'Dramatic, tense, emotionally intense performance' },
  { label: '轻声私语', value: 'Soft, intimate, whispered vocal delivery' },
  { label: '干练商务', value: 'Professional, articulate, corporate presentation' },
];

export const StyleSelector: React.FC<StyleSelectorProps> = ({
  style,
  onChangeStyle,
  disabled,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[hsl(var(--fg-secondary))] flex items-center space-x-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[hsl(var(--fg-muted))]" />
          <span>演播风格调优 (Speech Style / Metadata)</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESET_STYLES.map((preset) => {
          const isSelected = style === preset.value;
          return (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => onChangeStyle(preset.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer disabled:opacity-50 ${
                isSelected
                  ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-fg))] shadow-2xs'
                  : 'border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-secondary))] hover:bg-[hsl(var(--bg-hover))] hover:text-[hsl(var(--fg-primary))]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        disabled={disabled}
        value={style}
        onChange={(e) => onChangeStyle(e.target.value)}
        placeholder="或输入自定义风格提示词，例如：Mysterious and contemplative..."
        className="w-full px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-card))] text-[hsl(var(--fg-primary))] focus:outline-none focus:border-[hsl(var(--border-focus))] font-mono"
      />
    </div>
  );
};
