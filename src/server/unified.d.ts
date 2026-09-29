import type { TTSProvider } from './providers/types';
/**
 * 统一合成接口（给 Lingua Studio 这类嵌入调用方）：
 * 调用方只描述“读什么、什么语言、什么用途、想要什么声音、首选哪个服务、凭证在哪”，
 * 模型发现、音色解析与选择、超时取消全部由包负责。
 * 调用方永远不需要填写厂商专属的默认模型或默认音色。
 */
export interface UnifiedVoicePreference {
    /** 直接指定音色 ID（优先于一切筛选） */
    voiceId?: string;
    gender?: 'female' | 'male' | 'neutral';
    /** 按 tone/描述子串匹配（如 'Warm'），最佳努力 */
    tone?: string;
}
export interface UnifiedCredentials {
    geminiApiKey?: string;
    azureKey?: string;
    azureRegion?: string;
    localBaseUrl?: string;
    localApiKey?: string;
}
export interface UnifiedSynthesizeRequest {
    text: string;
    language?: string;
    /** 朗读用途（如 narration / dialogue / announcement），Gemini 下透传为风格指令 */
    purpose?: string;
    voicePreference?: UnifiedVoicePreference;
    /** 首选服务，缺省 'gemini'；失败时只允许兜底到本地 TTS */
    preferredService?: string;
    /** 可选覆盖；缺省由包内解析（Gemini 取版本最高 TTS 模型，本地取发现首个模型） */
    model?: string;
    format?: 'wav' | 'mp3';
    timeoutMs?: number;
    credentials?: UnifiedCredentials;
}
export interface ServiceErrorInfo {
    provider: string;
    message: string;
}
export interface UnifiedSynthesizeSuccess {
    ok: true;
    audioBase64: string;
    mimeType: string;
    provider: string;
    voice: string;
    model?: string;
    language?: string;
    usedFallback: boolean;
    /** usedFallback 为 true 时必带：首选服务的安全错误信息 */
    preferredError?: ServiceErrorInfo;
    warnings?: string[];
}
export interface UnifiedSynthesizeFailure {
    ok: false;
    preferredError: ServiceErrorInfo;
    /** 首选即本地或无需兜底时为 null */
    fallbackError: ServiceErrorInfo | null;
}
/** 结构化失败： HTTP 层据此返回 400（调用方问题）或 500（合成失败） */
export declare class UnifiedSynthesisError extends Error {
    readonly failure: UnifiedSynthesizeFailure;
    readonly status: 400 | 500;
    constructor(failure: UnifiedSynthesizeFailure, status?: 400 | 500);
}
export interface UnifiedDeps {
    /** 默认用全局注册表；测试可注入独立厂商表（不污染全局） */
    providers?: TTSProvider[];
}
export interface UnifiedCallOptions {
    /** 请求头（x-{provider}-api-key 等，优先级高于 body credentials） */
    headers?: Record<string, string | undefined>;
    /** 调用方取消信号；与超时信号合并 */
    signal?: AbortSignal;
    deps?: UnifiedDeps;
}
export declare function synthesizeUnified(input: UnifiedSynthesizeRequest, opts?: UnifiedCallOptions): Promise<UnifiedSynthesizeSuccess>;
