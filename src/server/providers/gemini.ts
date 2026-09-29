import { GoogleGenAI } from '@google/genai';
import type { ModelCategory, ModelInfo, ModelTier, TTSGenerateRequest, VoiceInfo } from '../types';
import type { TTSProvider } from './types';

/** 自定义音色 ID（voice_… / voicekey_…）走 voice 直引，预置名走 prebuiltVoiceConfig */
export function resolveVoiceConfig(voiceName: string): any {
  const v = (voiceName || '').trim();
  if (!v) {
    throw new Error('未指定音色 voiceName');
  }
  if (/^voice(_|key_)/i.test(v)) {
    return { voice: v };
  }
  return { prebuiltVoiceConfig: { voiceName: v } };
}

/**
 * 语音模型分类器（声明式规则）：
 * Google 未在 models.list 里提供输出模态字段，“名字/描述匹配”是唯一可用信号，
 * 因此这里是正选（tts/live 关键词）+ 少量排除（明显非语音大类）两段式，
 * 而非逐个版本硬编码。
 */
const EXCLUDED_MODEL_HINTS = [
  'embedding', 'image', 'veo', 'deep-research', 'antigravity',
  'gemma', 'aqa', 'nano-banana', 'robotics', 'computer-use',
] as const;

export function classifyVoiceModel(m: { name?: string; displayName?: string; description?: string }): ModelCategory | null {
  const cleanId = (m.name || '').replace(/^models\//, '');
  const haystack = `${cleanId} ${m.displayName || ''} ${m.description || ''}`.toLowerCase();
  if (!cleanId) return null;
  if (EXCLUDED_MODEL_HINTS.some(h => haystack.includes(h))) return null;
  if (haystack.includes('tts') || haystack.includes('text-to-speech')) return 'tts';
  if (haystack.includes('live') || haystack.includes('omni')) return 'live';
  return null;
}

/**
 * 动态从模型 ID 中提取数字版本号（完全自适应未来任意新版本，如 gemini-4, gemini-4.5 等）
 */
export function extractModelVersion(id: string): number {
  const match = id.match(/gemini-(\d+(?:\.\d+)?)/i);
  return match && match[1] ? parseFloat(match[1]) : 0;
}

/**
 * 动态计算模型排序权重（零硬编码，自适应版本号与规格层级）
 */
export function calculateModelScore(id: string, category: ModelCategory): number {
  const version = extractModelVersion(id);
  const lowerId = id.toLowerCase();

  let score = version * 1000;

  if (category === 'tts') {
    score += 500;
  }

  if (lowerId.includes('pro')) {
    score += 150;
  } else if (!lowerId.includes('lite')) {
    score += 100;
  } else {
    score += 50;
  }

  if (!lowerId.includes('preview')) {
    score += 25;
  }

  return score;
}

/**
 * 动态推导模型梯队与特征标签（彻底摒弃写死特定版本）
 */
export function determineModelTier(id: string, category: ModelCategory, isMaxVersion: boolean): ModelTier {
  const lowerId = id.toLowerCase();

  if (category === 'live') {
    return 'standard';
  }

  if (isMaxVersion) {
    if (lowerId.includes('lite')) return 'lite';
    if (lowerId.includes('pro')) return 'pro';
    return 'flagship';
  }

  if (lowerId.includes('lite')) return 'lite';
  if (lowerId.includes('pro')) return 'pro';
  if (lowerId.includes('preview')) return 'preview';
  return 'standard';
}

export function resolveGeminiApiKey(headerKey?: string): string {
  if (headerKey && headerKey.trim() !== '') return headerKey.trim();
  return (process.env.GEMINI_API_KEY || '').trim();
}

/**
 * 从 Google 拉取可用模型列表（原生 SDK models.list，无任何本地兜底）：
 * 无 Key、请求失败、无可用语音模型一律抛错，由调用方如实展示。
 */
export async function fetchRemoteModels(apiKey?: string): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('缺少 Gemini API Key，无法拉取模型列表。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const remote: Array<{ name?: string; displayName?: string; description?: string }> = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      remote.push(m);
    }
  } catch (err: any) {
    throw new Error(`拉取模型列表失败：${err?.message || err}`);
  }
  const rawVoiceModels: Array<{ id: string; name: string; displayName: string; description: string; isTts: boolean; category: ModelCategory; version: number }> = [];

  for (const m of remote) {
    if (!m.name) continue;
    const category = classifyVoiceModel(m);
    if (!category || category === 'other') continue;
    const cleanId = m.name.replace(/^models\//, '');
    const isTts = category === 'tts';
    rawVoiceModels.push({
      id: cleanId,
      name: m.name,
      displayName: m.displayName || cleanId,
      description: m.description || (isTts ? 'Google 专用高保真语音朗读与表演模型' : 'Google 实时多模态语音交互模型'),
      isTts,
      category,
      version: extractModelVersion(cleanId),
    });
  }

  const maxTtsVersion = rawVoiceModels
    .filter(m => m.category === 'tts')
    .reduce((max, m) => Math.max(max, m.version), 0);

  const voiceModels: ModelInfo[] = rawVoiceModels.map(m => {
    const isMaxVersion = m.category === 'tts' && m.version === maxTtsVersion && maxTtsVersion > 0;
    return {
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      isTtsRecommended: m.isTts,
      category: m.category,
      version: m.version,
      tier: determineModelTier(m.id, m.category, isMaxVersion),
      provider: 'gemini',
    };
  });

  voiceModels.sort((a, b) => calculateModelScore(b.id, b.category) - calculateModelScore(a.id, a.category));

  if (voiceModels.length === 0) {
    throw new Error('远端未返回任何 TTS / Live 语音模型');
  }
  return { models: voiceModels, source: 'remote' };
}

