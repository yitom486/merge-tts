import { useState, useEffect, useCallback, useRef } from 'react';
import { base64ToBytes, parsePcmRate, audioChunksToBlob, isRawPcmMime, PcmStreamPlayer } from '../lib/audio';

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

export interface ProviderInfo {
  id: string;
  displayName: string;
  defaultModel?: string;
  defaultVoice?: string;
}

const readLS = (key: string, fallback = '') => {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) || fallback;
};

export function useTTS() {
  const [provider, setProviderState] = useState<string>(() => readLS('tts-selected-provider', 'gemini'));
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  const [apiKey, setApiKeyState] = useState<string>(() => readLS('gemini-user-api-key'));
  const [azureKey, setAzureKeyState] = useState<string>(() => readLS('azure-user-api-key'));
  const [azureRegion, setAzureRegionState] = useState<string>(() => readLS('azure-region'));

  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [providerServerKeys, setProviderServerKeys] = useState<Record<string, boolean>>({});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const p = readLS('tts-selected-provider', 'gemini');
    return readLS(`tts-model-${p}`);
  });
  const [modelsSource, setModelsSource] = useState<'remote' | 'fallback'>('fallback');
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [isLoadingVoices, setIsLoadingVoices] = useState<boolean>(false);

  const [text, setText] = useState<string>('');
  const [speechStyle, setSpeechStyle] = useState<string>('Natural & Expressive');
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('gemini-selected-language') || '';
  });
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamNote, setStreamNote] = useState<string | null>(null);
  const [streamedSeconds, setStreamedSeconds] = useState<number>(0);
  const [streamedChunks, setStreamedChunks] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 双人对话模式：第二音色（transcript 用 Speaker 1 / Speaker 2 区分角色）
  const [isDialogue, setIsDialogue] = useState<boolean>(false);
  const [secondVoice, setSecondVoice] = useState<string>('');

  // 剧本是否带双人标记（官方要求 transcript 里出现与 speakers 一致的说话人名）
  const hasDialogueLabels = (t: string) =>
    /speaker\s*1\s*:/i.test(t) && /speaker\s*2\s*:/i.test(t);
  const dialogueLabeled = isDialogue && hasDialogueLabels(text);

  // 一键填入双人对话示例剧本
  const applyDialogueTemplate = useCallback(() => {
    setText(
      `Speaker 1: Hey, have you tried the new multi-speaker feature? Each of us gets our own voice.\n` +
      `Speaker 2: Yes! Listen to this, we sound like two real people talking.\n` +
      `Speaker 1: [laughs] That's amazing. Try adding emotions to your line.\n` +
      `Speaker 2: [whispers] Like this? Now we're truly performing a scene together.`
    );
  }, []);

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

  const setAzureKey = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    setAzureKeyState(trimmed);
    localStorage.setItem('azure-user-api-key', trimmed);
  }, []);

  const setAzureRegion = useCallback((region: string) => {
    const trimmed = region.trim().toLowerCase();
    setAzureRegionState(trimmed);
    localStorage.setItem('azure-region', trimmed);
  }, []);

  // 切换厂商：按厂商记忆模型，清空当前音色待重新拉取
  const setProvider = useCallback((id: string) => {
    const pid = (id || 'gemini').toLowerCase();
    setProviderState(pid);
    localStorage.setItem('tts-selected-provider', pid);
    setSelectedModel(readLS(`tts-model-${pid}`));
    setSelectedVoice('');
    setError(null);
  }, []);

  // 当前厂商生效的 Key（请求头优先，其次服务端 .env）
  const activeKey = provider === 'azure' ? azureKey : apiKey;

  // 保存选择的模型（按厂商分别记忆）
  const handleSelectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem(`tts-model-${provider}`, modelId);
  }, [provider]);

  const buildKeyHeaders = useCallback((json = false) => {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (activeKey) headers[`x-${provider}-api-key`] = activeKey;
    return headers;
  }, [activeKey, provider]);

  // 探测健康状态与服务器默认 Key 配置
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHasServerKey(Boolean(data.hasServerKey));
        if (data.providers && typeof data.providers === 'object') {
          setProviderServerKeys(data.providers);
        }
      }
    } catch {
      // 忽略本地离线探活失败
    }
  }, []);

  // 拉取厂商列表（失败即报错，不再内置写死）
  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) {
        throw new Error(`获取厂商列表失败 (${res.status})`);
      }
      const data = await res.json() as { providers: ProviderInfo[] };
      if (!data.providers || data.providers.length === 0) {
        throw new Error('服务端未注册任何 TTS 厂商');
      }
      setProviders(data.providers);
    } catch (err: any) {
      setError(err?.message || '获取厂商列表失败');
    }
  }, []);

  // 动态从 /api/models 拉取模型列表（失败即报错；Azure 无模型概念，空列表合法）
  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const query = `/api/models?provider=${encodeURIComponent(provider)}${provider === 'azure' && azureRegion ? `&region=${encodeURIComponent(azureRegion)}` : ''}`;
      const res = await fetch(query, { headers: buildKeyHeaders() });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `获取模型失败 (${res.status})`);
      }
      const data = await res.json() as { models: ModelInfo[]; source: 'remote' | 'fallback' };
      const list = data.models || [];
      setModels(list);
      setModelsSource(data.source);
      // 若当前未选择或选择的模型已失效，自动选择首个
      setSelectedModel((prev) => {
        if (prev && list.some((m) => m.id === prev)) {
          return prev;
        }
        const topModel = list.length > 0 ? list[0].id : '';
        localStorage.setItem(`tts-model-${provider}`, topModel);
        return topModel;
      });
    } catch (err: any) {
      setError(err?.message || '获取模型失败');
    } finally {
      setIsLoadingModels(false);
    }
  }, [provider, azureRegion, buildKeyHeaders]);


  // 从 /api/voices 拉取声音列表（失败即报错；有效选择保留，无效则取首个）
  const fetchVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const query = `/api/voices?provider=${encodeURIComponent(provider)}${provider === 'azure' && azureRegion ? `&region=${encodeURIComponent(azureRegion)}` : ''}`;
      const res = await fetch(query, { headers: buildKeyHeaders() });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `获取声音失败 (${res.status})`);
      }
      const data = await res.json() as { voices: VoiceInfo[] };
      const list = data.voices || [];
      setVoices(list);
      setSelectedVoice((prev) => {
        if (prev && list.some((v) => v.id === prev)) return prev;
        return list.length > 0 ? list[0].id : '';
      });
      setSecondVoice((prev) => {
        if (prev && list.some((v) => v.id === prev)) return prev;
        return list.length > 0 ? list[0].id : '';
      });
    } catch (err: any) {
      setError(err?.message || '获取声音失败');
    } finally {
      setIsLoadingVoices(false);
    }
  }, [provider, azureRegion, buildKeyHeaders]);

  // 页面加载或 Key / 厂商变化时刷新
  useEffect(() => {
    checkHealth();
    fetchProviders();
    fetchModels();
    fetchVoices();
  }, [provider, apiKey, azureKey, azureRegion]);

  // 保存选择的合成语言
  const handleSelectLanguage = useCallback((lang: string) => {
    setLanguage(lang);
    localStorage.setItem('gemini-selected-language', lang);
  }, []);

  // 组装通用请求体（含厂商、风格样式与双人对话角色）
  const buildRequestBody = useCallback(() => {
    const body: Record<string, unknown> = {
      provider,
      text,
      voiceName: selectedVoice,
      model: selectedModel,
      speechMetadata: speechStyle,
    };
    if (language) {
      body.languageCode = language;
    }
    if (provider === 'azure' && azureRegion) {
      body.region = azureRegion;
    }
    // 仅当剧本带 Speaker 1:/2: 标记才走双人配置，否则降级单人（避免模型无法分角色）
    if (provider === 'gemini' && isDialogue && hasDialogueLabels(text) && secondVoice && secondVoice !== selectedVoice) {
      body.speakers = [
        { speaker: 'Speaker 1', voiceName: selectedVoice },
        { speaker: 'Speaker 2', voiceName: secondVoice },
      ];
    }
    return body;
  }, [provider, azureRegion, text, selectedVoice, selectedModel, speechStyle, language, isDialogue, secondVoice]);

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
    const headers = buildKeyHeaders(true);

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
  }, [audioUrl, buildRequestBody, buildKeyHeaders, finishWithBlob]);

  // 通用 SSE 流式拉取（全站默认通道）：返回 PCM 分片，边收边回调。
  // 注意：Azure 走 REST 单包降级（服务端自动处理，前端同一套解析）。
  const fetchStreamChunks = useCallback(async (
    body: Record<string, unknown>,
    signal: AbortSignal | null | undefined,
    onChunk?: (bytes: Uint8Array, sampleRate: number, index: number, mimeType: string) => void | Promise<void>
  ): Promise<{ chunks: Uint8Array[]; sampleRate: number; mimeType: string }> => {
    const headers = buildKeyHeaders(true);
    headers['Accept'] = 'text/event-stream';

    const res = await fetch('/api/tts/stream', {
      method: 'POST',
      headers,
      signal: signal || undefined,
      body: JSON.stringify(body),
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
    const chunks: Uint8Array[] = [];
    let sampleRate = 24000;
    let mimeType = 'audio/L16;codec=pcm;rate=24000';

    const handleEvent = async (raw: string) => {
      const line = raw.trim();
      if (!line.startsWith('data:')) return;
      const payload = JSON.parse(line.slice(5).trim());
      if (payload.error) {
        throw new Error(payload.error);
      }
      if (payload.audio) {
        if (payload.mimeType) mimeType = payload.mimeType;
        sampleRate = parsePcmRate(payload.mimeType);
        const bytes = base64ToBytes(payload.audio);
        const index = chunks.length;
        chunks.push(bytes);
        await onChunk?.(bytes, sampleRate, index, mimeType);
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

    if (chunks.length === 0) {
      throw new Error('流式返回中未收到音频数据');
    }

    return { chunks, sampleRate, mimeType };
  }, [buildKeyHeaders]);

  // 流式生成：PCM 首包即播 + 实时进度，完成后按 mime 拼装供回放/下载。
  // 非 PCM（Azure / 本地单包降级：完整 wav/mp3）不进实时播放器，只计数，
  // 最终直接拼完整文件——绝不能再包一层 WAV 头。
  const generateAudioStream = useCallback(async () => {
    let player: PcmStreamPlayer | null = null;
    const { chunks, sampleRate, mimeType } = await fetchStreamChunks(
      buildRequestBody() as Record<string, unknown>,
      abortRef.current?.signal,
      async (bytes, sr, _index, mime) => {
        setStreamedChunks((c) => c + 1);
        if (!isRawPcmMime(mime)) return;
        if (!player) {
          player = new PcmStreamPlayer(sr);
          playerRef.current = player;
          await player.resume();
        }
        player.pushChunk(bytes);
        setStreamedSeconds(player.playedSeconds);
      }
    );

    // 按 mime 拼装：PCM 包 WAV 头 / 完整文件直接拼接（<audio> 回放 / 波形 / 下载共用）
    const audioBlob = audioChunksToBlob(chunks, mimeType, sampleRate);
    finishWithBlob(audioBlob, audioUrl);
  }, [audioUrl, buildRequestBody, fetchStreamChunks, finishWithBlob]);

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
    setStreamNote(null);
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
        const reason = streamErr?.message || '未知错误';
        console.warn('流式生成失败，降级为一次性生成:', reason);
        setStreamNote(`流式通道失败，已自动降级一次性生成（原因：${reason}）`);
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

  const voiceHeaders = useCallback(() => buildKeyHeaders(true), [buildKeyHeaders]);

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

  /** 取官方试听小样（仅 prompted 设计音色有；预置/复刻返回 null，走合成试听） */
  const voiceSampleCache = useRef(new Map<string, string>());
  const fetchVoiceSample = useCallback(async (id: string): Promise<string | null> => {
    const cached = voiceSampleCache.current.get(id);
    if (cached) return cached;
    const res = await fetch(`/api/voices/${encodeURIComponent(id)}?provider=gemini`, {
      headers: buildKeyHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `获取试听小样失败 (${res.status})`);
    }
    const sample = data.sampleAudio;
    if (!sample?.data) return null;
    const url = `data:${sample.mimeType || 'audio/wav'};base64,${sample.data}`;
    voiceSampleCache.current.set(id, url);
    return url;
  }, [buildKeyHeaders]);

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
        setSelectedVoice('');
      }
      await fetchVoices();
    } finally {
      setIsManagingVoice(false);
    }
  }, [voiceHeaders, fetchVoices, selectedVoice]);

  // ---- 单音色试听：固定短文本 + 当前风格，一键听出音色本色 ----
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);
  const auditionPlayerRef = useRef<PcmStreamPlayer | null>(null);
  const auditionAbortRef = useRef<AbortController | null>(null);
  const auditionCache = useRef(new Map<string, string>());
  const auditionSeq = useRef(0);

  const stopAudition = useCallback(() => {
    auditionSeq.current++;
    auditionAbortRef.current?.abort();
    auditionAbortRef.current = null;
    auditionPlayerRef.current?.close().catch(() => {});
    auditionPlayerRef.current = null;
    auditionAudioRef.current?.pause();
    auditionAudioRef.current = null;
    setAuditioningId(null);
  }, []);

  // 试听同样走流式默认通道：首包即播 + 完成后缓存 WAV（复听零等待零计费）
  const auditionVoice = useCallback(async (voiceId: string) => {
    if (auditioningId === voiceId) {
      stopAudition();
      return;
    }
    stopAudition();
    const seq = ++auditionSeq.current;
    setAuditioningId(voiceId);
    try {
      // 试听文案 = 当前剧本正文（去 Speaker 标记，截前 80 字）；无正文直接提示，不编造语音
      const auditionText = text.replace(/^speaker\s*[12]\s*:\s*/gim, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!auditionText) {
        setError('请先在上方剧本输入文本再试听');
        setAuditioningId((cur) => (cur === voiceId ? null : cur));
        return;
      }
      const cacheKey = `${provider}:${voiceId}:${provider === 'gemini' ? speechStyle : ''}:${auditionText.slice(0, 40)}`;
      const cachedUrl = auditionCache.current.get(cacheKey);
      if (cachedUrl) {
        const audio = new Audio(cachedUrl);
        if (seq !== auditionSeq.current) return;
        auditionAudioRef.current = audio;
        audio.onended = () => setAuditioningId((cur) => (cur === voiceId ? null : cur));
        audio.onerror = () => setAuditioningId((cur) => (cur === voiceId ? null : cur));
        await audio.play();
        return;
      }

      const controller = new AbortController();
      auditionAbortRef.current = controller;
      const body = buildRequestBody() as Record<string, unknown>;
      delete body.speakers; // 试听只测单个音色，不带双人配置
      body.text = auditionText;
      body.voiceName = voiceId;

      let livePlayer: PcmStreamPlayer | null = null;
      let firstChunkAt = 0;
      const { chunks, sampleRate, mimeType } = await fetchStreamChunks(body, controller.signal, async (bytes, sr, _index, mime) => {
        if (seq !== auditionSeq.current) return;
        // 非 PCM 单包（Azure / 本地）不进实时播放器：字节不是 PCM，硬塞只会放出噪声
        if (!isRawPcmMime(mime)) return;
        if (!livePlayer) {
          livePlayer = new PcmStreamPlayer(sr);
          auditionPlayerRef.current = livePlayer;
          await livePlayer.resume();
          firstChunkAt = Date.now();
        }
        livePlayer.pushChunk(bytes);
      });
      if (seq !== auditionSeq.current) return;

      // 按 mime 拼装入缓存：下次复听直接播
      const auditionBlob = audioChunksToBlob(chunks, mimeType, sampleRate);
      const url = URL.createObjectURL(auditionBlob);
      if (auditionCache.current.size > 24) {
        const firstKey = auditionCache.current.keys().next().value;
        if (firstKey) {
          URL.revokeObjectURL(auditionCache.current.get(firstKey) as string);
          auditionCache.current.delete(firstKey);
        }
      }
      auditionCache.current.set(cacheKey, url);
      if (!livePlayer) {
        // 非 PCM 单包：没有实时流可播，直接播拼好的完整文件
        const audio = new Audio(url);
        if (seq !== auditionSeq.current) return;
        auditionAudioRef.current = audio;
        audio.onended = () => setAuditioningId((cur) => (cur === voiceId ? null : cur));
        audio.onerror = () => setAuditioningId((cur) => (cur === voiceId ? null : cur));
        await audio.play();
        return;
      }
      // PCM 直播已在播：按剩余时长自动清除试听态
      const totalSec = chunks.reduce((n, c) => n + c.length, 0) / 2 / sampleRate;
      const elapsedSec = firstChunkAt > 0 ? (Date.now() - firstChunkAt) / 1000 : 0;
      const remainMs = Math.max(0, totalSec - elapsedSec) * 1000 + 300;
      setTimeout(() => {
        if (seq === auditionSeq.current) {
          setAuditioningId((cur) => (cur === voiceId ? null : cur));
        }
      }, remainMs);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || '试听失败');
      }
      setAuditioningId((cur) => (cur === voiceId ? null : cur));
    } finally {
      if (seq === auditionSeq.current) {
        auditionAbortRef.current = null;
      }
    }
  }, [auditioningId, stopAudition, provider, speechStyle, buildRequestBody, fetchStreamChunks]);

  return {
    provider,
    setProvider,
    providers,
    refreshProviders: fetchProviders,
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
    clearError: () => setError(null),
    generateAudio,
    cancelGeneration,
    auditioningId,
    auditionVoice,
    stopAudition,
    isManagingVoice,
    designVoice,
    replicateVoice,
    fetchVoiceSample,
    deleteVoice,
  };
}
