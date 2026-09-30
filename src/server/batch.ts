import { LocalTTSError } from './providers/local';

/**
 * 官方异步 Batch（仅 Gemini）：
 * 复用通用 Gemini Batch API，一批 GenerateContentRequest 走 model = gemini-3.8-flash-tts，
 * 每个 item 自带 AUDIO + speechConfig。异步 job 语义：创建后轮询，成功后逐项取音频。
 * 按 fifty-kana 这类“同一音色多文本”设计：共享默认值 + 逐项覆盖。
 */

export interface TTSBatchItemInput {
  /** 本条朗读文本（必填，单条 ≤20000 字，与单次合成一致） */
  text: string;
  /** 覆盖共享 voiceName（item 未填则用共享值） */
  voiceName?: string;
  /** 覆盖共享 speechMetadata（ turn 级风格） */
  speechMetadata?: string;
  /** 覆盖共享 languageCode */
  languageCode?: string;
  /** 调用方自定义 key，用于对齐结果（缺省为序号字符串） */
  key?: string;
}

export interface TTSBatchCreateInput {
  provider?: string;
  /** 必填，不做默认填充：如 gemini-3.8-flash-tts（Batch API Supported 以模型页为准） */
  model: string;
  /** 共享音色（item 可逐条覆盖；有效值缺失即 400） */
  voiceName?: string;
  /** 共享风格 */
  speechMetadata?: string;
  /** 共享语言 */
  languageCode?: string;
  /** Batch job 显示名（可选） */
  displayName?: string;
  items: TTSBatchItemInput[];
}

export interface NormalizedBatchCreateInput {
  model: string;
  voiceName: string;
  speechMetadata: string;
  languageCode: string;
  displayName: string;
  items: Array<{ text: string; voiceName: string; speechMetadata: string; languageCode: string; key: string }>;
}

export interface TTSBatchItemResult {
  key: string;
  ok: boolean;
  audioBase64?: string;
  mimeType?: string;
  error?: string;
}

export interface TTSBatchJobStatus {
  name: string;
  state: string;
  model?: string;
  displayName?: string;
  results?: TTSBatchItemResult[];
  rawState?: unknown;
}

/** 内联批量上限（官方 inline <20MB；服务端再设条数护栏，超限即 400） */
export const MAX_BATCH_ITEMS = 100;
const MAX_TEXT_LEN = 20000;

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 失败显式化：整单校验不过直接 400，不做任何静默跳过/默认填充 */
export function validateBatchCreateInput(value: unknown): NormalizedBatchCreateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalTTSError('E_TTS_INPUT', '请求体必须是 JSON 对象。', 400);
  }
  const body = value as Record<string, unknown>;
  const model = asString(body.model).trim();
  if (!model) throw new LocalTTSError('E_TTS_MODEL', '批量合成必须明确指定 model，不做默认填充。', 400);

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new LocalTTSError('E_TTS_INPUT', 'items 必须是非空数组。', 400);
  }
  if (items.length > MAX_BATCH_ITEMS) {
    throw new LocalTTSError('E_TTS_INPUT', `单批最多 ${MAX_BATCH_ITEMS} 条，当前 ${items.length} 条，请拆批提交。`, 400);
  }

  const sharedVoice = asString(body.voiceName).trim();
  const sharedStyle = asString(body.speechMetadata).trim();
  const sharedLang = asString(body.languageCode).trim();
  const displayName = asString(body.displayName).trim();

  const norm = items.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new LocalTTSError('E_TTS_INPUT', `items[${i}] 必须是对象。`, 400);
    }
    const it = raw as Record<string, unknown>;
    const text = asString(it.text);
    if (!text.trim() || text.length > MAX_TEXT_LEN) {
      throw new LocalTTSError('E_TTS_TEXT', `items[${i}] 文本不能为空，且不能超过 ${MAX_TEXT_LEN} 个字符。`, 400);
    }
    const voice = asString(it.voiceName).trim() || sharedVoice;
    if (!voice) {
      throw new LocalTTSError('E_TTS_VOICE', `items[${i}] 未指定有效音色（单条 voiceName 或共享 voiceName 必须给一个）。`, 400);
    }
    return {
      text,
      voiceName: voice,
      speechMetadata: asString(it.speechMetadata).trim() || sharedStyle,
      languageCode: asString(it.languageCode).trim() || sharedLang,
      key: asString(it.key).trim() || String(i),
    };
  });

  return { model, voiceName: sharedVoice, speechMetadata: sharedStyle, languageCode: sharedLang, displayName, items: norm };
}

/** 从单个 GenerateContentResponse 提取音频（无音频即返回 null，由调用方记为该项失败） */
export function extractBatchItemAudio(response: any): { audioBase64: string; mimeType: string } | null {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline = (p as any)?.inlineData;
    if (inline?.data) {
      return { audioBase64: inline.data, mimeType: inline.mimeType || 'audio/wav' };
    }
  }
  return null;
}

function jobErrorMessage(err: any): string {
  if (!err) return '批量子项合成失败';
  if (typeof err === 'string') return err;
  return err.message || err.code || JSON.stringify(err).slice(0, 300);
}

/** 归一化 job 查询结果：逐项 ok/audio/error 显式返回，不吞失败 */
export function normalizeBatchJob(job: any): TTSBatchJobStatus {
  const name = String(job?.name || '');
  const rawState = job?.state;
  const state = typeof rawState === 'string' ? rawState : String(rawState?.name || rawState || 'UNKNOWN');
  const out: TTSBatchJobStatus = { name, state, rawState };
  if (job?.model) out.model = String(job.model);
  if (job?.displayName) out.displayName = String(job.displayName);

  const inlined = job?.dest?.inlinedResponses;
  if (Array.isArray(inlined)) {
    out.results = inlined.map((r: any, i: number) => {
      const key = String(r?.metadata?.key ?? r?.metadata?.['key'] ?? i);
      if (r?.error) {
        return { key, ok: false as const, error: jobErrorMessage(r.error) };
      }
      if (r?.response) {
        const audio = extractBatchItemAudio(r.response);
        if (audio) return { key, ok: true as const, audioBase64: audio.audioBase64, mimeType: audio.mimeType };
        return { key, ok: false as const, error: '该项返回中未包含有效音频数据' };
      }
      return { key, ok: false as const, error: '该项暂无结果（job 可能尚未完成）' };
    });
  }
  return out;
}
