import type { ModelCategory, ModelInfo, ModelTier, TTSGenerateRequest, VoiceInfo } from '../types';
import type { TTSProvider } from './types';
/** 自定义音色 ID（voice_… / voicekey_…）走 voice 直引，预置名走 prebuiltVoiceConfig */
export declare function resolveVoiceConfig(voiceName: string): any;
export declare function classifyVoiceModel(m: {
    name?: string;
    displayName?: string;
    description?: string;
}): ModelCategory | null;
/**
 * 动态从模型 ID 中提取数字版本号（完全自适应未来任意新版本，如 gemini-4, gemini-4.5 等）
 */
export declare function extractModelVersion(id: string): number;
/**
 * 动态计算模型排序权重（零硬编码，自适应版本号与规格层级）
 */
export declare function calculateModelScore(id: string, category: ModelCategory): number;
/**
 * 动态推导模型梯队与特征标签（彻底摒弃写死特定版本）
 */
export declare function determineModelTier(id: string, category: ModelCategory, isMaxVersion: boolean): ModelTier;
export declare function resolveGeminiApiKey(headerKey?: string): string;
/**
 * 从 Google 拉取可用模型列表（原生 SDK models.list，无任何本地兜底）：
 * 无 Key、请求失败、无可用语音模型一律抛错，由调用方如实展示。
 */
export declare function fetchRemoteModels(apiKey?: string): Promise<{
    models: ModelInfo[];
    source: 'remote' | 'fallback';
}>;
/**
 * 拉取指定模型详情（原生 SDK models.get，id 或 models/ 全名均可）。
 * tier 为非比较口径（单条无法判定是否最高版本），如需旗舰标记请走列表接口。
 */
export declare function fetchModelDetail(apiKey: string, modelId: string): Promise<ModelInfo>;
/**
 * 声音列表 100% 来自官方 Voices/ListVoices（原生 SDK ai.voices.list，无本地兜底）：
 * 自定义音色（prompted/replicated）在前，预置在后，均以远端返回为准。
 */
export declare function fetchRemoteVoices(apiKey?: string): Promise<VoiceInfo[]>;
/** 从远端取单条自定义音色详情（含 prompted 的 sample_audio 试听，原生 SDK ai.voices.get） */
export declare function getVoiceDetail(apiKey: string, id: string): Promise<any>;
export declare function deleteVoice(apiKey: string, id: string): Promise<{
    deleted: boolean;
}>;
export interface DesignedVoiceResult {
    id?: string;
    key?: string;
    displayName?: string;
    sampleAudioBase64?: string;
    sampleMime?: string;
    raw: any;
}
/** 自然语言设计音色（原生 SDK ai.voices.create，store=true 落盘，200 个/项目上限，1 年 TTL） */
export declare function designVoice(apiKey: string, opts: {
    input: string;
    displayName?: string;
    gender?: string;
    languageCode?: string;
    regionCode?: string;
    model?: string;
}): Promise<DesignedVoiceResult>;
/**
 * 声音复刻（原生 SDK ai.voices.create）：
 * source 10–30s 干净人声 + consent 同一人朗读授权声明（建议 24kHz 单声道 16-bit WAV）。
 */
export declare function replicateVoice(apiKey: string, opts: {
    displayName?: string;
    model?: string;
    store?: boolean;
    sourceAudioBase64: string;
    sourceMime?: string;
    consentAudioBase64: string;
    consentMime?: string;
}): Promise<DesignedVoiceResult>;
/**
 * 把双人剧本按 Speaker 1:/Speaker 2: 行拆成 part 数组。
 * API 强制要求：双人请求的每个文本 part 必须自带 speech_metadata.speaker，
 * 仅靠引导语文本是不够的（会报 INVALID_ARGUMENT）。
 * 无标记行归入上一个说话人（开头无标记则归 Speaker 1）。
 */
export declare function parseDialogueParts(text: string): Array<{
    speaker: string;
    text: string;
}>;
/** 是否为有效双人请求：开了开关 + 剧本含双方标记 + 音色不同 */
export declare function isDialogueRequest(params: TTSGenerateRequest): boolean;
/**
 * 执行 Gemini TTS 语音合成（原生 SDK 直调，无 REST 兜底：失败即抛错）
 */
export declare function generateTTSAudio(params: TTSGenerateRequest, apiKey: string, context?: {
    signal?: AbortSignal;
}): Promise<{
    audioBuffer: Buffer;
    mimeType: string;
}>;
/**
 * 流式语音合成（官方 generateContentStream）：
 * 边生成边通过 onChunk 回调 base64 PCM 分片（24kHz 单声道 16-bit），
 * 调用方负责拼 WAV / 实时播放。
 */
export declare function synthesizeGeminiStream(params: TTSGenerateRequest, apiKey: string, onChunk: (chunk: {
    audioBase64: string;
    mimeType: string;
}) => void | Promise<void>, context?: {
    signal?: AbortSignal;
}): Promise<{
    mimeType: string;
}>;
export declare const geminiProvider: TTSProvider;
