import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { ModelInfo, TTSGenerateRequest, VoiceInfo } from '../types';
import type { SpeechBoundary, TTSProvider } from './types';
import { LocalTTSError } from './local';

export function resolveAzureApiKey(headerKey?: string): string {
  if (headerKey && headerKey.trim() !== '') return headerKey.trim();
  return (
    (process.env.AZURE_SPEECH_KEY || '') ||
    (process.env.AZURE_SUBSCRIPTION_KEY || '')
  ).trim();
}

/** region 只认三处：请求参数 > 环境变量，都没有就抛错（不再默认 eastus） */
export function resolveAzureRegion(explicit?: string): string {
  const raw = (explicit && explicit.trim()) || (process.env.AZURE_SPEECH_REGION || '').trim();
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!cleaned) {
    throw new Error('未指定 Azure region。请在请求 region 参数或服务端 AZURE_SPEECH_REGION 中配置（须与 Key 同区）。');
  }
  return cleaned;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function localeFromVoice(voiceName: string, languageCode?: string): string {
  const m = voiceName.match(/^([a-z]{2,3}-[A-Z]{2})/);
  if (m && m[1]) return m[1];
  if (languageCode && languageCode.trim()) return languageCode.trim();
  throw new Error(`无法从音色名解析语言 locale：${voiceName}`);
}

function genderFromAzure(g?: string): VoiceInfo['gender'] {
  if (g === 'Female') return 'female';
  if (g === 'Male') return 'male';
  return 'neutral';
}

