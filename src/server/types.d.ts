export interface TTSGenerateRequest {
    /** 留空默认 'gemini'，保持旧前端兼容 */
    provider?: string;
    text: string;
    voiceName?: string;
    model?: string;
    speechMetadata?: string;
    /** Azure speaking style, validated against the selected voice's StyleList. */
    style?: string;
    languageCode?: string;
    /** 透传给各家：语速/音调/格式等，适配器按需读取 */
    speed?: number;
    pitch?: number;
    format?: 'wav' | 'mp3' | 'pcm' | 'ogg';
    /** Azure 等需要 region：优先 body.region，其次服务端 AZURE_SPEECH_REGION */
    region?: string;
    /** Local OpenAI-compatible endpoint, e.g. http://127.0.0.1:8880/v1/audio/speech. Request overrides must be loopback. */
    endpoint?: string;
    /** Optional per-request credential for the local provider only. Never returned in responses. */
    apiKey?: string;
    /** 多人对话：[{ speaker: 'Speaker 1', voiceName: 'Kore' }]，2 人及以上走 multiSpeakerVoiceConfig */
    speakers?: Array<{
        speaker: string;
        voiceName: string;
    }>;
}
export type ModelCategory = 'tts' | 'live' | 'other';
export type ModelTier = 'flagship' | 'pro' | 'lite' | 'preview' | 'standard';
export interface ModelInfo {
    id: string;
    name: string;
    displayName: string;
    description: string;
    isTtsRecommended: boolean;
    category: ModelCategory;
    version?: number;
    tier?: ModelTier;
    provider?: string;
}
export interface VoiceInfo {
    id: string;
    name: string;
    description: string;
    gender?: 'female' | 'male' | 'neutral';
    tone?: string;
    provider?: string;
    /** Locale and styles are supplied when the upstream catalog exposes them (not guessed). */
    locale?: string;
    styles?: string[];
    /** 音色来源：prebuilt 官方预置 / prompted 自然语言设计 / replicated 声音复刻 */
    kind?: 'prebuilt' | 'prompted' | 'replicated' | 'custom';
}
