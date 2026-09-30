import type {
  UnifiedSynthesizeRequest, UnifiedSynthesizeSuccess, UnifiedSynthesizeFailure,
} from '../server/unified';
import type { ModelInfo, VoiceInfo } from '../server/types';
import type { TTSBatchCreateInput, TTSBatchJobStatus } from '../server/batch';

export type {
  UnifiedSynthesizeRequest, UnifiedSynthesizeSuccess, UnifiedSynthesizeFailure,
  UnifiedVoicePreference, UnifiedCredentials, ServiceErrorInfo,
} from '../server/unified';
export type { ModelInfo, VoiceInfo } from '../server/types';
export type {
  TTSBatchCreateInput, TTSBatchItemInput, NormalizedBatchCreateInput,
  TTSBatchItemResult, TTSBatchJobStatus,
} from '../server/batch';

export interface TTSClientOptions {
  /** 服务根地址，默认 ''（同源） */
  baseUrl?: string;
  /** 静态头或动态头（含 x-{provider}-api-key 等凭证） */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** 路由前缀，默认 '/api'（与 createTTSApp 的 prefix 对应） */
  prefix?: string;
}

export interface ProviderSummary {
  id: string;
  displayName: string;
  defaultModel?: string;
  defaultVoice?: string;
}

async function throwForResponse(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error((data as any).error || `${fallback} (${res.status})`);
}

/** 无头客户端：Lingua Studio 这类宿主用它调包内全部能力，自行渲染 UI */
export function createTTSClient(options: TTSClientOptions = {}) {
  const base = (options.baseUrl || '').replace(/\/+$/, '');
  const prefix = `/${(options.prefix || 'api').replace(/^\/+/, '')}`;
  const resolveHeaders = (json: boolean): Record<string, string> => {
    const extra = typeof options.headers === 'function' ? options.headers() : (options.headers || {});
    return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...extra };
  };
  const url = (path: string) => `${base}${prefix}${path}`;

  return {
    async getProviders(): Promise<ProviderSummary[]> {
      const res = await fetch(url('/providers'), { headers: resolveHeaders(false) });
      if (!res.ok) await throwForResponse(res, '获取厂商列表失败');
      return ((await res.json()) as any).providers || [];
    },

    async getModels(provider: string, region?: string): Promise<{ models: ModelInfo[]; source: string }> {
      const q = `?provider=${encodeURIComponent(provider)}${region ? `&region=${encodeURIComponent(region)}` : ''}`;
      const res = await fetch(url(`/models${q}`), { headers: resolveHeaders(false) });
      if (!res.ok) await throwForResponse(res, '获取模型列表失败');
      return (await res.json()) as any;
    },

    async getVoices(provider: string, region?: string): Promise<VoiceInfo[]> {
      const q = `?provider=${encodeURIComponent(provider)}${region ? `&region=${encodeURIComponent(region)}` : ''}`;
      const res = await fetch(url(`/voices${q}`), { headers: resolveHeaders(false) });
      if (!res.ok) await throwForResponse(res, '获取声音列表失败');
      return (((await res.json()) as any).voices || []) as VoiceInfo[];
    },

    /** 统一合成：成功 resolve（含 usedFallback），双失败 reject（结构化双原因） */
    async synthesizeUnified(input: UnifiedSynthesizeRequest, signal?: AbortSignal): Promise<UnifiedSynthesizeSuccess> {
      const res = await fetch(url('/tts/unified'), {
        method: 'POST',
        headers: resolveHeaders(true),
        body: JSON.stringify(input),
        signal,
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || data.ok === false) {
        const err: any = new Error(data.preferredError?.message || `统一合成失败 (${res.status})`);
        err.failure = data as UnifiedSynthesizeFailure;
        err.status = res.status;
        throw err;
      }
      return data as UnifiedSynthesizeSuccess;
    },

    async designVoice(input: {
      input: string; displayName?: string; gender?: string; languageCode?: string; model?: string;
    }): Promise<{ id?: string; displayName?: string; sampleAudio: { data: string; mimeType: string } | null }> {
      const res = await fetch(url('/voices/design'), {
        method: 'POST', headers: resolveHeaders(true), body: JSON.stringify(input),
      });
      if (!res.ok) await throwForResponse(res, '设计音色失败');
      return (await res.json()) as any;
    },

    async deleteVoice(id: string): Promise<{ deleted: boolean }> {
      const res = await fetch(url(`/voices/${encodeURIComponent(id)}`), {
        method: 'DELETE', headers: resolveHeaders(false),
      });
      if (!res.ok) await throwForResponse(res, '删除音色失败');
      return (await res.json()) as any;
    },

    /** 官方异步批量：建 job（返回 { name, state }，调用方轮询 getBatchJob） */
    async createBatchJob(input: TTSBatchCreateInput): Promise<{ name: string; state: string; model?: string; displayName?: string }> {
      const res = await fetch(url('/tts/batch-jobs'), {
        method: 'POST', headers: resolveHeaders(true), body: JSON.stringify(input),
      });
      if (!res.ok) await throwForResponse(res, '创建批量任务失败');
      return (await res.json()) as any;
    },

    /** 轮询批量任务（name 含斜杠，已做编码；完成时带逐项 results） */
    async getBatchJob(name: string, provider = 'gemini'): Promise<TTSBatchJobStatus> {
      const res = await fetch(url(`/tts/batch-jobs?name=${encodeURIComponent(name)}&provider=${encodeURIComponent(provider)}`), {
        headers: resolveHeaders(false),
      });
      if (!res.ok) await throwForResponse(res, '查询批量任务失败');
      return (await res.json()) as any;
    },

    async cancelBatchJob(name: string, provider = 'gemini'): Promise<{ name: string; cancelled: boolean }> {
      const res = await fetch(url('/tts/batch-jobs/cancel'), {
        method: 'POST', headers: resolveHeaders(true), body: JSON.stringify({ name, provider }),
      });
      if (!res.ok) await throwForResponse(res, '取消批量任务失败');
      return (await res.json()) as any;
    },
  };
}

export type TTSClient = ReturnType<typeof createTTSClient>;