/**
 * 拉取指定模型详情（原生 SDK models.get，id 或 models/ 全名均可）。
 * tier 为非比较口径（单条无法判定是否最高版本），如需旗舰标记请走列表接口。
 */
export async function fetchModelDetail(apiKey: string, modelId: string): Promise<ModelInfo> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('缺少 Gemini API Key，无法拉取模型详情。');
  }
  const cleanId = (modelId || '').trim().replace(/^models\//, '');
  if (!cleanId) {
    throw new Error('未指定模型 model');
  }
  const ai = new GoogleGenAI({ apiKey: key });
  let m: { name?: string; displayName?: string; description?: string };
  try {
    m = await ai.models.get({ model: cleanId });
  } catch (err: any) {
    throw new Error(`拉取模型详情失败：${err?.message || err}`);
  }
  const category = classifyVoiceModel({ name: m.name || cleanId, displayName: m.displayName, description: m.description }) || 'other';
  const isTts = category === 'tts';
  return {
    id: cleanId,
    name: m.name || `models/${cleanId}`,
    displayName: m.displayName || cleanId,
    description: m.description || '',
    isTtsRecommended: isTts,
    category,
    version: extractModelVersion(cleanId),
    tier: determineModelTier(cleanId, category, false),
    provider: 'gemini',
  };
}

/**
 * 声音列表 100% 来自官方 Voices/ListVoices（原生 SDK ai.voices.list，无本地兜底）：
 * 自定义音色（prompted/replicated）在前，预置在后，均以远端返回为准。
 */
