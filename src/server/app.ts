import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getProvider, listProviders, registerProvider, resolveProviderApiKey } from './providers';
import { designVoice, replicateVoice, getVoiceDetail, deleteVoice } from './providers/gemini';
import { localProvider, createLocalTTSProvider, LocalTTSError } from './providers/local';
import type { TTSProvider } from './providers/types';
import type { TTSGenerateRequest } from './types';
import { synthesizeUnified, UnifiedSynthesisError } from './unified';
import type { UnifiedSynthesizeRequest } from './unified';
import { validateBatchCreateInput } from './batch';

// ---- 对外重导出：别的项目挂载后可直接扩展 ----
export { registerProvider, getProvider, listProviders };
export { geminiProvider } from './providers/gemini';
export { azureProvider } from './providers/azure';
export { localProvider, createLocalTTSProvider, LocalTTSError } from './providers/local';
export type { LocalTTSOptions } from './providers/local';
export type { TTSProvider } from './providers/types';
export type { TTSGenerateRequest, ModelInfo, VoiceInfo, ModelCategory, ModelTier } from './types';
export { synthesizeUnified, UnifiedSynthesisError } from './unified';
export { validateBatchCreateInput, normalizeBatchJob, extractBatchItemAudio, MAX_BATCH_ITEMS } from './batch';
export type {
  TTSBatchCreateInput, TTSBatchItemInput, NormalizedBatchCreateInput,
  TTSBatchItemResult, TTSBatchJobStatus,
} from './batch';
export type {
  UnifiedSynthesizeRequest, UnifiedSynthesizeSuccess, UnifiedSynthesizeFailure,
  UnifiedVoicePreference, UnifiedCredentials, ServiceErrorInfo,
} from './unified';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:3001',
];

const BASE_ALLOW_HEADERS = [
  'Content-Type',
  'x-gemini-api-key',
  // 通用多厂商 Key 头，新厂商直接用 x-{provider}-api-key 即可
  'x-provider-api-key',
  'x-openai-api-key',
  'x-azure-api-key',
  'x-azure-region',
  'x-tts-provider',
  'x-tts-region',
  'x-local-api-key',
  'x-alibaba-api-key',
  'x-volcengine-api-key',
  'x-minimax-api-key',
  'x-elevenlabs-api-key',
];

export interface TTSAppOptions {
  /** 路由前缀，默认 '/api'（挂载到别的项目时可改为 '/tts' 等） */
  prefix?: string;
  /** CORS 白名单，默认本地开发预设；传 false 关闭 CORS 中间件 */
  corsOrigins?: string[] | false;
  /** 追加允许的请求头（如自家 x-xxx-api-key） */
  extraAllowHeaders?: string[];
  /** 是否启用请求日志，默认 true */
  enableLogger?: boolean;
  /** 随应用一起注册的额外厂商（以后支持更多 TTS 时从这里插） */
  extraProviders?: TTSProvider[];
  /** 默认厂商（旧前端兼容），默认 'gemini' */
  defaultProvider?: string;
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) return '/api';
  let p = prefix.trim();
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+$/, '') || '/api';
}

/**
 * SDK/REST 错误常为多层嵌套 JSON，逐层拆到最内层可读 message，
 * 避免前端黄字里出现一坨转义 JSON。
 */
export function prettyApiError(raw: string): string {
  let current = raw || '';
  for (let i = 0; i < 4; i++) {
    const m = current.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) break;
    let inner: string;
    try {
      inner = JSON.parse(`"${m[1]}"`);
    } catch {
      break;
    }
    if (!inner || inner === current) break;
    if (/^\s*\{/.test(inner)) {
      current = inner;
      continue;
    }
    return inner;
  }
  return current.length > 500 ? `${current.slice(0, 500)}…` : current;
}

