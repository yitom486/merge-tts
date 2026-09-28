import { useState, useEffect, useCallback, useRef } from 'react';
import { base64ToBytes, parsePcmRate, pcmChunksToWavBlob, PcmStreamPlayer } from '../lib/audio';

export type ModelCategory = 'tts' | 'live' | 'other';


export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isTtsRecommended: boolean;
  category?: ModelCategory;
  tier?: string;
  provider?: string;
}


export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender?: 'female' | 'male' | 'neutral';
  tone?: string;
  kind?: 'prebuilt' | 'prompted' | 'replicated' | 'custom';
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
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('gemini-selected-language') || '';
  });
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamedSeconds, setStreamedSeconds] = useState<number>(0);
  const [streamedChunks, setStreamedChunks] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 双人对话模式：第二音色（transcript 用 Speaker 1 / Speaker 2 区分角色）
  const [isDialogue, setIsDialogue] = useState<boolean>(false);
  const [secondVoice, setSecondVoice] = useState<string>('Kore');

  const abortRef = useRef<AbortController | null>(null);
  const playerRef = useRef<PcmStreamPlayer | null>(null);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

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

  // 保存选择的合成语言
  const handleSelectLanguage = useCallback((lang: string) => {
    setLanguage(lang);
    localStorage.setItem('gemini-selected-language', lang);
  }, []);

  // 组装通用请求体（含风格样式与双人对话角色）
  const buildRequestBody = useCallback(() => {
    const body: Record<string, unknown> = {
      text,
      voiceName: selectedVoice,
      model: selectedModel,
      speechMetadata: speechStyle,
    };
    if (language) {
      body.languageCode = language;
    }
    if (isDialogue && secondVoice && secondVoice !== selectedVoice) {
      body.speakers = [
        { speaker: 'Speaker 1', voiceName: selectedVoice },
        { speaker: 'Speaker 2', voiceName: secondVoice },
      ];
    }
    return body;
  }, [text, selectedVoice, selectedModel, speechStyle, language, isDialogue, secondVoice]);

  const finishWithBlob = useCallback((blob: Blob, prevUrl: string | null) => {
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
    }
    const newUrl = URL.createObjectURL(blob);
    setAudioBlob(blob);
    setAudioUrl(newUrl);
  }, []);

  // 一次性生成（兜底：流式不可用或失败时）
  const generateAudioOnce = useCallback(async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['x-gemini-api-key'] = apiKey;
    }

    const res = await fetch('/api/tts/generate', {
      method: 'POST',
      headers,
      signal: abortRef.current?.signal,
      body: JSON.stringify(buildRequestBody()),
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
    finishWithBlob(blob, audioUrl);
  }, [apiKey, audioUrl, buildRequestBody, finishWithBlob]);

  // 流式生成：首包即播 + 实时进度，完成后拼 WAV 供回放/下载
  const generateAudioStream = useCallback(async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (apiKey) {
      headers['x-gemini-api-key'] = apiKey;
    }

    const res = await fetch('/api/tts/stream', {
      method: 'POST',
      headers,
      signal: abortRef.current?.signal,
      body: JSON.stringify(buildRequestBody()),
    });

    if (!res.ok || !res.body) {
      let msg = `流式生成失败 (${res.status})`;
      try {
        const errData = await res.json();
        msg = errData.error || msg;
      } catch {
        // 保持默认 msg
      }
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    const pcmChunks: Uint8Array[] = [];
    let sampleRate = 24000;
    let receivedChunks = 0;
    let player: PcmStreamPlayer | null = null;

    const handleEvent = async (raw: string) => {
      const line = raw.trim();
      if (!line.startsWith('data:')) return;
      const payload = JSON.parse(line.slice(5).trim());
      if (payload.error) {
        throw new Error(payload.error);
      }
      if (payload.audio) {
        sampleRate = parsePcmRate(payload.mimeType);
        const bytes = base64ToBytes(payload.audio);
        pcmChunks.push(bytes);
        receivedChunks++;
        setStreamedChunks(receivedChunks);
        if (!player) {
          player = new PcmStreamPlayer(sampleRate);
          playerRef.current = player;
          await player.resume();
        }
        player.pushChunk(bytes);
        setStreamedSeconds(player.playedSeconds);
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = sseBuffer.indexOf('\n\n')) >= 0) {
          const rawEvent = sseBuffer.slice(0, idx);
          sseBuffer = sseBuffer.slice(idx + 2);
          const lines = rawEvent.split('\n');
          for (const ln of lines) {
            if (ln.trim()) await handleEvent(ln);
          }
        }
      }
      if (sseBuffer.trim()) {
        for (const ln of sseBuffer.split('\n')) {
          if (ln.trim()) await handleEvent(ln);
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (receivedChunks === 0) {
      throw new Error('流式返回中未收到音频数据');
    }

    // 拼完整 WAV：<audio> 回放 / 波形 / 下载共用
    const wavBlob = pcmChunksToWavBlob(pcmChunks, sampleRate);
    finishWithBlob(wavBlob, audioUrl);
  }, [apiKey, audioUrl, buildRequestBody, finishWithBlob]);

  // 生成音频主操作：优先流式边下边播，失败自动降级一次性
  const generateAudio = useCallback(async () => {
    if (!text.trim()) {
      setError('请输入需要朗读的文本');
      return;
    }

    // 取消上一次未完成的任务
    abortRef.current?.abort();
    await playerRef.current?.close().catch(() => {});
    playerRef.current = null;

    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setIsStreaming(false);
    setStreamedSeconds(0);
    setStreamedChunks(0);
    setError(null);

    try {
      try {
        setIsStreaming(true);
        await generateAudioStream();
      } catch (streamErr: any) {
        if (controller.signal.aborted) {
          throw new Error('已取消生成');
        }
        console.warn('流式生成失败，降级为一次性生成:', streamErr?.message || streamErr);
        const stuckPlayer = playerRef.current as PcmStreamPlayer | null;
        playerRef.current = null;
        if (stuckPlayer) {
          await stuckPlayer.close().catch(() => {});
        }
        setIsStreaming(false);
        await generateAudioOnce();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message === '已取消生成') {
        setError('已取消生成');
      } else {
        setError(err?.message || '生成音频时发生错误');
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setIsGenerating(false);
    }
  }, [text, generateAudioStream, generateAudioOnce]);

  // ---- 自定义音色管理（Voices API：设计 / 复刻 / 删除） ----
  const [isManagingVoice, setIsManagingVoice] = useState<boolean>(false);

  const voiceHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-gemini-api-key'] = apiKey;
    }
    return headers;
  }, [apiKey]);

  /** 自然语言设计音色，返回 { id, sampleUrl }（sampleUrl 为试听音频 data URL） */
  const designVoice = useCallback(async (input: string, opts?: { displayName?: string; gender?: string; languageCode?: string; model?: string }) => {
    setIsManagingVoice(true);
    try {
      const res = await fetch('/api/voices/design', {
        method: 'POST',
        headers: voiceHeaders(),
        body: JSON.stringify({ input, ...opts, model: opts?.model || selectedModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `设计音色失败 (${res.status})`);
      }
      await fetchVoices();
      const sample = data.sampleAudio;
      return {
        id: data.id as string,
        displayName: data.displayName as string | undefined,
        sampleUrl: sample?.data ? `data:${sample.mimeType || 'audio/wav'};base64,${sample.data}` : null as string | null,
      };
    } finally {
      setIsManagingVoice(false);
    }
  }, [voiceHeaders, selectedModel, fetchVoices]);

  /** 声音复刻：需参考音 + 同一人授权声明朗读（File 转 base64 后传入） */
  const replicateVoice = useCallback(async (args: {
    displayName?: string; model?: string; store?: boolean;
    sourceFile: File; consentFile: File;
  }) => {
    const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error('读取音频文件失败'));
      reader.readAsDataURL(file);
    });
    setIsManagingVoice(true);
    try {
      const [sourceAudio, consentAudio] = await Promise.all([
        toBase64(args.sourceFile),
        toBase64(args.consentFile),
      ]);
      const res = await fetch('/api/voices/replicate', {
        method: 'POST',
        headers: voiceHeaders(),
        body: JSON.stringify({
          displayName: args.displayName,
          model: args.model || selectedModel,
          store: args.store !== false,
          sourceAudio,
          sourceMime: args.sourceFile.type || 'audio/wav',
          consentAudio,
          consentMime: args.consentFile.type || 'audio/wav',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `复刻音色失败 (${res.status})`);
      }
      await fetchVoices();
      return { id: data.id as string, key: data.key as string | undefined };
    } finally {
      setIsManagingVoice(false);
    }
  }, [voiceHeaders, selectedModel, fetchVoices]);

  /** 删除自定义音色（预置音色不可删，服务端会拒绝） */
  const deleteVoice = useCallback(async (id: string) => {
    setIsManagingVoice(true);
    try {
      const res = await fetch(`/api/voices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: voiceHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `删除音色失败 (${res.status})`);
      }
      if (selectedVoice === id) {
        setSelectedVoice('Puck');
      }
      await fetchVoices();
    } finally {
      setIsManagingVoice(false);
    }
  }, [voiceHeaders, fetchVoices, selectedVoice]);

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
    language,
    setLanguage: handleSelectLanguage,
    isDialogue,
    setIsDialogue,
    secondVoice,
    setSecondVoice,
    isGenerating,
    isStreaming,
    streamedSeconds,
    streamedChunks,
    audioUrl,
    audioBlob,
    error,
    clearError: () => setError(null),
    generateAudio,
    cancelGeneration,
    isManagingVoice,
    designVoice,
    replicateVoice,
    deleteVoice,
  };
}