export async function fetchRemoteVoices(apiKey?: string): Promise<VoiceInfo[]> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('缺少 Gemini API Key，无法拉取声音列表。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const remote: any[] = [];
  try {
    let pageToken: string | undefined;
    for (;;) {
      const page: any = await ai.voices.list({ pageSize: 100, pageToken } as any);
      const items = page?.voices || [];
      remote.push(...items);
      pageToken = page?.nextPageToken;
      if (!pageToken) break;
    }
  } catch (err: any) {
    throw new Error(`拉取声音列表失败：${err?.message || err}`);
  }
  if (remote.length === 0) {
    throw new Error('远端未返回任何可用音色');
  }

  const normKind = (t?: string): VoiceInfo['kind'] => {
    const v = (t || '').toLowerCase();
    if (v.includes('prompt')) return 'prompted';
    if (v.includes('replic')) return 'replicated';
    if (v.includes('prebuilt')) return 'prebuilt';
    return 'custom';
  };
  const normGender = (g?: string): VoiceInfo['gender'] => {
    const v = (g || '').toLowerCase();
    if (v.startsWith('f')) return 'female';
    if (v.startsWith('m')) return 'male';
    return undefined;
  };

  const seen = new Set<string>();
  const customs: VoiceInfo[] = [];
  const prebuilt: VoiceInfo[] = [];
  for (const v of remote) {
    const rawId = (v.id || v.key || (v.name || '').replace(/^voices\//, '') || '').trim();
    if (!rawId || seen.has(rawId.toLowerCase())) continue;
    seen.add(rawId.toLowerCase());
    const kind = normKind(v.type);
    const disp = v.displayName || v.display_name || rawId;
    const item: VoiceInfo = {
      id: rawId,
      name: disp,
      description: v.description || (kind === 'prebuilt' ? `Google 预置音色 · ${disp}` : `自定义音色 · ${disp}`),
      gender: normGender(v.gender),
      provider: 'gemini',
      kind,
    };
    if (kind === 'prebuilt') prebuilt.push(item);
    else customs.push(item);
  }

  const all = [...customs, ...prebuilt];
  if (all.length === 0) {
    throw new Error('远端未返回任何可用音色');
  }
  return all;
}

/** 从远端取单条自定义音色详情（含 prompted 的 sample_audio 试听，原生 SDK ai.voices.get） */
export async function getVoiceDetail(apiKey: string, id: string): Promise<any> {
  const cleanId = id.trim().replace(/^voices\//, '');
  if (!cleanId) {
    throw new Error('未指定音色 id');
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    return await ai.voices.get(cleanId);
  } catch (err: any) {
    throw new Error(`获取音色详情失败：${err?.message || err}`);
  }
}

export async function deleteVoice(apiKey: string, id: string): Promise<{ deleted: boolean }> {
  const cleanId = id.trim().replace(/^voices\//, '');
  if (!cleanId) {
    throw new Error('未指定音色 id');
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    await ai.voices.delete(cleanId);
  } catch (err: any) {
    throw new Error(`删除音色失败：${err?.message || err}`);
  }
  return { deleted: true };
}

export interface DesignedVoiceResult {
  id?: string;
  key?: string;
  displayName?: string;
  sampleAudioBase64?: string;
  sampleMime?: string;
  raw: any;
}

function parseVoiceResult(voice: any): DesignedVoiceResult {
  const v = voice || {};
  const sample = v.sample_audio || v.sampleAudio || {};
  const audio = sample.data || sample.audioContent;
  return {
    id: v.id,
    key: v.key,
    displayName: v.display_name || v.displayName,
    sampleAudioBase64: typeof audio === 'string' ? audio : audio?.data,
    sampleMime: sample.mime_type || sample.mimeType || 'audio/wav',
    raw: voice,
  };
}

/** 自然语言设计音色（原生 SDK ai.voices.create，store=true 落盘，200 个/项目上限，1 年 TTL） */
export async function designVoice(
  apiKey: string,
  opts: { input: string; displayName?: string; gender?: string; languageCode?: string; regionCode?: string; model?: string }
): Promise<DesignedVoiceResult> {
  if (!opts.input || !opts.input.trim()) {
    throw new Error('音色描述 input 不能为空');
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    const created: any = await ai.voices.create({
      store: true,
      voice: {
        ...(opts.model ? { model: opts.model } : {}),
        type: 'prompted',
        ...(opts.displayName ? { display_name: opts.displayName } : {}),
        ...(opts.gender ? { gender: opts.gender } : {}),
        ...(opts.languageCode ? { language_code: opts.languageCode } : {}),
        prompted: {
          input: opts.input.trim(),
          ...(opts.regionCode ? { region_code: opts.regionCode } : {}),
        },
      },
    } as any);
    return parseVoiceResult(created);
  } catch (err: any) {
    throw new Error(`设计音色失败：${err?.message || err}`);
  }
}

/**
 * 声音复刻（原生 SDK ai.voices.create）：
 * source 10–30s 干净人声 + consent 同一人朗读授权声明（建议 24kHz 单声道 16-bit WAV）。
 */
export async function replicateVoice(
  apiKey: string,
  opts: {
    displayName?: string; model?: string; store?: boolean;
    sourceAudioBase64: string; sourceMime?: string;
    consentAudioBase64: string; consentMime?: string;
  }
): Promise<DesignedVoiceResult> {
  if (!opts.sourceAudioBase64 || !opts.consentAudioBase64) {
    throw new Error('复刻需要 sourceAudio（参考音）与 consentAudio（授权朗读音）两段音频');
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    const created: any = await ai.voices.create({
      store: opts.store !== false,
      voice: {
        ...(opts.model ? { model: opts.model } : {}),
        type: 'replicated',
        ...(opts.displayName ? { display_name: opts.displayName } : {}),
        replicated: {
          source_audio: { mime_type: opts.sourceMime || 'audio/wav', data: opts.sourceAudioBase64 },
          consent_audio: { mime_type: opts.consentMime || 'audio/wav', data: opts.consentAudioBase64 },
        },
      },
    } as any);
    return parseVoiceResult(created);
  } catch (err: any) {
    throw new Error(`复刻音色失败：${err?.message || err}`);
  }
}

/**
 * 按官方文档组装 speechConfig：
 * - 有效双人（剧本含双方标记）：multiSpeakerVoiceConfig
 * - 其他：一律单人 voiceConfig（开关开了但剧本无标记时自动降级，避免 400）
 */
function buildSpeechConfig(params: TTSGenerateRequest): any {
  if (isDialogueRequest(params)) {
    const speakers = (params.speakers || []).filter(s => s.speaker && s.voiceName);
    return {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: speakers.slice(0, 2).map(s => ({
          speaker: s.speaker,
          voiceConfig: resolveVoiceConfig(s.voiceName),
        })),
      },
    };
  }
  const speakers = (params.speakers || []).filter(s => s.speaker && s.voiceName);
  const singleVoice = (speakers.length > 0 ? speakers[0].voiceName : params.voiceName || '').trim();
  if (!singleVoice) {
    throw new Error('未指定音色 voiceName');
  }
  return {
    voiceConfig: resolveVoiceConfig(singleVoice),
    ...(params.languageCode ? { languageCode: params.languageCode } : {}),
  };
}

/**
 * 把双人剧本按 Speaker 1:/Speaker 2: 行拆成 part 数组。
 * API 强制要求：双人请求的每个文本 part 必须自带 speech_metadata.speaker，
 * 仅靠引导语文本是不够的（会报 INVALID_ARGUMENT）。
 * 无标记行归入上一个说话人（开头无标记则归 Speaker 1）。
 */
export function parseDialogueParts(text: string): Array<{ speaker: string; text: string }> {
  const parts: Array<{ speaker: string; text: string }> = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^speaker\s*(1|2)\s*:\s*(.*)$/i);
    if (m) {
      const body = (m[2] || '').trim();
      if (body) parts.push({ speaker: `Speaker ${m[1]}`, text: body });
    } else if (parts.length > 0) {
      parts[parts.length - 1].text += `\n${line}`;
    } else {
      parts.push({ speaker: 'Speaker 1', text: line });
    }
  }
  return parts.filter(p => p.text.trim().length > 0);
}

/** 是否为有效双人请求：开了开关 + 剧本含双方标记 + 音色不同 */
export function isDialogueRequest(params: TTSGenerateRequest): boolean {
  const speakers = (params.speakers || []).filter(s => s.speaker && s.voiceName);
  if (speakers.length < 2) return false;
  const parts = parseDialogueParts(params.text || '');
  const names = new Set(parts.map(p => p.speaker));
  return names.has('Speaker 1') && names.has('Speaker 2');
}
function buildContents(params: TTSGenerateRequest): string {
  const style = (params.speechMetadata || '').trim();
  if (style) {
    return `Say in a ${style} style: ${params.text}`;
  }
  return params.text;
}

/**
 * SDK 版 contents：双人时按 part 标注 speechMetadata.speaker（API 强制要求），
 * 单人时沿用风格指令字符串。Part 类型暂无官方 TS 定义，调用处 as any。
 */
function buildSdkContents(params: TTSGenerateRequest): any {
  if (isDialogueRequest(params)) {
    return [{
      role: 'user',
      parts: parseDialogueParts(params.text).map(p => ({
        text: p.text,
        speechMetadata: { speaker: p.speaker },
      })),
    }];
  }
  return buildContents(params);
}

/**
 * 执行 Gemini TTS 语音合成（原生 SDK 直调，无 REST 兜底：失败即抛错）
 */
export async function generateTTSAudio(
  params: TTSGenerateRequest,
  apiKey: string,
  context?: { signal?: AbortSignal }
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  if (!apiKey) {
    throw new Error('未检测到 Gemini API Key。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }
  const modelId = (params.model || '').trim();
  if (!modelId) {
    throw new Error('未指定模型 model');
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: modelId,
    contents: buildSdkContents(params) as any,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: buildSpeechConfig(params),
      abortSignal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    },
  });

  const candidate = response.candidates?.[0];
  const audioPart = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.data);

  if (!audioPart?.inlineData?.data) {
    throw new Error('Gemini API 未在返回结果中包含有效音频数据');
  }

  return {
    audioBuffer: Buffer.from(audioPart.inlineData.data, 'base64'),
    mimeType: audioPart.inlineData.mimeType || 'audio/wav',
  };
}

