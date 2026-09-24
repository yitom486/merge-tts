import { useState, useEffect, useCallback } from 'react';

export type ModelCategory = 'tts' | 'live' | 'other';


export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isTtsRecommended: boolean;
  category?: ModelCategory;
}


export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender?: 'female' | 'male' | 'neutral';
  tone?: string;
}

const DEFAULT_SAMPLE_TEXT = `Welcome to Gemini 3.8 TTS Studio. [laughs] Listen to how natural and expressive speech can truly be. [short pause] Notice the nuanced pacing, and how emotional inflection carries through every syllable. [whispers] Try listening with headphones to feel the recording studio presence.`;

export function useTTS() {
  const [apiKey, setApiKeyState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('gemini-user-api-key') || '';
  });

  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('gemini-selected-model') || '';
  });
  const [modelsSource, setModelsSource] = useState<'remote' | 'fallback'>('fallback');
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('Puck');
  const [isLoadingVoices, setIsLoadingVoices] = useState<boolean>(false);

  const [text, setText] = useState<string>(DEFAULT_SAMPLE_TEXT);
  const [speechStyle, setSpeechStyle] = useState<string>('Natural & Expressive');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 保存 API Key 并同步到 localStorage
  const setApiKey = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    setApiKeyState(trimmed);
    localStorage.setItem('gemini-user-api-key', trimmed);
  }, []);

  // 保存选择的模型
  const handleSelectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem('gemini-selected-model', modelId);
  }, []);

  // 探测健康状态与服务器默认 Key 配置
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHasServerKey(Boolean(data.hasServerKey));
      }
    } catch {
      // 忽略本地离线探活失败
    }
  }, []);

  // 动态从 /api/models 拉取模型列表（非死板硬编码）
  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }
      const res = await fetch('/api/models', { headers });
      if (res.ok) {
        const data = await res.json() as { models: ModelInfo[]; source: 'remote' | 'fallback' };
        if (data.models && data.models.length > 0) {
          setModels(data.models);
          setModelsSource(data.source);
          // 若当前未选择或选择的模型已失效，自动选择排序第一位的最高分旗舰模型
          setSelectedModel((prev) => {
            if (prev && data.models.some((m) => m.id === prev)) {
              return prev;
            }
            const topModel = data.models[0].id;
            localStorage.setItem('gemini-selected-model', topModel);
            return topModel;
          });
        }
      }
    } catch (err: any) {
      console.warn('获取模型失败:', err);
    } finally {
      setIsLoadingModels(false);
    }
  }, [apiKey]);


  // 从 /api/voices 拉取声音列表
  const fetchVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }
      const res = await fetch('/api/voices', { headers });
      if (res.ok) {
        const data = await res.json() as { voices: VoiceInfo[] };
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          if (!data.voices.some(v => v.id === selectedVoice)) {
            setSelectedVoice(data.voices[0].id);
          }
        }
      }
    } catch (err: any) {
      console.warn('获取声音失败:', err);
    } finally {
      setIsLoadingVoices(false);
    }
  }, [apiKey, selectedVoice]);

  // 页面加载或 Key 变化时刷新
  useEffect(() => {
    checkHealth();
    fetchModels();
    fetchVoices();
  }, [apiKey]);

  // 生成音频主操作
  const generateAudio = useCallback(async () => {
    if (!text.trim()) {
      setError('请输入需要朗读的文本');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          voiceName: selectedVoice,
          model: selectedModel,
          speechMetadata: speechStyle,
        }),
      });

      if (!res.ok) {
        let msg = `生成失败 (${res.status})`;
        try {
          const errData = await res.json();
          msg = errData.error || msg;
        } catch {
          const txt = await res.text();
          if (txt) msg = txt;
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      // 释放之前的 ObjectURL 避免内存泄漏
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const newUrl = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(newUrl);
    } catch (err: any) {
      setError(err?.message || '生成音频时发生错误');
    } finally {
      setIsGenerating(false);
    }
  }, [text, selectedVoice, selectedModel, speechStyle, apiKey, audioUrl]);

  return {
    apiKey,
    setApiKey,
    hasServerKey,
    models,
    selectedModel,
    setSelectedModel: handleSelectModel,
    modelsSource,
    isLoadingModels,
    refreshModels: fetchModels,
    voices,
    selectedVoice,
    setSelectedVoice,
    isLoadingVoices,
    refreshVoices: fetchVoices,
    text,
    setText,
    speechStyle,
    setSpeechStyle,
    isGenerating,
    audioUrl,
    audioBlob,
    error,
    clearError: () => setError(null),
    generateAudio,
  };
}
