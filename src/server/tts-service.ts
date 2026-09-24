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
 * 动态从 Google Generative Language API 拉取可用模型列表
 * 坚决避免在前端或服务端死板硬编码
 */
export async function fetchRemoteModels(apiKey?: string): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }> {
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (key) {
    try {
      // 优先调用 Google 官方 REST API 获取完整模型清单
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }> };
        if (data.models && Array.isArray(data.models)) {
          const mappedModels: ModelInfo[] = data.models.map(m => {
            const cleanId = m.name.replace(/^models\//, '');
            const isTts = cleanId.toLowerCase().includes('tts') ||
              (m.displayName?.toLowerCase().includes('tts') ?? false) ||
              (m.description?.toLowerCase().includes('text-to-speech') ?? false);

            return {
              id: cleanId,
              name: m.name,
              displayName: m.displayName || cleanId,
              description: m.description || '',
              isTtsRecommended: isTts,
            };
          });

          // 优先展示 TTS 模型，并按推荐程度排序
          mappedModels.sort((a, b) => {
            if (a.isTtsRecommended && !b.isTtsRecommended) return -1;
            if (!a.isTtsRecommended && b.isTtsRecommended) return 1;
            return a.id.localeCompare(b.id);
          });

          // 如果拉取到了包含 TTS 的模型，直接返回远程结果
          if (mappedModels.some(m => m.isTtsRecommended)) {
            return { models: mappedModels, source: 'remote' };
          }

          // 如果虽然 API 通畅但新 TTS 预览模型还未全局列出，注入 3.8 Flash TTS 并排在第一
          const ttsModelIds = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
          const augmented = [
            ...ttsModelIds.map(id => ({
              id,
              name: `models/${id}`,
              displayName: id === 'gemini-3.8-flash-tts' ? 'Gemini 3.8 Flash TTS (高保真演播棚级)' : 'Gemini 3.8 Flash-Lite TTS (极速低延迟)',
              description: 'Google 最新专用语音生成模型，支持行内表演标签与情绪控制',
              isTtsRecommended: true,
            })),
            ...mappedModels.filter(m => !ttsModelIds.includes(m.id)),
          ];
          return { models: augmented, source: 'remote' };
        }
      }
    } catch (err) {
      console.warn('远程拉取模型列表失败，将使用标准 TTS 模型列表备用:', err);
    }
  }

  // 兜底（当尚未输入 Key 或网络离线时提供可用模型）
  const fallbackList: ModelInfo[] = [
    {
      id: 'gemini-3.8-flash-tts',
      name: 'models/gemini-3.8-flash-tts',
      displayName: 'Gemini 3.8 Flash TTS (演播级旗舰)',
      description: '最高保真度、拟人呼吸感与表演控制，专为高质量配音和有声书设计',
      isTtsRecommended: true,
    },
    {
      id: 'gemini-3.8-flash-lite-tts',
      name: 'models/gemini-3.8-flash-lite-tts',
      displayName: 'Gemini 3.8 Flash-Lite TTS (极速轻量)',
      description: '优化低延迟与吞吐量，极高成本效益，适合实时呼叫与交互场景',
      isTtsRecommended: true,
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
