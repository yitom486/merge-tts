import { GoogleGenAI } from '@google/genai';
import type { TTSGenerateRequest, ModelInfo, VoiceInfo } from './types';

// 基础预置声音特征库（用于丰富界面信息）
export const DEFAULT_VOICES: VoiceInfo[] = [
  { id: 'Puck', name: 'Puck', description: '灵动活力、充满感染力与好奇心，适合日常对白与轻松朗读', gender: 'male', tone: 'Energetic & Youthful' },
  { id: 'Charon', name: 'Charon', description: '深沉醇厚、庄重而富有磁性，适合史诗叙事、纪录片解说', gender: 'male', tone: 'Deep & Authoritative' },
  { id: 'Kore', name: 'Kore', description: '温暖柔和、亲切从容，极具陪伴感与呼吸感，适合有声书与日常播客', gender: 'female', tone: 'Warm & Soothing' },
  { id: 'Fenrir', name: 'Fenrir', description: '刚劲有力、富有张力与颗粒感，适合冲突剧本与热血戏剧配音', gender: 'male', tone: 'Bold & Gritty' },
  { id: 'Aoede', name: 'Aoede', description: '典雅轻灵、语调富有韵律与诗意，适合散文诗歌与唯美台词', gender: 'female', tone: 'Lyrical & Elegant' },
  { id: 'Leda', name: 'Leda', description: '清晰干练、吐字严谨，专业新闻与商业报告质感', gender: 'female', tone: 'Professional & Crisp' },
  { id: 'Orpheus', name: 'Orpheus', description: '戏剧化起伏、饱含情绪层次，适合情感独白与故事演绎', gender: 'male', tone: 'Dramatic & Storyteller' },
  { id: 'Zephyr', name: 'Zephyr', description: '清澈微风感、从容随性，适合冥想引导与生活随笔', gender: 'neutral', tone: 'Calm & Gentle' },
];

/**
 * 动态从模型 ID 中提取数字版本号（完全自适应未来任意新版本，如 gemini-4, gemini-4.5 等）
 */
export function extractModelVersion(id: string): number {
  const match = id.match(/gemini-(\d+(?:\.\d+)?)/i);
  return match && match[1] ? parseFloat(match[1]) : 0;
}

/**
 * 动态计算模型排序权重（零硬编码，自适应版本号与规格层级）
 * 1. 版本号主导：更高版本永远在前（Gemini 4 > Gemini 3.8 > Gemini 2.5）
 * 2. 类别权重：TTS 诵读模型排在 Live 前
 * 3. 规格权重：Pro/Flash 旗舰优先于 Lite 极速轻量
 * 4. 稳定性权重：正式版优先于 Preview 预览版
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
    return 'flagship'; // 最高版本的标准/Flash 款作为最新旗舰
  }

  if (lowerId.includes('lite')) return 'lite';
  if (lowerId.includes('pro')) return 'pro';
  if (lowerId.includes('preview')) return 'preview';
  return 'standard';
}

/**
 * 动态从 Google Generative Language API 拉取可用模型列表
 * 坚决避免在前端或服务端死板硬编码
 * 仅保留 TTS 语音诵读模型 与 Live/Omni 实时语音对话模型，剔除通用大语言/多模态/画图视频等冗余模型
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
          // 仅过滤语音模型：TTS 模型 与 Live / 语音交互模型
          const rawVoiceModels: Array<{ id: string; name: string; displayName: string; description: string; isTts: boolean; category: ModelCategory; version: number }> = [];

          for (const m of data.models) {
            const cleanId = m.name.replace(/^models\//, '');
            const lowerId = cleanId.toLowerCase();
            const lowerDisp = (m.displayName || '').toLowerCase();
            const lowerDesc = (m.description || '').toLowerCase();

            // 明确剔除通用大模型、嵌入、画图、视频、代码模型
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

          // 动态计算当前发现的最高 TTS 版本（如未来出现 4.0，maxTtsVersion 自动变为 4.0）
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
            };
          });

          // 动态打分排序：高版本、高规格、正式版永远自动排在第一位
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

  // 兜底备用模型
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
    },
  ];

  return { models: fallbackList, source: 'fallback' };
}

/**
 * 动态拉取支持的声音列表
 */
export async function fetchRemoteVoices(apiKey?: string): Promise<VoiceInfo[]> {
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (key) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/voices?key=${key}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json() as { voices?: Array<{ name: string; id?: string; description?: string }> };
        if (data.voices && Array.isArray(data.voices) && data.voices.length > 0) {
          return data.voices.map(v => {
            const rawId = v.id || v.name.replace(/^voices\//, '');
            const existingMeta = DEFAULT_VOICES.find(d => d.id.toLowerCase() === rawId.toLowerCase());
            return {
              id: rawId,
              name: rawId,
              description: v.description || existingMeta?.description || 'Gemini 语音库音色',
              gender: existingMeta?.gender,
              tone: existingMeta?.tone,
            };
          });
        }
      }
    } catch (err) {
      console.warn('拉取远程声音列表失败，使用预设音色库:', err);
    }
  }

  return DEFAULT_VOICES;
}

/**
 * 执行 Gemini 3.8 TTS 语音合成
 * 返回纯音频 Buffer 与 MIME 类型
 */
export async function generateTTSAudio(
  params: TTSGenerateRequest,
  apiKey: string
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  if (!apiKey) {
    throw new Error('未检测到 Gemini API Key。请在前端设置中填入或在服务端配置 GEMINI_API_KEY。');
  }

  const modelId = params.model || 'gemini-3.8-flash-tts';
  const voiceName = params.voiceName || 'Puck';

  // 1. 尝试使用 @google/genai SDK
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // 构造带 speechConfig 的生成请求
    const response = await ai.models.generateContent({
      model: modelId,
      contents: params.text,
      config: {
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
          ...(params.languageCode ? { languageCode: params.languageCode } : {}),
        },
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

  // 2. REST API 兜底调用
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        parts: [{ text: params.text }],
      },
    ],
    generation_config: {
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