/** Validate untrusted JSON before it reaches a provider. */
export function parseGenerateRequest(value: unknown): TTSGenerateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalTTSError('E_TTS_INPUT', '请求体必须是 JSON 对象。', 400);
  const body = value as Record<string, unknown>;
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 20000) throw new LocalTTSError('E_TTS_TEXT', '朗读文本不能为空，且不能超过 20000 个字符。', 400);
  if (typeof body.voiceName !== 'string' || !body.voiceName.trim() || body.voiceName.length > 200) throw new LocalTTSError('E_TTS_VOICE', '请指定有效的音色 voiceName。', 400);
  for (const field of ['provider', 'model', 'endpoint', 'apiKey', 'format', 'region', 'languageCode', 'speechMetadata', 'style'] as const) {
    if (body[field] !== undefined && typeof body[field] !== 'string') throw new LocalTTSError('E_TTS_INPUT', `字段 ${field} 必须是字符串。`, 400);
  }
  if (body.speed !== undefined && (typeof body.speed !== 'number' || !Number.isFinite(body.speed) || body.speed < 0.25 || body.speed > 4)) {
    throw new LocalTTSError('E_TTS_SPEED', '语速 speed 必须在 0.25 到 4 之间。', 400);
  }
  if (body.pitch !== undefined && (typeof body.pitch !== 'number' || !Number.isFinite(body.pitch))) throw new LocalTTSError('E_TTS_INPUT', '字段 pitch 必须是数字。', 400);
  return body as unknown as TTSGenerateRequest;
}

function synthesisErrorResponse(error: unknown): Response {
  if (error instanceof LocalTTSError) {
    return Response.json({ error: error.message, code: error.code, retryable: error.retryable }, { status: error.status });
  }
  return Response.json({ error: '语音生成失败，请稍后重试或检查服务配置。', code: 'E_TTS_UPSTREAM', retryable: true }, { status: 502 });
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('pcm') || mimeType.includes('l16')) return 'pcm';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('aac')) return 'aac';
  return 'wav';
}

/**
 * 创建 TTS 通用服务（纯函数，无副作用，可被别的项目直接挂载）：
 * ```ts
 * import { createTTSApp } from 'gemini-tts-studio/server';
 * const app = createTTSApp({ prefix: '/tts', extraProviders: [myProvider] });
 * app.use('/ui/*', serveStatic({ root: './dist' })); // 宿主自行决定
 * export default { port: 3001, fetch: app.fetch };
 * ```
 */
