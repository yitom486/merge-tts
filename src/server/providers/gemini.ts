import { GoogleGenAI } from '@google/genai';
import type { ModelCategory, ModelInfo, ModelTier, TTSGenerateRequest, VoiceInfo } from '../types';
import type { TTSProvider } from './types';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_DEFAULT_VOICE = 'Puck';

// 官方 30 预置音色标准表（与文档 Voice options 完全一致，tone 采用官方风格词）
export const DEFAULT_VOICES: VoiceInfo[] = [
  { id: 'Zephyr', name: 'Zephyr', description: '明亮轻快，适合日常播报与轻松内容', tone: 'Bright', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Puck', name: 'Puck', description: '活力上扬、感染力强，适合对白与朗读', tone: 'Upbeat', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Charon', name: 'Charon', description: '沉稳的资讯播报感，适合叙事与解说', gender: 'male', tone: 'Informative', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Kore', name: 'Kore', description: '坚定有力、陪伴感强，适合有声书与播客', gender: 'female', tone: 'Firm', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Fenrir', name: 'Fenrir', description: '兴奋张扬、富有张力，适合戏剧与热血场景', gender: 'male', tone: 'Excitable', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Leda', name: 'Leda', description: '年轻清澈、吐字干练，适合新闻与商业内容', tone: 'Youthful', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Orus', name: 'Orus', description: '沉稳坚定，适合旁白与正式场合', tone: 'Firm', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Aoede', name: 'Aoede', description: '轻盈灵动、富有韵律，适合散文诗歌', tone: 'Breezy', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Callirrhoe', name: 'Callirrhoe', description: '随和自然，适合聊天与生活类内容', tone: 'Easy-going', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Autonoe', name: 'Autonoe', description: '明亮清晰，适合讲解与教程', tone: 'Bright', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Enceladus', name: 'Enceladus', description: '带气息感的嗓音，适合情感独白', tone: 'Breathy', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Iapetus', name: 'Iapetus', description: '清晰明朗，适合播报与说明', tone: 'Clear', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Umbriel', name: 'Umbriel', description: '随和温和，适合故事讲述', tone: 'Easy-going', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Algieba', name: 'Algieba', description: '顺滑流畅，适合长文本收听', tone: 'Smooth', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Despina', name: 'Despina', description: '柔和顺滑，适合夜间与轻内容', tone: 'Smooth', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Erinome', name: 'Erinome', description: '清澈干净，适合知识类内容', tone: 'Clear', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Algenib', name: 'Algenib', description: '沙哑磁性、颗粒感强，适合角色演绎', gender: 'male', tone: 'Gravelly', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Rasalgethi', name: 'Rasalgethi', description: '资讯感强，适合新闻与报告', tone: 'Informative', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Laomedeia', name: 'Laomedeia', description: '轻快上扬，适合短视频与活力内容', tone: 'Upbeat', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Achernar', name: 'Achernar', description: '柔软平静，适合冥想与睡前内容', gender: 'female', tone: 'Soft', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Alnilam', name: 'Alnilam', description: '坚定直接，适合指令与公告', tone: 'Firm', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Schedar', name: 'Schedar', description: '平稳均衡，适合长篇叙述', tone: 'Even', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Gacrux', name: 'Gacrux', description: '成熟稳重，适合纪录片与品牌片', tone: 'Mature', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Pulcherrima', name: 'Pulcherrima', description: '干脆直接，适合广告与宣传', tone: 'Forward', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Achird', name: 'Achird', description: '友好亲切，适合客服与陪伴场景', tone: 'Friendly', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: '休闲随意，适合日常闲聊', tone: 'Casual', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', description: '温柔细腻，适合情感类内容', tone: 'Gentle', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Sadachbia', name: 'Sadachbia', description: '活泼生动，适合儿童与娱乐内容', tone: 'Lively', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Sadaltager', name: 'Sadaltager', description: '博学沉稳，适合讲座与课程', tone: 'Knowledgeable', provider: 'gemini', kind: 'prebuilt' },
  { id: 'Sulafat', name: 'Sulafat', description: '温暖柔和，适合故事与电台', tone: 'Warm', provider: 'gemini', kind: 'prebuilt' },
];

/** 自定义音色 ID（voice_… / voicekey_…）走 voice 直引，预置名走 prebuiltVoiceConfig */
export function resolveVoiceConfig(voiceName: string): any {
  const v = (voiceName || '').trim();
  if (/^voice(_|key_)/i.test(v)) {
    return { voice: v };
  }
  return { prebuiltVoiceConfig: { voiceName: v || GEMINI_DEFAULT_VOICE } };
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
 * 动态从 Google Generative Language API 拉取可用模型列表
 */
export async function fetchRemoteModels(apiKey?: string): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }> {
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (key) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }> };
        if (data.models && Array.isArray(data.models)) {
          const rawVoiceModels: Array<{ id: string; name: string; displayName: string; description: string; isTts: boolean; category: ModelCategory; version: number }> = [];

          for (const m of data.models) {
            const cleanId = m.name.replace(/^models\//, '');
            const lowerId = cleanId.toLowerCase();
            const lowerDisp = (m.displayName || '').toLowerCase();
            const lowerDesc = (m.description || '').toLowerCase();

            const isExcluded = lowerId.includes('embedding') ||
              lowerId.includes('image') ||
              lowerId.includes('veo') ||
              lowerId.includes('deep-research') ||
              lowerId.includes('antigravity') ||
              lowerId.includes('gemma') ||
              lowerId.includes('aqa') ||
              lowerId.includes('nano-banana') ||
              lowerId.includes('robotics') ||
              lowerId.includes('computer-use');

            if (isExcluded) continue;

            const isTts = lowerId.includes('tts') || lowerDisp.includes('tts') || lowerDesc.includes('text-to-speech');
            const isLive = lowerId.includes('live') || lowerId.includes('omni') || lowerDisp.includes('live') || lowerDisp.includes('omni');

            if (isTts) {
              rawVoiceModels.push({
                id: cleanId,
                name: m.name,
                displayName: m.displayName || cleanId,
                description: m.description || 'Google 专用高保真语音朗读与表演模型',
                isTts: true,
                category: 'tts',
                version: extractModelVersion(cleanId),
              });
            } else if (isLive) {
              rawVoiceModels.push({
                id: cleanId,
                name: m.name,
                displayName: m.displayName || cleanId,
                description: m.description || 'Google 实时多模态语音交互模型',
                isTts: false,
                category: 'live',
                version: extractModelVersion(cleanId),
              });
            }
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

          if (voiceModels.length > 0) {
            return { models: voiceModels, source: 'remote' };
          }
        }
      }
    } catch (err) {
      console.warn('远程拉取模型列表失败，将使用标准 TTS 模型列表备用:', err);
    }
  }

  const fallbackList: ModelInfo[] = [
    {
      id: 'gemini-3.8-flash-tts',
      name: 'models/gemini-3.8-flash-tts',
      displayName: 'Gemini 3.8 Flash TTS',
      description: '最高保真度、拟人呼吸感与表演控制，专为高质量配音和有声书设计',
      isTtsRecommended: true,
      category: 'tts',
      version: 3.8,
      tier: 'flagship',
      provider: 'gemini',
    },
    {
      id: 'gemini-3.8-flash-lite-tts',
      name: 'models/gemini-3.8-flash-lite-tts',
      displayName: 'Gemini 3.8 Flash-Lite TTS',
      description: '优化低延迟与吞吐量，极高成本效益，适合实时呼叫与交互场景',
      isTtsRecommended: true,
      category: 'tts',
      version: 3.8,
      tier: 'lite',
      provider: 'gemini',
    },
    {
      id: 'gemini-3.1-flash-tts-preview',
      name: 'models/gemini-3.1-flash-tts-preview',
      displayName: 'Gemini 3.1 Flash TTS Preview',
      description: '上一代预览版语音生成模型',
      isTtsRecommended: false,
      category: 'tts',
      version: 3.1,
      tier: 'preview',
      provider: 'gemini',
    },
  ];

  return { models: fallbackList, source: 'fallback' };
}

