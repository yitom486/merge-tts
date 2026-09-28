import type { ModelInfo, TTSGenerateRequest, VoiceInfo } from '../types';

/**
 * 通用 TTS 适配器接口
 * 新增厂商只需实现该接口并在 providers/index.ts 注册即可，
 * 前端与 Hono 路由无需改动。
 */
export interface TTSProvider {
  /** 唯一标识，如 'gemini' | 'azure' | 'alibaba' | 'volcengine' | 'openai' */
  id: string;
  displayName: string;

  listModels(apiKey?: string, region?: string): Promise<{ models: ModelInfo[]; source: 'remote' | 'fallback' }>;
  listVoices(apiKey?: string, region?: string): Promise<VoiceInfo[]>;
  synthesize(
    params: TTSGenerateRequest,
    apiKey: string
  ): Promise<{ audioBuffer: Buffer; mimeType: string }>;

  /**
   * 流式合成（可选）：逐分片回调 base64 音频。
   * 未实现时路由自动降级为一次性合成后单包下发，前端同一套 SSE 解析即可。
   */
  synthesizeStream?: (
    params: TTSGenerateRequest,
    apiKey: string,
    onChunk: (chunk: { audioBase64: string; mimeType: string }) => void | Promise<void>
  ) => Promise<{ mimeType: string }>;

  /** 各家 Key 解析规则，默认读 `x-{id}-api-key` + 同名环境变量 */
  resolveApiKey?: (headerKey?: string) => string;

  defaultModel?: string;
  defaultVoice?: string;
}
