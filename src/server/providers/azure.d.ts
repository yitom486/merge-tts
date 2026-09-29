import type { ModelInfo, TTSGenerateRequest, VoiceInfo } from '../types';
import type { TTSProvider } from './types';
export declare function resolveAzureApiKey(headerKey?: string): string;
/** region 只认三处：请求参数 > 环境变量，都没有就抛错（不再默认 eastus） */
export declare function resolveAzureRegion(explicit?: string): string;
export declare function buildAzureSSML(text: string, voiceName: string, opts?: {
    speed?: number;
    pitch?: number;
    languageCode?: string;
    style?: string;
}): string;
/** Azure 没有“模型”概念：合成只认音色，返回空列表，前端展示“无需选择模型” */
export declare function listAzureModels(): Promise<{
    models: ModelInfo[];
    source: 'remote' | 'fallback';
}>;
export declare function listAzureVoices(apiKey?: string, region?: string, context?: {
    signal?: AbortSignal;
}): Promise<VoiceInfo[]>;
/** 去掉 Gemini 风格的行内表演标签（Azure 会照字念出 [laughs]，必须预处理） */
export declare function stripPerformanceTags(text: string): string;
export declare function synthesizeAzure(params: TTSGenerateRequest, apiKey: string, explicitRegion?: string, context?: {
    signal?: AbortSignal;
}): Promise<{
    audioBuffer: Buffer;
    mimeType: string;
}>;
export declare const azureProvider: TTSProvider;