/** 通用 speed(1.0=正常) 转 SSML 百分比，如 1.2 -> +20% */
function toPercent(v?: number): string | null {
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  const clamped = Math.min(2, Math.max(0.5, v));
  const pct = Math.round((clamped - 1) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export function buildAzureSSML(text: string, voiceName: string, opts?: { speed?: number; pitch?: number; languageCode?: string; style?: string }): string {
  const locale = localeFromVoice(voiceName, opts?.languageCode);
  const rate = toPercent(opts?.speed);
  const pitch = toPercent(opts?.pitch);
  const safeText = escapeXml(text);
  const inner = rate || pitch
    ? `<prosody${rate ? ` rate="${rate}"` : ''}${pitch ? ` pitch="${pitch}"` : ''}>${safeText}</prosody>`
    : safeText;
  const styled = opts?.style ? `<mstts:express-as style="${escapeXml(opts.style)}">${inner}</mstts:express-as>` : inner;
  return `<speak version="1.0" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${locale}"><voice xml:lang="${locale}" name="${escapeXml(voiceName)}">${styled}</voice></speak>`;
}

function outputFormatFor(format?: string): {
  header: string;
  mimeType: string;
  ext: string;
  sdkFormat: sdk.SpeechSynthesisOutputFormat;
} {
  if (format === 'mp3') {
    return {
      header: 'audio-24khz-48kbitrate-mono-mp3',
      mimeType: 'audio/mpeg',
      ext: 'mp3',
      sdkFormat: sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3,
    };
  }
  if (format === 'pcm') {
    return {
      header: 'raw-24khz-16bit-mono-pcm',
      mimeType: 'audio/pcm',
      ext: 'pcm',
      sdkFormat: sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm,
    };
  }
  if (format === 'ogg') {
    return {
      header: 'ogg-24khz-16bit-mono-opus',
      mimeType: 'audio/ogg',
      ext: 'ogg',
      sdkFormat: sdk.SpeechSynthesisOutputFormat.Ogg24Khz16BitMonoOpus,
    };
  }
  return {
    header: 'riff-24khz-16bit-mono-pcm',
    mimeType: 'audio/wav',
    ext: 'wav',
    sdkFormat: sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm,
  };
}

/** Azure 没有“模型”概念：合成只认音色，返回空列表，前端展示“无需选择模型” */
export async function listAzureModels(): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }> {
  return { models: [], source: 'remote' };
}

interface AzureVoiceItem {
  Name?: string;
  DisplayName?: string;
  LocalName?: string;
  ShortName?: string;
  Gender?: string;
  Locale?: string;
  LocaleName?: string;
  VoiceType?: string;
  Status?: string;
  StyleList?: string[];
}

export async function listAzureVoices(apiKey?: string, region?: string, context?: { signal?: AbortSignal }): Promise<VoiceInfo[]> {
  const key = apiKey || resolveAzureApiKey();
  if (!key) {
    throw new Error('缺少 Azure Speech Key，无法拉取声音列表。请在前端设置中填入或在服务端配置 AZURE_SPEECH_KEY。');
  }
  const reg = resolveAzureRegion(region);

  let res: Response;
  try {
    res = await fetch(`https://${reg}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
      signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    });
  } catch (err: any) {
    throw new Error(`拉取 Azure 声音列表网络失败：${err?.message || err}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`拉取 Azure 声音列表失败 (${res.status} · region=${reg})：${txt.slice(0, 200)}。请检查 Key 与 region 是否匹配。`);
  }
  const data = (await res.json()) as AzureVoiceItem[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Azure 未返回任何可用音色');
  }

  const mapped: VoiceInfo[] = data
    .filter(v => v.ShortName)
    .map(v => ({
      id: v.ShortName as string,
      name: v.ShortName as string,
      description: `${v.DisplayName || v.LocalName || v.ShortName} (${v.Locale || ''}${v.VoiceType ? ` · ${v.VoiceType}` : ''})`,
      gender: genderFromAzure(v.Gender),
      tone: v.VoiceType,
      provider: 'azure',
      ...(v.Locale ? { locale: v.Locale } : {}),
      ...(Array.isArray(v.StyleList) ? { styles: v.StyleList } : {}),
    }));

  if (mapped.length === 0) {
    throw new Error('Azure 未返回任何可用音色');
  }
  return mapped;
}

/** 去掉 Gemini 风格的行内表演标签（Azure 会照字念出 [laughs]，必须预处理） */
export function stripPerformanceTags(text: string): string {
  return text
    .replace(/\[[^\][\n]{1,30}\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 官方 SDK 合成：建立 WebSocket 实时流式连接，同时捕获 SentenceBoundary 与 WordBoundary 时间轴
 */
export async function synthesizeAzureViaSdk(
  params: TTSGenerateRequest,
  apiKey: string,
  explicitRegion?: string,
  context?: { signal?: AbortSignal }
): Promise<{ audioBuffer: Buffer; mimeType: string; boundaries: SpeechBoundary[] }> {
  const key = apiKey || resolveAzureApiKey();
  if (!key) {
    throw new Error('未检测到 Azure Speech Key。请在前端设置中填入或在服务端配置 AZURE_SPEECH_KEY。');
  }
  const region = resolveAzureRegion(params.region || explicitRegion);
  const voiceName = (params.voiceName || '').trim();
  if (!voiceName) {
    throw new Error('未指定音色 voiceName（如 zh-CN-XiaoxiaoNeural）');
  }
  const { mimeType, sdkFormat } = outputFormatFor(params.format);

  const style = params.style?.trim();
  if (style) {
    const voices = await listAzureVoices(key, region, context);
    const selected = voices.find(v => v.id === voiceName);
    if (!selected) throw new LocalTTSError('E_AZURE_VOICE', '所选 Azure 音色不在当前区域的声音列表中。', 400);
    if (!selected.styles?.includes(style)) throw new LocalTTSError('E_AZURE_STYLE', `音色 ${voiceName} 不支持风格 ${style}。`, 400);
  }

  const ssml = buildAzureSSML(stripPerformanceTags(params.text), voiceName, {
    speed: params.speed,
    pitch: params.pitch,
    languageCode: params.languageCode,
    style,
  });

  return new Promise((resolve, reject) => {
    let completed = false;
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechSynthesisOutputFormat = sdkFormat;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    const boundaries: SpeechBoundary[] = [];

    synthesizer.wordBoundary = (_sender, e) => {
      const audioOffsetMs = Math.round((e.audioOffset || 0) / 10000);
      const durationMs = e.duration ? Math.round(e.duration / 10000) : 0;
      boundaries.push({
        text: e.text,
        audioOffsetMs,
        durationMs,
        textOffset: e.textOffset,
        wordLength: e.wordLength,
        boundaryType: e.boundaryType === sdk.SpeechSynthesisBoundaryType.Sentence ? 'SentenceBoundary' : 'WordBoundary',
      });
    };

    const cleanup = () => {
      if (!completed) {
        completed = true;
        try {
          synthesizer.close();
        } catch {}
      }
    };

    const abortHandler = () => {
      cleanup();
      reject(new Error('Azure 合成已取消'));
    };

    if (context?.signal) {
      if (context.signal.aborted) {
        cleanup();
        reject(new Error('Azure 合成已取消'));
        return;
      }
      context.signal.addEventListener('abort', abortHandler, { once: true });
    }

    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        if (context?.signal) {
          context.signal.removeEventListener('abort', abortHandler);
        }
        try {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioBuffer = Buffer.from(result.audioData);
            cleanup();
            if (!audioBuffer || audioBuffer.byteLength === 0) {
              reject(new Error('Azure API 未返回有效音频数据'));
              return;
            }
            resolve({ audioBuffer, mimeType, boundaries });
          } else {
            const errDetails = result.errorDetails || `Azure SDK 合成未完成 (reason=${result.reason})`;
            cleanup();
            reject(new Error(errDetails));
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      },
      (err) => {
        if (context?.signal) {
          context.signal.removeEventListener('abort', abortHandler);
        }
        cleanup();
        reject(new Error(typeof err === 'string' ? err : (err as any)?.message || 'Azure SDK 合成错误'));
      }
    );
  });
}

/**
 * 原生 REST API 合成（兜底方案）
 */
export async function synthesizeAzureViaRest(
  params: TTSGenerateRequest,
  apiKey: string,
  explicitRegion?: string,
  context?: { signal?: AbortSignal }
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  const key = apiKey || resolveAzureApiKey();
  if (!key) {
    throw new Error('未检测到 Azure Speech Key。请在前端设置中填入或在服务端配置 AZURE_SPEECH_KEY。');
  }
  const region = resolveAzureRegion(params.region || explicitRegion);
  const voiceName = (params.voiceName || '').trim();
  if (!voiceName) {
    throw new Error('未指定音色 voiceName（如 zh-CN-XiaoxiaoNeural）');
  }
  const { header, mimeType } = outputFormatFor(params.format);

  const style = params.style?.trim();
  if (style) {
    const voices = await listAzureVoices(key, region, context);
    const selected = voices.find(v => v.id === voiceName);
    if (!selected) throw new LocalTTSError('E_AZURE_VOICE', '所选 Azure 音色不在当前区域的声音列表中。', 400);
    if (!selected.styles?.includes(style)) throw new LocalTTSError('E_AZURE_STYLE', `音色 ${voiceName} 不支持风格 ${style}。`, 400);
  }

  const ssml = buildAzureSSML(stripPerformanceTags(params.text), voiceName, {
    speed: params.speed,
    pitch: params.pitch,
    languageCode: params.languageCode,
    style,
  });

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': header,
      'User-Agent': 'merge-tts-widget',
    },
    body: ssml,
    signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Azure TTS 生成失败 (${res.status} · region=${region}): ${text || res.statusText}。请检查 Key 与 region 是否匹配（Key 在哪个区创建就填哪个区）。`
    );
  }

  const ab = await res.arrayBuffer();
  if (!ab || ab.byteLength === 0) {
    throw new Error('Azure API 未返回有效音频数据');
  }
  return { audioBuffer: Buffer.from(ab), mimeType };
}

export async function synthesizeAzure(
  params: TTSGenerateRequest,
  apiKey: string,
  explicitRegion?: string,
  context?: { signal?: AbortSignal }
): Promise<{ audioBuffer: Buffer; mimeType: string; boundaries?: SpeechBoundary[] }> {
  if (params.preferSdk !== false) {
    try {
      return await synthesizeAzureViaSdk(params, apiKey, explicitRegion, context);
    } catch (sdkError: any) {
      if (sdkError instanceof LocalTTSError) throw sdkError;
      console.warn('[Azure TTS] 官方 Speech SDK 合成异常，降级至 REST 请求:', sdkError?.message || sdkError);
    }
  }

  return synthesizeAzureViaRest(params, apiKey, explicitRegion, context);
}

export const azureProvider: TTSProvider = {
  id: 'azure',
  displayName: 'Azure Speech TTS',
  resolveApiKey: resolveAzureApiKey,
  listModels: (_apiKey?: string) => listAzureModels(),
  listVoices: (apiKey?: string, region?: string) => listAzureVoices(apiKey, region),
  synthesize: (params: TTSGenerateRequest, apiKey: string, context?: { signal?: AbortSignal }) => synthesizeAzure(params, apiKey, undefined, context),
};
