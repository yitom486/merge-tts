import type { ModelInfo, TTSGenerateRequest, VoiceInfo } from '../types';
import type { TTSProvider } from './types';

export interface LocalTTSOptions {
  /** Trusted server-side endpoint. A request body may override it with a loopback URL. */
  endpoint?: string;
  apiKey?: string;
  model?: string;
  voices?: string[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class LocalTTSError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502, public readonly retryable = false) {
    super(message);
    this.name = 'LocalTTSError';
  }
}

/** Request-controlled URLs must stay on this machine. Hostname aliases and URL credentials are rejected. */
export function resolveLocalSpeechURL(raw: string, fromRequest = false): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new LocalTTSError('E_LOCAL_ENDPOINT', '本地 TTS endpoint 不是有效 URL。', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new LocalTTSError('E_LOCAL_ENDPOINT', '本地 TTS endpoint 只允许无凭据、无查询参数的 HTTP URL。', 400);
  }
  if (fromRequest && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw new LocalTTSError('E_LOCAL_ENDPOINT', '请求指定的本地 TTS endpoint 必须是 localhost 或回环地址。', 400);
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/audio/speech')) return url;
  if (path === '' || path === '/' || path.endsWith('/v1')) {
    url.pathname = `${path || ''}/audio/speech`.replace(/\/\//g, '/');
    return url;
  }
  throw new LocalTTSError('E_LOCAL_ENDPOINT', '本地 TTS endpoint 路径应为 /v1 或 /v1/audio/speech。', 400);
}

function resolveDiscoveryURL(speechURL: URL, suffix: string): URL {
  return new URL(speechURL.pathname.replace(/\/audio\/speech$/, suffix), speechURL.origin);
}

function safeMimeType(raw: string | null, format: string): string {
  const mime = raw?.split(';', 1)[0]?.trim().toLowerCase();
  if (!mime || mime === 'application/octet-stream') {
    return ({ mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', pcm: 'audio/pcm' } as Record<string, string>)[format] ?? 'audio/mpeg';
  }
  if (mime && ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/pcm', 'audio/L16'.toLowerCase()].includes(mime)) {
    return mime === 'audio/mp3' ? 'audio/mpeg' : mime;
  }
  throw new LocalTTSError('E_LOCAL_AUDIO', '本地 TTS 返回了不支持的音频类型。');
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1000, Math.min(ms, 120000)));
}

async function requestJSON(url: URL, apiKey: string, options: LocalTTSOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: timeoutSignal(options.timeoutMs ?? 30000),
    });
  } catch {
    throw new LocalTTSError('E_LOCAL_NETWORK', '无法连接本地 TTS 服务，请检查地址和服务状态。', 502, true);
  }
  if (!response.ok) throw new LocalTTSError('E_LOCAL_UPSTREAM', `本地 TTS 服务查询失败（HTTP ${response.status}）。`, 502, response.status >= 500);
  try { return await response.json(); } catch { throw new LocalTTSError('E_LOCAL_RESPONSE', '本地 TTS 服务返回了无效 JSON。'); }
}

function idsFromList(data: unknown, label: 'model' | 'voice'): string[] {
  if (!data || typeof data !== 'object') throw new LocalTTSError('E_LOCAL_RESPONSE', `本地 TTS ${label} 列表格式无效。`);
  const root = data as Record<string, unknown>;
  const items = Array.isArray(root.data) ? root.data : Array.isArray(root.voices) ? root.voices : null;
  if (!items) throw new LocalTTSError('E_LOCAL_RESPONSE', `本地 TTS ${label} 列表格式无效。`);
  return items.flatMap((item: unknown) => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return typeof record.id === 'string' ? [record.id] : typeof record.name === 'string' ? [record.name] : [];
  });
}

