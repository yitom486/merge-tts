import type { ModelInfo, TTSGenerateRequest, VoiceInfo } from '../types';
import type { TTSProvider } from './types';

export const AZURE_DEFAULT_MODEL = 'azure-neural';
export const AZURE_DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
export const AZURE_DEFAULT_REGION = 'eastus';

export const AZURE_FALLBACK_VOICES: VoiceInfo[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: 'zh-CN-XiaoxiaoNeural', description: '晓晓 · 温暖亲切，中文首选，适合播客与有声书', gender: 'female', tone: 'Warm & Friendly', provider: 'azure' },
  { id: 'zh-CN-YunxiNeural', name: 'zh-CN-YunxiNeural', description: '云希 · 阳光活力，适合短视频与日常对白', gender: 'male', tone: 'Energetic & Youthful', provider: 'azure' },
  { id: 'zh-CN-YunjianNeural', name: 'zh-CN-YunjianNeural', description: '云健 · 沉稳磁性，适合纪录片与新闻解说', gender: 'male', tone: 'Deep & Authoritative', provider: 'azure' },
  { id: 'zh-CN-XiaoyiNeural', name: 'zh-CN-XiaoyiNeural', description: '晓伊 · 清晰干练，适合客服与商业播报', gender: 'female', tone: 'Professional & Crisp', provider: 'azure' },
  { id: 'en-US-AriaNeural', name: 'en-US-AriaNeural', description: 'Aria · 自然美音，英文首选', gender: 'female', tone: 'Natural & Expressive', provider: 'azure' },
  { id: 'en-US-GuyNeural', name: 'en-US-GuyNeural', description: 'Guy · 沉稳美音，适合旁白', gender: 'male', tone: 'Calm & Narration', provider: 'azure' },
];

const AZURE_FALLBACK_MODELS: ModelInfo[] = [
  {
    id: AZURE_DEFAULT_MODEL,
    name: AZURE_DEFAULT_MODEL,
    displayName: 'Azure Neural TTS',
    description: '微软神经网络语音，每月 F0 免费 50 万字符，支持 SSML 语速语调',
    isTtsRecommended: true,
    category: 'tts',
    tier: 'flagship',
    provider: 'azure',
  },
];

export function resolveAzureApiKey(headerKey?: string): string {
  if (headerKey && headerKey.trim() !== '') return headerKey.trim();
  return (
    (process.env.AZURE_SPEECH_KEY || '') ||
    (process.env.AZURE_SUBSCRIPTION_KEY || '')
  ).trim();
}

export function resolveAzureRegion(explicit?: string): string {
  const raw = (explicit && explicit.trim()) || (process.env.AZURE_SPEECH_REGION || '').trim() || AZURE_DEFAULT_REGION;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return cleaned || AZURE_DEFAULT_REGION;
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
  return 'zh-CN';
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

export function buildAzureSSML(text: string, voiceName: string, opts?: { speed?: number; pitch?: number; languageCode?: string }): string {
  const locale = localeFromVoice(voiceName, opts?.languageCode);
  const rate = toPercent(opts?.speed);
  const pitch = toPercent(opts?.pitch);
  const safeText = escapeXml(text);
  const inner = rate || pitch
    ? `<prosody${rate ? ` rate="${rate}"` : ''}${pitch ? ` pitch="${pitch}"` : ''}>${safeText}</prosody>`
    : safeText;
  return `<speak version="1.0" xml:lang="${locale}"><voice xml:lang="${locale}" name="${voiceName}">${inner}</voice></speak>`;
}

function outputFormatFor(format?: string): { header: string; mimeType: string; ext: string } {
  if (format === 'mp3') return { header: 'audio-24khz-48kbitrate-mono-mp3', mimeType: 'audio/mpeg', ext: 'mp3' };
  if (format === 'pcm') return { header: 'raw-24khz-16bit-mono-pcm', mimeType: 'audio/pcm', ext: 'pcm' };
  if (format === 'ogg') return { header: 'ogg-24khz-16bit-mono-opus', mimeType: 'audio/ogg', ext: 'ogg' };
  return { header: 'riff-24khz-16bit-mono-pcm', mimeType: 'audio/wav', ext: 'wav' };
}

export async function listAzureModels(): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }> {
  // Azure 无模型列表概念：返回静态档位，保持 ModelPicker 可用
  return { models: AZURE_FALLBACK_MODELS, source: 'fallback' };
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
}

export async function listAzureVoices(apiKey?: string, region?: string): Promise<VoiceInfo[]> {
  const key = apiKey || resolveAzureApiKey();
  const reg = resolveAzureRegion(region);
  if (!key) return AZURE_FALLBACK_VOICES;

  try {
    const res = await fetch(`https://${reg}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    if (!res.ok) {
      console.warn(`Azure voices/list 失败 (${res.status})，使用内置音色`);
      return AZURE_FALLBACK_VOICES;
    }
    const data = (await res.json()) as AzureVoiceItem[];
    if (!Array.isArray(data) || data.length === 0) return AZURE_FALLBACK_VOICES;

    const mapped: VoiceInfo[] = data
      .filter(v => v.ShortName)
      .map(v => ({
        id: v.ShortName as string,
        name: v.ShortName as string,
        description: `${v.DisplayName || v.LocalName || v.ShortName} (${v.Locale || ''}${v.VoiceType ? ` · ${v.VoiceType}` : ''})`,
        gender: genderFromAzure(v.Gender),
        tone: v.VoiceType,
        provider: 'azure',
      }));

    // 中文优先，其次英文，保持选择器友好
    const rank = (v: VoiceInfo) => {
      const id = v.id.toLowerCase();
      if (id.startsWith('zh-cn')) return 0;
      if (id.startsWith('zh')) return 1;
      if (id.startsWith('en')) return 2;
      return 3;
    };
    mapped.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
    return mapped;
  } catch (err) {
    console.warn('拉取 Azure 声音列表失败，使用内置音色:', err);
    return AZURE_FALLBACK_VOICES;
  }
}

export async function synthesizeAzure(
  params: TTSGenerateRequest,
  apiKey: string,
  explicitRegion?: string
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  const key = apiKey || resolveAzureApiKey();
  if (!key) {
    throw new Error('未检测到 Azure Speech Key。请在前端设置中填入或在服务端配置 AZURE_SPEECH_KEY。');
  }
  const region = resolveAzureRegion(params.region || explicitRegion);
  const voiceName = params.voiceName || AZURE_DEFAULT_VOICE;
  const { header, mimeType } = outputFormatFor(params.format);

  const ssml = buildAzureSSML(params.text, voiceName, {
    speed: params.speed,
    pitch: params.pitch,
    languageCode: params.languageCode,
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

export const azureProvider: TTSProvider = {
  id: 'azure',
  displayName: 'Azure Speech TTS',
  defaultModel: AZURE_DEFAULT_MODEL,
  defaultVoice: AZURE_DEFAULT_VOICE,
  resolveApiKey: resolveAzureApiKey,
  listModels: (_apiKey?: string) => listAzureModels(),
  listVoices: (apiKey?: string, region?: string) => listAzureVoices(apiKey, region),
  synthesize: (params: TTSGenerateRequest, apiKey: string) => synthesizeAzure(params, apiKey),
};