export function createTTSApp(options: TTSAppOptions = {}): Hono {
  const base = normalizePrefix(options.prefix);
  const defaultProvider = (options.defaultProvider || 'gemini').toLowerCase();

  for (const p of options.extraProviders || []) {
    registerProvider(p);
  }

  const app = new Hono();

  // 中间件：日志与 CORS
  if (options.enableLogger !== false) {
    app.use('*', logger());
  }
  if (options.corsOrigins !== false) {
    app.use(`${base}/*`, cors({
      origin: options.corsOrigins || DEFAULT_CORS_ORIGINS,
      allowHeaders: [...BASE_ALLOW_HEADERS, ...(options.extraAllowHeaders || [])],
      exposeHeaders: ['Content-Type', 'Content-Disposition'],
    }));
  }

  /** 从 query / body / header 解析 provider，缺省 defaultProvider */
  function resolveProviderId(c: any, bodyProvider?: string): string {
    const q = c.req.query('provider') || c.req.query('providerId');
    return (bodyProvider || q || c.req.header('x-tts-provider') || defaultProvider).toLowerCase();
  }

  /** 按 provider 取 Key：优先 x-{provider}-api-key，兼容 x-provider-api-key 与 x-gemini-api-key */
  function resolveKeyForProvider(c: any, providerId: string, bodyKey?: string): string {
    if (bodyKey?.trim()) return bodyKey.trim();
    const specific = c.req.header(`x-${providerId}-api-key`);
    const generic = c.req.header('x-provider-api-key');
    const legacy = c.req.header('x-gemini-api-key');
    return resolveProviderApiKey(providerId, specific, generic, providerId === 'gemini' ? legacy : undefined);
  }

  /** 按 provider 取 region：优先 body/query/header，默认走环境变量（见各 provider） */
  function resolveRegionForProvider(c: any, bodyRegion?: string): string | undefined {
    return (
      bodyRegion ||
      c.req.query('region') ||
      c.req.header('x-azure-region') ||
      c.req.header('x-tts-region') ||
      undefined
    );
  }

  /** 要求 gemini 的守卫：Voices 设计/复刻/查删目前仅 Gemini 支持 */
  function requireGemini(c: any, providerId: string) {
    if (providerId !== 'gemini') {
      return c.json({ error: `该能力目前仅 gemini 支持（当前 provider=${providerId}）` }, 400);
    }
    return null;
  }

  /**
   * GET {base}/health
   * 健康检查与密钥状态探测（绝对不向客户端泄露 Key 内容）
   */
  app.get(`${base}/health`, (c) => {
    const providersStatus: Record<string, boolean> = {};
    for (const p of listProviders()) {
      try {
        providersStatus[p.id] = Boolean(getProvider(p.id).resolveApiKey?.(undefined));
      } catch {
        providersStatus[p.id] = false;
      }
    }
    return c.json({
      status: 'ok',
      hasServerKey: Boolean(providersStatus[defaultProvider]),
      providers: providersStatus,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET {base}/providers
   * 通用挂件用：列出已注册的 TTS 厂商
   */
  app.get(`${base}/providers`, (c) => {
    return c.json({ providers: listProviders() });
  });

  /**
   * GET {base}/models?provider=gemini&region=eastus
   * 动态拉取模型列表（坚决不硬编码，通过 Google 接口或动态元数据获取）
   */
  app.get(`${base}/models`, async (c) => {
    const providerId = resolveProviderId(c);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key，无法拉取模型列表。`, 401));
    }
    const region = providerId === 'local' ? c.req.query('endpoint') : resolveRegionForProvider(c);

    try {
      const result = await provider.listModels(apiKey, region);
      return c.json(result);
    } catch (error: unknown) {
      return synthesisErrorResponse(error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_DISCOVERY', '拉取模型列表失败，请检查服务配置。', 502, true));
    }
  });

  /** GET {base}/models/:id 拉取指定模型详情（原生 SDK models.get） */
  app.get(`${base}/models/:id`, async (c) => {
    const providerId = resolveProviderId(c);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }
    if (!provider.getModelDetail) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_UNSUPPORTED', `该厂商暂不支持模型详情（provider=${providerId}）。`, 400));
    }
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key，无法拉取模型详情。`, 401));
    }
    try {
      return c.json({ model: await provider.getModelDetail(apiKey, c.req.param('id')) });
    } catch (error: unknown) {
      return synthesisErrorResponse(error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_DISCOVERY', '拉取模型详情失败，请检查服务配置。', 502, true));
    }
  });

  /**
   * GET {base}/voices?provider=gemini&region=eastus
   * 动态拉取可用声音列表
   */
  app.get(`${base}/voices`, async (c) => {
    const providerId = resolveProviderId(c);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key，无法拉取声音列表。`, 401));
    }
    const region = providerId === 'local' ? c.req.query('endpoint') : resolveRegionForProvider(c);

    try {
      const voices = await provider.listVoices(apiKey, region);
      return c.json({ voices });
    } catch (error: unknown) {
      return synthesisErrorResponse(error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_DISCOVERY', '获取声音列表失败，请检查服务配置。', 502, true));
    }
  });

  /**
   * POST {base}/voices/design
   * 自然语言设计音色：{ input, displayName?, gender?, languageCode?, regionCode?, model? }
   * 返回 { id, displayName, sampleAudio: { data, mimeType } }，sampleAudio 可直接试听
   */
  app.post(`${base}/voices/design`, async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '无效的 JSON 请求体' }, 400);
    }
    const providerId = resolveProviderId(c, body.provider);
    const denied = requireGemini(c, providerId);
    if (denied) return denied;
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey) return c.json({ error: '缺少 Gemini API Key' }, 401);

    try {
      const result = await designVoice(apiKey, {
        input: body.input || body.prompt || '',
        displayName: body.displayName,
        gender: body.gender,
        languageCode: body.languageCode || body.region,
        regionCode: body.regionCode,
        model: body.model,
      });
      return c.json({
        id: result.id,
        key: result.key,
        displayName: result.displayName,
        sampleAudio: result.sampleAudioBase64
          ? { data: result.sampleAudioBase64, mimeType: result.sampleMime }
          : null,
      });
    } catch (error: any) {
      return c.json({ error: error?.message || '设计音色失败' }, 500);
    }
  });

  /**
   * POST {base}/voices/replicate
   * 声音复刻：{ displayName?, model?, store?, sourceAudio, sourceMime?, consentAudio, consentMime? }
   * 音频为 base64（建议 24kHz 单声道 16-bit WAV；source 10–30s + 同一人授权声明朗读）
   */
  app.post(`${base}/voices/replicate`, async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '无效的 JSON 请求体' }, 400);
    }
    const providerId = resolveProviderId(c, body.provider);
    const denied = requireGemini(c, providerId);
    if (denied) return denied;
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey) return c.json({ error: '缺少 Gemini API Key' }, 401);

    try {
      const result = await replicateVoice(apiKey, {
        displayName: body.displayName,
        model: body.model,
        store: body.store,
        sourceAudioBase64: body.sourceAudio || body.source_audio,
        sourceMime: body.sourceMime || body.source_mime,
        consentAudioBase64: body.consentAudio || body.consent_audio,
        consentMime: body.consentMime || body.consent_mime,
      });
      return c.json({ id: result.id, key: result.key, displayName: result.displayName });
    } catch (error: any) {
      return c.json({ error: error?.message || '复刻音色失败' }, 500);
    }
  });

  /** GET {base}/voices/:id 自定义音色详情（含 prompted 试听 sample_audio） */
  app.get(`${base}/voices/:id`, async (c) => {
    const providerId = resolveProviderId(c);
    const denied = requireGemini(c, providerId);
    if (denied) return denied;
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey) return c.json({ error: '缺少 Gemini API Key' }, 401);

    try {
      const detail = await getVoiceDetail(apiKey, c.req.param('id'));
      const v = (detail as any)?.voice || detail;
      const sample = v.sample_audio || v.sampleAudio || {};
      return c.json({
        id: v.id,
        displayName: v.display_name || v.displayName,
        type: v.type,
        sampleAudio: sample.data ? { data: sample.data, mimeType: sample.mime_type || sample.mimeType } : null,
        raw: detail,
      });
    } catch (error: any) {
      return c.json({ error: error?.message || '获取音色详情失败' }, 500);
    }
  });

  /** DELETE {base}/voices/:id 删除自定义音色 */
  app.delete(`${base}/voices/:id`, async (c) => {
    const providerId = resolveProviderId(c);
    const denied = requireGemini(c, providerId);
    if (denied) return denied;
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey) return c.json({ error: '缺少 Gemini API Key' }, 401);

    try {
      return c.json(await deleteVoice(apiKey, c.req.param('id')));
    } catch (error: any) {
      return c.json({ error: error?.message || '删除音色失败' }, 500);
    }
  });

  /**
   * POST {base}/tts/generate
   * 核心语音生成接口：返回纯二进制音频流
   * 通用参数：{ provider='gemini', text, voiceName, model, speed, pitch, format, ... }
   */
  app.post(`${base}/tts/generate`, async (c) => {
    let body: TTSGenerateRequest;
    try {
      body = parseGenerateRequest(await c.req.json());
    } catch (error) {
      return synthesisErrorResponse(error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_INPUT', '无效的 JSON 请求体。', 400));
    }

    const providerId = resolveProviderId(c, body.provider);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }

    const apiKey = resolveKeyForProvider(c, providerId, body.apiKey);

    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key。请在请求头、请求体或服务端环境变量中配置。`, 401));
    }

    if (!body.text || body.text.trim().length === 0) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_TEXT', '朗读文本不能为空。', 400));
    }
    if (!body.voiceName || body.voiceName.trim().length === 0) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_VOICE', '未指定音色 voiceName。', 400));
    }
    if (providerId === 'gemini' && (!body.model || body.model.trim().length === 0)) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_MODEL', '未指定模型 model。', 400));
    }

    try {
      const { audioBuffer, mimeType } = await provider.synthesize(
        { ...body, provider: providerId, region: body.region || resolveRegionForProvider(c) },
        apiKey,
        { signal: c.req.raw.signal }
      );

      // 直接输出二进制音频流（HTTP 边界转为标准 Uint8Array，消除 Buffer 池化偏移与类型摩擦）
      const audioBytes = new Uint8Array(audioBuffer.byteLength);
      audioBytes.set(audioBuffer);
      return new Response(new Blob([audioBytes], { type: mimeType }), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${providerId}-speech.${audioExtension(mimeType)}"`,
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error: unknown) {
      return synthesisErrorResponse(error);
    }
  });

  /**
   * POST {base}/tts/stream (SSE)
   * 流式语音生成：边生成边下发 base64 PCM 分片，前端可实时播放。
   * 事件：data: {"audio":"...","mimeType":"..."} … 最后 data: {"done":true,"mimeType":"..."}
   * 无 synthesizeStream 的厂商自动降级为一次性合成后单包下发。
   */
  app.post(`${base}/tts/stream`, async (c) => {
    let body: TTSGenerateRequest;
    try {
      body = parseGenerateRequest(await c.req.json());
    } catch (error) {
      return synthesisErrorResponse(error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_INPUT', '无效的 JSON 请求体。', 400));
    }

    const providerId = resolveProviderId(c, body.provider);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }

    const apiKey = resolveKeyForProvider(c, providerId, body.apiKey);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key。请在请求头、请求体或服务端环境变量中配置。`, 401));
    }

    if (!body.text || body.text.trim().length === 0) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_TEXT', '朗读文本不能为空。', 400));
    }
    if (!body.voiceName || body.voiceName.trim().length === 0) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_VOICE', '未指定音色 voiceName。', 400));
    }
    if (providerId === 'gemini' && (!body.model || body.model.trim().length === 0)) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_MODEL', '未指定模型 model。', 400));
    }

    const params = { ...body, provider: providerId, region: body.region || resolveRegionForProvider(c) };
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };
        try {
          if (provider.synthesizeStream) {
            const { mimeType } = await provider.synthesizeStream(params, apiKey, async (chunk) => {
              send({ audio: chunk.audioBase64, mimeType: chunk.mimeType });
            }, { signal: c.req.raw.signal });
            send({ done: true, mimeType });
          } else {
            // 降级：一次性合成后单包下发，前端同一套解析
            const { audioBuffer, mimeType } = await provider.synthesize(params, apiKey, { signal: c.req.raw.signal });
            send({ audio: audioBuffer.toString('base64'), mimeType });
            send({ done: true, mimeType });
          }
        } catch (error: unknown) {
          const safe = error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_UPSTREAM', '流式生成音频失败，请检查服务配置。', 502, true);
          send({ error: safe.message, code: safe.code, retryable: safe.retryable });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  /**
   * POST {base}/tts/unified
   * 统一合成（给嵌入调用方如 Lingua Studio）：
   * 输入文本/语种/用途/语音偏好/首选服务/凭证，包内解析模型与音色并合成。
   * 成功一律 200 JSON（含 usedFallback）；双失败 500 JSON（含两次原因）；缺参 400。
   * 失败规则：首选失败只兜底到本地 TTS，绝不兜底到浏览器语音或另一个云服务。
   */
  app.post(`${base}/tts/unified`, async (c) => {
    let body: UnifiedSynthesizeRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({
        ok: false,
        preferredError: { provider: 'unknown', message: '无效的 JSON 请求体' },
        fallbackError: null,
      }, 400);
    }
    try {
      const result = await synthesizeUnified(body, {
        headers: {
          'x-gemini-api-key': c.req.header('x-gemini-api-key'),
          'x-azure-api-key': c.req.header('x-azure-api-key'),
          'x-azure-region': c.req.header('x-azure-region'),
          'x-local-api-key': c.req.header('x-local-api-key'),
        },
        signal: c.req.raw.signal,
      });
      return c.json(result);
    } catch (error: unknown) {
      if (error instanceof UnifiedSynthesisError) {
        return c.json(error.failure, error.status);
      }
      return c.json({
        ok: false,
        preferredError: { provider: 'unknown', message: '统一合成失败，请检查服务配置' },
        fallbackError: null,
      }, 500);
    }
  });

  /**
   * POST {base}/tts/batch-jobs
   * 官方异步 Batch（仅 gemini）：{ provider='gemini', model, voiceName?, speechMetadata?,
   * languageCode?, displayName?, items: [{ text, voiceName?, speechMetadata?, languageCode?, key? }] }
   * 缺参 400 / 缺 Key 401 / 非 gemini 400；返回 { name, state, model?, displayName? }，调用方轮询 GET。
   */
  app.post(`${base}/tts/batch-jobs`, async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: '无效的 JSON 请求体' }, 400);
    }
    const providerId = resolveProviderId(c, (raw as any)?.provider);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }
    if (!provider.createBatchJob) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_UNSUPPORTED', `该厂商暂不支持官方异步批量（provider=${providerId}）。`, 400));
    }
    const apiKey = resolveKeyForProvider(c, providerId, (raw as any)?.apiKey);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key。`, 401));
    }
    let input;
    try {
      input = validateBatchCreateInput(raw);
    } catch (error) {
      return synthesisErrorResponse(error instanceof LocalTTSError ? error : new LocalTTSError('E_TTS_INPUT', '无效的批量请求体。', 400));
    }
    try {
      return c.json(await provider.createBatchJob(apiKey, input));
    } catch (error: any) {
      return c.json({ error: error?.message || '创建批量任务失败' }, 500);
    }
  });

  /**
   * GET {base}/tts/batch-jobs?name=batches/xxx
   * 轮询批量任务：name 含斜杠，走 query 传参。成功且完成时带 results（逐项 ok/audioBase64/mimeType/error）。
   */
  app.get(`${base}/tts/batch-jobs`, async (c) => {
    const providerId = resolveProviderId(c);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }
    if (!provider.getBatchJob) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_UNSUPPORTED', `该厂商暂不支持官方异步批量（provider=${providerId}）。`, 400));
    }
    const name = (c.req.query('name') || '').trim();
    if (!name) return c.json({ error: '缺少批量任务 name（query ?name=batches/xxx）。' }, 400);
    const apiKey = resolveKeyForProvider(c, providerId);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key。`, 401));
    }
    try {
      return c.json(await provider.getBatchJob(apiKey, name));
    } catch (error: any) {
      return c.json({ error: error?.message || '查询批量任务失败' }, 500);
    }
  });

  /**
   * POST {base}/tts/batch-jobs/cancel
   * body { name }：取消未完成的批量任务。
   */
  app.post(`${base}/tts/batch-jobs/cancel`, async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '无效的 JSON 请求体' }, 400);
    }
    const providerId = resolveProviderId(c, body.provider);
    let provider;
    try {
      provider = getProvider(providerId);
    } catch {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_PROVIDER', '未知 TTS provider。', 400));
    }
    if (!provider.cancelBatchJob) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_UNSUPPORTED', `该厂商暂不支持官方异步批量（provider=${providerId}）。`, 400));
    }
    const name = String(body?.name || '').trim();
    if (!name) return c.json({ error: '缺少批量任务 name。' }, 400);
    const apiKey = resolveKeyForProvider(c, providerId, body.apiKey);
    if (!apiKey && provider.requiresApiKey !== false) {
      return synthesisErrorResponse(new LocalTTSError('E_TTS_AUTH', `缺少 ${provider.displayName} API Key。`, 401));
    }
    try {
      return c.json(await provider.cancelBatchJob(apiKey, name));
    } catch (error: any) {
      return c.json({ error: error?.message || '取消批量任务失败' }, 500);
    }
  });

  return app;
}
