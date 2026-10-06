import type { TTSGenerateRequest, VoiceInfo } from './types';
import type { TTSProvider } from './providers/types';
import { getProvider as registryGetProvider } from './providers';

/**
 * 统一合成接口（给 Lingua Studio 这类嵌入调用方）：
 * 调用方只描述“读什么、什么语言、什么用途、想要什么声音、首选哪个服务、凭证在哪”，
 * 模型发现、音色解析与选择、超时取消全部由包负责。
 * 调用方永远不需要填写厂商专属的默认模型或默认音色。
 */

export interface UnifiedVoicePreference {
  /** 直接指定音色 ID（优先于一切筛选） */
  voiceId?: string;
  gender?: 'female' | 'male' | 'neutral';
  /** 按 tone/描述子串匹配（如 'Warm'），最佳努力 */
  tone?: string;
}

export interface UnifiedCredentials {
  geminiApiKey?: string;
  azureKey?: string;
  azureRegion?: string;
  localBaseUrl?: string;
  localApiKey?: string;
}

export interface UnifiedSynthesizeRequest {
  text: string;
  language?: string;
  /** 朗读用途（如 narration / dialogue / announcement），Gemini 下透传为风格指令 */
  purpose?: string;
  voicePreference?: UnifiedVoicePreference;
  /** 双人/多角色对话发音人配置（2人及以上走 multiSpeakerVoiceConfig） */
  speakers?: Array<{ speaker: string; voiceName?: string; voiceId?: string; gender?: 'female' | 'male' | 'neutral' }>;
  /** 首选服务，缺省 'gemini'；失败时只允许兜底到本地 TTS */
  preferredService?: string;
  /** 可选覆盖；缺省由包内解析（Gemini 取版本最高 TTS 模型，本地取发现首个模型） */
  model?: string;
  format?: 'wav' | 'mp3';
  timeoutMs?: number;
  credentials?: UnifiedCredentials;
}

export interface ServiceErrorInfo {
  provider: string;
  message: string;
}

export interface UnifiedSynthesizeSuccess {
  ok: true;
  audioBase64: string;
  mimeType: string;
  provider: string;
  voice: string;
  model?: string;
  language?: string;
  usedFallback: boolean;
  /** usedFallback 为 true 时必带：首选服务的安全错误信息 */
  preferredError?: ServiceErrorInfo;
  warnings?: string[];
}

export interface UnifiedSynthesizeFailure {
  ok: false;
  preferredError: ServiceErrorInfo;
  /** 首选即本地或无需兜底时为 null */
  fallbackError: ServiceErrorInfo | null;
}

/** 结构化失败： HTTP 层据此返回 400（调用方问题）或 500（合成失败） */
export class UnifiedSynthesisError extends Error {
  readonly failure: UnifiedSynthesizeFailure;
  readonly status: 400 | 500;
  constructor(failure: UnifiedSynthesizeFailure, status: 400 | 500 = 500) {
    super(failure.preferredError.message + (failure.fallbackError ? `；本地兜底亦失败：${failure.fallbackError.message}` : ''));
    this.name = 'UnifiedSynthesisError';
    this.failure = failure;
    this.status = status;
  }
}

export interface UnifiedDeps {
  /** 默认用全局注册表；测试可注入独立厂商表（不污染全局） */
  providers?: TTSProvider[];
}

export interface UnifiedCallOptions {
  /** 请求头（x-{provider}-api-key 等，优先级高于 body credentials） */
  headers?: Record<string, string | undefined>;
  /** 调用方取消信号；与超时信号合并 */
  signal?: AbortSignal;
  deps?: UnifiedDeps;
}

const DEFAULT_TIMEOUT_MS = 120000;

