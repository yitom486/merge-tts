import type { TTSProvider } from './types';
import { resolveGeminiApiKey } from './gemini';
/** 新厂商在此注册一行即可，例如 registerProvider(azureProvider) */
export declare function registerProvider(provider: TTSProvider): void;
export declare function getProvider(id?: string): TTSProvider;
export declare function listProviders(): Array<{
    id: string;
    displayName: string;
    defaultModel?: string;
    defaultVoice?: string;
}>;
/**
 * 通用 Key 解析：优先 `x-{provider}-api-key`，
 * 兼容旧前端的 `x-gemini-api-key`，最后走各家 resolveApiKey（读环境变量）。
 */
export declare function resolveProviderApiKey(providerId: string, ...headerKeys: Array<string | undefined>): string;
export { resolveGeminiApiKey };