/**
 * 动态拉取支持的声音列表（官方 Voices/ListVoices）：
 * 有 Key 时合并远端自定义音色（prompted/replicated）在前、30 预置在后；
 * 无 Key 或失败时直接返回 30 预置标准表。
 */
export async function fetchRemoteVoices(apiKey?: string): Promise<VoiceInfo[]> {
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (key) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?page_size=100&key=${key}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json() as {
          voices?: Array<{
            name?: string; id?: string; key?: string;
            displayName?: string; display_name?: string;
            description?: string; type?: string;
            gender?: string; language_code?: string;
          }>
        };
        if (data.voices && Array.isArray(data.voices) && data.voices.length > 0) {
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
          const seen = new Set(DEFAULT_VOICES.map(d => d.id.toLowerCase()));
          const customs: VoiceInfo[] = [];
          for (const v of data.voices) {
            const rawId = (v.id || v.key || (v.name || '').replace(/^voices\//, '')).trim();
            if (!rawId || seen.has(rawId.toLowerCase())) continue;
            seen.add(rawId.toLowerCase());
            const kind = normKind(v.type);
            // 预置音色以本地标准表为准，不重复收录远端同名项
            if (kind === 'prebuilt') continue;
            const disp = v.displayName || v.display_name || rawId;
            const kindLabel = kind === 'prompted' ? '设计' : kind === 'replicated' ? '复刻' : '自定义';
            customs.push({
              id: rawId,
              name: disp,
              description: disp === rawId ? `自定义${kindLabel}音色` : `自定义${kindLabel}音色 · ${disp}`,
              gender: normGender(v.gender),
              provider: 'gemini',
              kind,
            });
          }
          return [...customs, ...DEFAULT_VOICES];
        }
      }
    } catch (err) {
      console.warn('拉取远程声音列表失败，使用预设音色库:', err);
    }
  }

  return DEFAULT_VOICES;
}

