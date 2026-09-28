/**
 * 兼容层：旧 import './tts-service' 继续可用。
 * 新代码请直接 `import { getProvider } from './providers'`。
 */
export {
  DEFAULT_VOICES,
  extractModelVersion,
  calculateModelScore,
  determineModelTier,
  fetchRemoteModels,
  fetchRemoteVoices,
  generateTTSAudio,
} from './providers/gemini';