/**
 * 流式语音合成（官方 generateContentStream）：
 * 边生成边通过 onChunk 回调 base64 PCM 分片（24kHz 单声道 16-bit），
 * 调用方负责拼 WAV / 实时播放。
 */
export async function synthesizeGeminiStream(
  params: TTSGenerateRequest,
  apiKey: string,
  onChunk: (chunk: { audioBase64: string; mimeType: string }) => void | Promise<void>,
  context?: { signal?: AbortSignal }
): Promise<{ mimeType: string }> {
  if (!apiKey) {
    throw new Error('未检测到 Gemini API Key。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }
  const modelId = (params.model || '').trim();
  if (!modelId) {
    throw new Error('未指定模型 model');
  }
  const ai = new GoogleGenAI({ apiKey });

  const stream = await ai.models.generateContentStream({
    model: modelId,
    contents: buildSdkContents(params) as any,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: buildSpeechConfig(params),
      abortSignal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    },
  });

  let mimeType = 'audio/L16;codec=pcm;rate=24000';
  let chunkCount = 0;
  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      const inline = (part as any).inlineData;
      if (inline?.data) {
        chunkCount++;
        if (inline.mimeType) mimeType = inline.mimeType;
        await onChunk({ audioBase64: inline.data, mimeType });
      }
    }
  }

  if (chunkCount === 0) {
    throw new Error('Gemini API 流式返回中未包含有效音频数据');
  }
  return { mimeType };
}

export const geminiProvider: TTSProvider = {
  id: 'gemini',
  displayName: 'Google Gemini TTS',
  resolveApiKey: resolveGeminiApiKey,
  listModels: fetchRemoteModels,
  listVoices: fetchRemoteVoices,
  getModelDetail: fetchModelDetail,
  synthesize: generateTTSAudio,
  synthesizeStream: synthesizeGeminiStream,
};