/** 从远端取单条自定义音色详情（含 prompted 的 sample_audio 试听） */
export async function getVoiceDetail(apiKey: string, id: string): Promise<any> {
  const cleanId = id.trim().replace(/^voices\//, '');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/voices/${encodeURIComponent(cleanId)}?key=${apiKey}`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`获取音色详情失败 (${res.status}): ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export async function deleteVoice(apiKey: string, id: string): Promise<{ deleted: boolean }> {
  const cleanId = id.trim().replace(/^voices\//, '');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/voices/${encodeURIComponent(cleanId)}?key=${apiKey}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`删除音色失败 (${res.status}): ${txt.slice(0, 200)}`);
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

function parseVoiceResult(json: any): DesignedVoiceResult {
  const v = json?.voice || json || {};
  const sample = v.sample_audio || v.sampleAudio || {};
  return {
    id: v.id,
    key: v.key,
    displayName: v.display_name || v.displayName,
    sampleAudioBase64: sample.data,
    sampleMime: sample.mime_type || sample.mimeType || 'audio/wav',
    raw: json,
  };
}

function throwVoiceError(status: number, bodyText: string, action: string): never {
  let msg = bodyText.slice(0, 300);
  try {
    const parsed = JSON.parse(bodyText);
    msg = parsed.error?.message || msg;
  } catch { /* 保持原文 */ }
  throw new Error(`${action}失败 (${status}): ${msg}`);
}

/** 自然语言设计音色（VOICE_TYPE_PROMPTED，store=true 落盘，200 个/项目上限，1 年 TTL） */
export async function designVoice(
  apiKey: string,
  opts: { input: string; displayName?: string; gender?: string; languageCode?: string; regionCode?: string; model?: string }
): Promise<DesignedVoiceResult> {
  if (!opts.input || !opts.input.trim()) {
    throw new Error('音色描述_input 不能为空');
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: true,
      voice: {
        model: opts.model || GEMINI_DEFAULT_MODEL,
        type: 'prompted',
        ...(opts.displayName ? { display_name: opts.displayName } : {}),
        ...(opts.gender ? { gender: opts.gender } : {}),
        ...(opts.languageCode ? { language_code: opts.languageCode } : {}),
        prompted: {
          input: opts.input.trim(),
          ...(opts.regionCode ? { region_code: opts.regionCode } : {}),
        },
      },
    }),
  });
  if (!res.ok) {
    throwVoiceError(res.status, await res.text().catch(() => ''), '设计音色');
  }
  return parseVoiceResult(await res.json());
}

/**
 * 声音复刻（VOICE_TYPE_REPLICATED）：
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
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store: opts.store !== false,
      voice: {
        model: opts.model || GEMINI_DEFAULT_MODEL,
        type: 'replicated',
        ...(opts.displayName ? { display_name: opts.displayName } : {}),
        replicated: {
          source_audio: { mime_type: opts.sourceMime || 'audio/wav', data: opts.sourceAudioBase64 },
          consent_audio: { mime_type: opts.consentMime || 'audio/wav', data: opts.consentAudioBase64 },
        },
      },
    }),
  });
  if (!res.ok) {
    throwVoiceError(res.status, await res.text().catch(() => ''), '复刻音色');
  }
  return parseVoiceResult(await res.json());
}

/**
 * 按官方文档组装 speechConfig：
 * - 默认单人：prebuiltVoiceConfig + 可选 languageCode
 * - 2 人及以上：multiSpeakerVoiceConfig（transcript 里需出现对应 speaker 名）
 */