export function createLocalTTSProvider(options: LocalTTSOptions = {}): TTSProvider {
  const endpoint = options.endpoint ?? process.env.LOCAL_TTS_ENDPOINT;
  const configuredKey = options.apiKey ?? process.env.LOCAL_TTS_API_KEY ?? '';
  const configuredModel = options.model ?? process.env.LOCAL_TTS_MODEL ?? '';
  const configuredVoices = options.voices ?? (process.env.LOCAL_TTS_VOICES ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const getURL = () => {
    if (!endpoint) throw new LocalTTSError('E_LOCAL_CONFIG', '请先配置 LOCAL_TTS_ENDPOINT，或在合成请求中传入本机 endpoint。', 400);
    return resolveLocalSpeechURL(endpoint);
  };
  return {
    id: 'local',
    displayName: 'Local OpenAI-compatible TTS',
    requiresApiKey: false,
    resolveApiKey: header => header?.trim() || configuredKey,
    ...(configuredModel ? { defaultModel: configuredModel } : {}),
    async listModels(apiKey, endpointOverride) {
      const speechURL = endpointOverride ? resolveLocalSpeechURL(endpointOverride, true) : getURL();
      const data = await requestJSON(resolveDiscoveryURL(speechURL, '/models'), apiKey || configuredKey, options);
      const models: ModelInfo[] = idsFromList(data, 'model').map(id => ({ id, name: id, displayName: id, description: '本地 TTS 模型', isTtsRecommended: true, category: 'tts', provider: 'local' }));
      return { models, source: 'remote' };
    },
    async listVoices(apiKey, endpointOverride) {
      if (configuredVoices.length) return configuredVoices.map((id): VoiceInfo => ({ id, name: id, description: '已配置的本地音色', provider: 'local' }));
      const speechURL = endpointOverride ? resolveLocalSpeechURL(endpointOverride, true) : getURL();
      const data = await requestJSON(resolveDiscoveryURL(speechURL, '/audio/voices'), apiKey || configuredKey, options);
      return idsFromList(data, 'voice').map((id): VoiceInfo => ({ id, name: id, description: '本地 TTS 音色', provider: 'local' }));
    },
    async synthesize(params, apiKey, context) {
      const url = params.endpoint ? resolveLocalSpeechURL(params.endpoint, true) : getURL();
      const model = params.model?.trim() || configuredModel;
      if (!model) throw new LocalTTSError('E_LOCAL_MODEL', '请指定本地 TTS 模型 model，或配置 LOCAL_TTS_MODEL。', 400);
      const voice = params.voiceName?.trim();
      if (!voice) throw new LocalTTSError('E_LOCAL_VOICE', '请指定本地 TTS 音色 voiceName。', 400);
      const format = params.format ?? 'mp3';
      if (!['mp3', 'wav', 'ogg', 'pcm'].includes(format)) throw new LocalTTSError('E_LOCAL_FORMAT', '本地 TTS 音频格式不受支持。', 400);
      const speed = params.speed ?? 1;
      if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new LocalTTSError('E_LOCAL_SPEED', '语速 speed 必须在 0.25 到 4 之间。', 400);
      const key = params.apiKey?.trim() || apiKey || configuredKey;
      let response: Response;
      try {
        response = await (options.fetcher ?? fetch)(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({ model, voice, input: params.text, speed, response_format: format }),
          signal: context?.signal ? AbortSignal.any([context.signal, timeoutSignal(options.timeoutMs ?? 30000)]) : timeoutSignal(options.timeoutMs ?? 30000),
        });
      } catch {
        throw new LocalTTSError('E_LOCAL_NETWORK', '无法连接本地 TTS 服务，或请求已超时。', 502, true);
      }
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? 'E_LOCAL_AUTH' : 'E_LOCAL_UPSTREAM';
        throw new LocalTTSError(code, `本地 TTS 合成失败（HTTP ${response.status}）。请检查服务配置。`, response.status === 401 || response.status === 403 ? 401 : 502, response.status >= 500);
      }
      const mimeType = safeMimeType(response.headers.get('content-type'), format);
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (!audioBuffer.length) throw new LocalTTSError('E_LOCAL_AUDIO', '本地 TTS 未返回音频数据。');
      return { audioBuffer, mimeType };
    },
  };
}

export const localProvider = createLocalTTSProvider();
