import type { ModelInfo, TTSGenerateRequest, VoiceInfo } from '../types';
import type { NormalizedBatchCreateInput, TTSBatchJobStatus } from '../batch';

/**
 * 通用 TTS 适配器接口
 * 新增厂商只需实现该接口并在 providers/index.ts 注册即可，
 * 前端与 Hono 路由无需改动。
 */
export interface TTSProvider {
  /** 唯一标识，如 'gemini' | 'azure' | 'alibaba' | 'volcengine' | 'openai' */
  id: string;
  displayName: string;
  /** Local providers can be called without a key. */
  requiresApiKey?: boolean;

  listModels(apiKey?: string, region?: string): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }>;
  listVoices(apiKey?: string, region?: string): Promise<VoiceInfo[]>;
  /** 拉取指定模型详情（可选，未实现时路由返回 400） */
  getModelDetail?(apiKey: string, modelId: string): Promise<ModelInfo>;
  synthesize(
    params: TTSGenerateRequest,
    apiKey: string,
    context?: { signal?: AbortSignal }
  ): Promise<{ audioBuffer: Buffer; mimeType: string }>;

  /**
   * 流式合成（可选）：逐分片回调 base64 音频。
   * 未实现时路由自动降级为一次性合成后单包下发，前端同一套 SSE 解析即可。
   */
  synthesizeStream?: (
    params: TTSGenerateRequest,
    apiKey: string,
    onChunk: (chunk: { audioBase64: string; mimeType: string }) => void | Promise<void>,
    context?: { signal?: AbortSignal }
  ) => Promise<{ mimeType: string }>;

  /** 各家 Key 解析规则，默认读 `x-{id}-api-key` + 同名环境变量 */
  resolveApiKey?: (headerKey?: string) => string;

  /**
   * 官方异步 Batch（可选）：未实现时路由返回 400，绝不静默降级为并发扇出。
   * B 语义 = 建 job → 轮询 → 逐项取音频，便宜 50% 但小时级。
   */
  createBatchJob?: (apiKey: string, input: NormalizedBatchCreateInput) => Promise<{ name: string; state: string; model?: string; displayName?: string }>;
  getBatchJob?: (apiKey: string, name: string) => Promise<TTSBatchJobStatus>;
  cancelBatchJob?: (apiKey: string, name: string) => Promise<{ name: string; cancelled: boolean }>;

  defaultModel?: string;
  defaultVoice?: string;
}