function buildSpeechConfig(params: TTSGenerateRequest): any {
  const speakers = (params.speakers || []).filter(s => s.speaker && s.voiceName);
  if (speakers.length >= 2) {
    return {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: speakers.slice(0, 2).map(s => ({
          speaker: s.speaker,
          voiceConfig: resolveVoiceConfig(s.voiceName),
        })),
      },
    };
  }
  return {
    voiceConfig: resolveVoiceConfig(params.voiceName || GEMINI_DEFAULT_VOICE),
    ...(params.languageCode ? { languageCode: params.languageCode } : {}),
  };
}

/**
 * 按官方文档组装输入文本：
 * - 多人对话：引导模型按 speaker 名分角色朗读 transcript
 * - 风格样式（speechMetadata）：以自然语言指令前置，如 "Say cheerfully: ..."
 */
function buildContents(params: TTSGenerateRequest): string {
  const text = params.text;
  const speakers = (params.speakers || []).filter(s => s.speaker && s.voiceName);
  if (speakers.length >= 2) {
    const names = speakers.slice(0, 2).map(s => s.speaker).join(' and ');
    return `TTS the following conversation between ${names}:\n${text}`;
  }
  const style = (params.speechMetadata || '').trim();
  if (style) {
    return `Say in a ${style} style: ${text}`;
  }
  return text;
}

/**
 * 执行 Gemini 3.8 TTS 语音合成
 */
export async function generateTTSAudio(
  params: TTSGenerateRequest,
  apiKey: string
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  if (!apiKey) {
    throw new Error('未检测到 Gemini API Key。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }

  const modelId = params.model || GEMINI_DEFAULT_MODEL;
  const voiceName = params.voiceName || GEMINI_DEFAULT_VOICE;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: buildContents(params),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: buildSpeechConfig(params),
      },
    });

    const candidate = response.candidates?.[0];
    const audioPart = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.data);

    if (audioPart?.inlineData?.data) {
      const buffer = Buffer.from(audioPart.inlineData.data, 'base64');
      const mime = audioPart.inlineData.mimeType || 'audio/wav';
      return { audioBuffer: buffer, mimeType: mime };
    }
  } catch (sdkError: any) {
    console.warn('SDK 调用异常，尝试使用直接 REST 请求兜底:', sdkError?.message || sdkError);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        parts: [{ text: buildContents(params) }],
      },
    ],
    generation_config: {
      response_modalities: ['AUDIO'],
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: voiceName,
          },
        },
      },
    },
  };

  const restRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!restRes.ok) {
    const errorText = await restRes.text();
    let parsedMsg = errorText;
    try {
      const parsed = JSON.parse(errorText);
      parsedMsg = parsed.error?.message || errorText;
    } catch {}
    throw new Error(`Gemini TTS 生成失败 (${restRes.status}): ${parsedMsg}`);
  }

  const json = await restRes.json() as any;
  const parts = json.candidates?.[0]?.content?.parts;
  const audioPart = parts?.find((p: any) => p.inline_data || p.inlineData);

  const inlineData = audioPart?.inline_data || audioPart?.inlineData;
  if (!inlineData?.data) {
    throw new Error('Gemini API 未在返回结果中包含有效音频数据');
  }

  const audioBuffer = Buffer.from(inlineData.data, 'base64');
  const mimeType = inlineData.mime_type || inlineData.mimeType || 'audio/wav';

  return { audioBuffer, mimeType };
}

/**
 * 流式语音合成（官方 generateContentStream）：
 * 边生成边通过 onChunk 回调 base64 PCM 分片（24kHz 单声道 16-bit），
 * 调用方负责拼 WAV / 实时播放。
 */
export async function synthesizeGeminiStream(
  params: TTSGenerateRequest,
  apiKey: string,
  onChunk: (chunk: { audioBase64: string; mimeType: string }) => void | Promise<void>
): Promise<{ mimeType: string }> {
  if (!apiKey) {
    throw new Error('未检测到 Gemini API Key。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }

  const modelId = params.model || GEMINI_DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const stream = await ai.models.generateContentStream({
    model: modelId,
    contents: buildContents(params),
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: buildSpeechConfig(params),
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
  defaultModel: GEMINI_DEFAULT_MODEL,
  defaultVoice: GEMINI_DEFAULT_VOICE,
  resolveApiKey: resolveGeminiApiKey,
  listModels: fetchRemoteModels,
  listVoices: fetchRemoteVoices,
  synthesize: generateTTSAudio,
  synthesizeStream: synthesizeGeminiStream,
};
