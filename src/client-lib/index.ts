export { createTTSClient } from './api';
export type { TTSClient, TTSClientOptions, ProviderSummary } from './api';
export type {
  UnifiedSynthesizeRequest, UnifiedSynthesizeSuccess, UnifiedSynthesizeFailure,
  UnifiedVoicePreference, UnifiedCredentials, ServiceErrorInfo,
  TTSBatchCreateInput, TTSBatchItemInput, NormalizedBatchCreateInput,
  TTSBatchItemResult, TTSBatchJobStatus,
} from './api';
export type { ModelInfo, VoiceInfo } from './api';
export { VoiceSettings } from './VoiceSettings';
export type { VoiceSettingsProps } from './VoiceSettings';

export {
  PcmStreamPlayer,
  audioChunksToBlob,
  base64ToBytes,
  parsePcmRate,
  pcmChunksToWavBlob,
  isRawPcmMime,
} from '../client/lib/audio';
