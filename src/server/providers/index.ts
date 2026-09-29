import type { TTSProvider } from './types';
import { geminiProvider, resolveGeminiApiKey } from './gemini';
import { azureProvider } from './azure';
import { localProvider } from './local';

const registry = new Map<string, TTSProvider>();

/** 新厂商在此注册一行即可，例如 registerProvider(azureProvider) */
export function registerProvider(provider: TTSProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id?: string): TTSProvider {
  const pid = (id || 'gemini').toLowerCase();
  const found = registry.get(pid);
  if (!found) {
    throw new Error(`未知 TTS Provider: ${id}，可用: ${listProviders().map(p => p.id).join(', ')}`);
  }
  return found;
}

export function listProviders(): Array<{ id: string; displayName: string; defaultModel?: string; defaultVoice?: string }> {
  return [...registry.values()].map(p => ({
    id: p.id,
    displayName: p.displayName,
    defaultModel: p.defaultModel,
    defaultVoice: p.defaultVoice,
  }));
}

/**
 * 通用 Key 解析：优先 `x-{provider}-api-key`，
 * 兼容旧前端的 `x-gemini-api-key`，最后走各家 resolveApiKey（读环境变量）。
 */
export function resolveProviderApiKey(providerId: string, ...headerKeys: Array<string | undefined>): string {
  for (const h of headerKeys) {
    if (h && h.trim() !== '') return h.trim();
  }
  const provider = getProvider(providerId);
  if (provider.resolveApiKey) {
    return provider.resolveApiKey(undefined);
  }
  return '';
}

// 内置注册
registerProvider(geminiProvider);
registerProvider(azureProvider);
registerProvider(localProvider);

// 兼容旧 import 路径：让 tts-service.ts 可以薄转发
export { resolveGeminiApiKey };