function scrubSecrets(message: string): string {
  return (message || '')
    .replace(/AIza[0-9A-Za-z_-]{30,}/g, 'AIza***')
    .replace(/([?&]key=)[^&\s]+/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***');
}

function normalizeLanguage(language?: string): string {
  return (language || '').trim().toLowerCase();
}

/** 带 locale 标记的音色必须匹配请求语言；无标记音色视为全语言通用 */
function languageMatches(voice: VoiceInfo, language: string): boolean {
  if (!language) return true;
  const hay = `${voice.id} ${voice.name}`.toLowerCase();
  const primary = language.split('-')[0];
  if (hay.includes(language)) return true;
  if (primary && hay.includes(primary)) return true;
  return /^[a-z]{2,3}-[a-z]{2}/i.test(voice.id) || /^[a-z]{2,3}-[a-z]{2}/i.test(voice.name)
    ? false
    : true;
}

export async function synthesizeUnified(
  input: UnifiedSynthesizeRequest,
  opts: UnifiedCallOptions = {}
): Promise<UnifiedSynthesizeSuccess> {
  const text = (input.text || '').trim();
  if (!text) {
    throw new UnifiedSynthesisError({
      ok: false,
      preferredError: { provider: input.preferredService || 'gemini', message: '朗读文本不能为空' },
      fallbackError: null,
    }, 400);
  }

  const findProvider = (id: string): TTSProvider => {
    if (opts.deps?.providers) {
      const found = opts.deps.providers.find(p => p.id === (id || '').toLowerCase());
      if (!found) {
        throw new UnifiedSynthesisError({
          ok: false,
          preferredError: { provider: id, message: `未知 TTS Provider: ${id}` },
          fallbackError: null,
        }, 400);
      }
      return found;
    }
    try {
      return registryGetProvider(id);
    } catch (err: any) {
      throw new UnifiedSynthesisError({
        ok: false,
        preferredError: { provider: id, message: err?.message || `未知 TTS Provider: ${id}` },
        fallbackError: null,
      }, 400);
    }
  };

  const preferredId = (input.preferredService || 'gemini').toLowerCase();
  const preferred = findProvider(preferredId);
  const headers = opts.headers || {};
  const creds = input.credentials || {};
  const warnings: string[] = [];

  const keyFor = (providerId: string, provider: TTSProvider): string => {
    const headerKey = headers[`x-${providerId}-api-key`];
    if (headerKey && headerKey.trim()) return headerKey.trim();
    if (providerId === 'gemini' && creds.geminiApiKey?.trim()) return creds.geminiApiKey.trim();
    if (providerId === 'azure' && creds.azureKey?.trim()) return creds.azureKey.trim();
    if (providerId === 'local' && creds.localApiKey?.trim()) return creds.localApiKey.trim();
    return provider.resolveApiKey?.(undefined) || '';
  };

  const timeoutMs = Math.min(600000, Math.max(1000, input.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => {
    timeoutCtrl.abort(new Error(`合成超时（>${timeoutMs}ms），已取消等待`));
  }, timeoutMs);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;
  const throwIfAborted = () => {
    if (opts.signal?.aborted) throw new Error('调用方已取消合成');
    if (timeoutCtrl.signal.aborted) throw new Error(`合成超时（>${timeoutMs}ms），已取消等待`);
  };

  const resolveEndpoint = (): string | undefined => {
    const fromCreds = creds.localBaseUrl?.trim();
    if (fromCreds) return fromCreds;
    return undefined;
  };

  const attempt = async (provider: TTSProvider, providerId: string): Promise<UnifiedSynthesizeSuccess> => {
    throwIfAborted();
    const key = keyFor(providerId, provider);
    if (provider.requiresApiKey !== false && !key) {
      throw new Error(`缺少 ${provider.displayName} API Key（请求头 x-${providerId}-api-key、credentials 或服务端环境变量均未提供）`);
    }

    // —— 模型解析（调用方无需填写厂商默认值；无模型概念的厂商返回空列表即跳过）——
    let model = input.model?.trim();
    if (!model && providerId !== 'azure') {
      const { models } = await provider.listModels(
        key,
        providerId === 'local' ? resolveEndpoint() : undefined
      );
      const top = models.find(m => m.category === 'tts') || models[0];
      if (!top) {
        throw new Error(providerId === 'local'
          ? '本地未发现可用模型，请先确认本地 TTS 服务'
          : '无可用 TTS 模型');
      }
      model = top.id;
    }

    // —— 音色解析与选择 ——
    const pref = input.voicePreference || {};
    let voice = pref.voiceId?.trim();
    if (!voice) {
      const voices = providerId === 'local'
        ? await provider.listVoices(key, resolveEndpoint())
        : await provider.listVoices(
            key,
            providerId === 'azure' ? (headers['x-azure-region'] || creds.azureRegion) : undefined
          );
      if (voices.length === 0) throw new Error('远端未返回任何可用音色');
      const language = normalizeLanguage(input.language);
      let pool = voices.filter(v => languageMatches(v, language));
      if (pool.length === 0) {
        throw new Error(`请求语言 ${input.language} 下无可用音色`);
      }
      if (pref.gender) {
        const matched = pool.filter(v => !v.gender || v.gender === pref.gender);
        if (matched.length === 0) {
          warnings.push(`无${pref.gender}音色，已选用现有音色`);
        } else {
          pool = matched;
        }
      }
      if (pref.tone) {
        const needle = pref.tone.toLowerCase();
        const matched = pool.filter(v => (v.tone || '').toLowerCase().includes(needle));
        if (matched.length === 0) {
          warnings.push(`无匹配语气“${pref.tone}”的音色，已选用现有音色`);
        } else {
          pool = matched;
        }
      }
      voice = pool[0].id;
    }

    const resolvedSpeakers: Array<{ speaker: string; voiceName: string }> = [];
    if (Array.isArray(input.speakers) && input.speakers.length >= 2) {
      for (let i = 0; i < input.speakers.length; i++) {
        const s = input.speakers[i];
        const sVoice = (s.voiceName || s.voiceId || '').trim() || voice;
        resolvedSpeakers.push({
          speaker: s.speaker || `Speaker ${i + 1}`,
          voiceName: sVoice,
        });
      }
    }

    const params: TTSGenerateRequest = {
      provider: providerId,
      text,
      voiceName: voice,
      ...(resolvedSpeakers.length >= 2 ? { speakers: resolvedSpeakers } : {}),
      ...(model ? { model } : {}),
      ...(providerId === 'gemini' && input.purpose ? { speechMetadata: input.purpose } : {}),
      ...(providerId === 'gemini' && input.language ? { languageCode: input.language } : {}),
      ...(providerId === 'azure' ? { region: headers['x-azure-region'] || creds.azureRegion } : {}),
      ...(providerId === 'local' && resolveEndpoint() ? { endpoint: resolveEndpoint() } : {}),
      ...(providerId === 'local' && creds.localApiKey?.trim() ? { apiKey: creds.localApiKey.trim() } : {}),
      ...(input.format ? { format: input.format } : {}),
    };
    if (providerId !== 'gemini' && input.purpose) {
      warnings.push('朗读用途（purpose）仅 Gemini 生效，当前服务将忽略');
    }

    const { audioBuffer, mimeType } = await provider.synthesize(params, key, { signal });
    return {
      ok: true,
      audioBase64: audioBuffer.toString('base64'),
      mimeType,
      provider: providerId,
      voice,
      ...(model ? { model } : {}),
      ...(input.language ? { language: input.language } : {}),
      usedFallback: false,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  };

  const toSafeError = (providerId: string, err: any): ServiceErrorInfo => ({
    provider: providerId,
    message: scrubSecrets(err?.message || String(err)),
  });

  try {
    const direct = await attempt(preferred, preferredId);
    return direct;
  } catch (preferredErr: any) {
    if (preferredErr instanceof UnifiedSynthesisError) throw preferredErr;
    const preferredError = toSafeError(preferredId, preferredErr);
    // 失败规则：只允许兜底到本地 TTS，绝不兜底到浏览器语音或另一个云服务
    if (preferredId === 'local') {
      throw new UnifiedSynthesisError({ ok: false, preferredError, fallbackError: null }, 500);
    }
    try {
      const local = findProvider('local');
      const rescued = await attempt(local, 'local');
      return { ...rescued, usedFallback: true, preferredError };
    } catch (fallbackErr: any) {
      if (fallbackErr instanceof UnifiedSynthesisError) throw fallbackErr;
      throw new UnifiedSynthesisError({
        ok: false,
        preferredError,
        fallbackError: toSafeError('local', fallbackErr),
      }, 500);
    }
  } finally {
    clearTimeout(timer);
  }
}
