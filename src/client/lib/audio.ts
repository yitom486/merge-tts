/**
 * 浏览器端 PCM 音频工具（Gemini 流式合成配套）。
 *
 * 服务端 `/api/tts/stream` 下发的是 base64 编码的原始 PCM 分片
 *（16-bit signed LE 单声道，mime 如 `audio/L16;codec=pcm;rate=24000`），
 * 这里负责：base64 解码、采样率解析、拼 WAV、首包即播。
 */

/** base64（纯串或 data URL 均可）-> 原始字节 */
export function base64ToBytes(base64: string): Uint8Array {
  let clean = (base64 || '').trim();
  const comma = clean.indexOf(',');
  // 兼容 data:audio/wav;base64,xxxx 形式
  if (clean.startsWith('data:') && comma >= 0) {
    clean = clean.slice(comma + 1);
  }
  clean = clean.replace(/\s+/g, '');
  if (!clean) return new Uint8Array(0);

  if (typeof atob !== 'undefined') {
    let binary: string;
    try {
      binary = atob(clean);
    } catch {
      throw new Error('音频分片 base64 解码失败：服务端返回的数据不是合法 base64');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // 非浏览器环境（单测 / SSR）降级：Node Buffer
  const buf =
    typeof Buffer !== 'undefined'
      ? Buffer.from(clean, 'base64')
      : (() => {
          throw new Error('当前环境不支持 base64 解码');
        })();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** 从 mimeType 里解析采样率，解析失败一律回落 24000（Gemini 默认） */
export function parsePcmRate(mimeType?: string | null): number {
  if (!mimeType) return 24000;
  const m = /rate\s*=\s*(\d+)/i.exec(mimeType);
  if (m && m[1]) {
    const rate = parseInt(m[1], 10);
    if (Number.isFinite(rate) && rate >= 8000 && rate <= 96000) return rate;
  }
  return 24000;
}

/** 多个原始 PCM16LE 分片 -> 单个 WAV Blob（单声道 16-bit） */
export function pcmChunksToWavBlob(chunks: Uint8Array[], sampleRate: number): Blob {
  const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? Math.floor(sampleRate) : 24000;
  let total = 0;
  for (const c of chunks) total += c.length;

  const buffer = new ArrayBuffer(44 + total);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + total, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byteRate = rate * channels * bytesPerSample
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  writeAscii(36, 'data');
  view.setUint32(40, total, true);

  const out = new Uint8Array(buffer, 44);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * 是否为原始 PCM 分片（Gemini 真流式下发）：
 * mime 如 `audio/L16;codec=pcm;rate=24000` / `audio/pcm`。
 * Azure / 本地服务的单包降级下发的是完整音频文件
 *（`audio/wav` / `audio/mpeg` / `audio/ogg`），绝不能再包一层 WAV 头。
 */
export function isRawPcmMime(mimeType?: string | null): boolean {
  if (!mimeType) return true; // 历史默认即 PCM，保持兼容
  const m = mimeType.toLowerCase();
  return m.includes('l16') || m.includes('pcm');
}

/**
 * 按 mime 把 SSE 音频分片拼成可播放/下载的 Blob：
 * - 原始 PCM -> 包 WAV 头（单声道 16-bit）；
 * - 完整文件（wav/mp3/ogg…）-> 直接拼接字节，不做任何二次封装。
 */
export function audioChunksToBlob(
  chunks: Uint8Array[],
  mimeType: string,
  sampleRate: number
): Blob {
  if (!chunks || chunks.length === 0) {
    throw new Error('未收到任何音频分片，无法拼装音频');
  }
  if (isRawPcmMime(mimeType)) {
    return pcmChunksToWavBlob(chunks, sampleRate);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  const type = (mimeType || '').split(';', 1)[0].trim() || 'application/octet-stream';
  return new Blob([out.buffer as ArrayBuffer], { type });
}

/**
 * 流式 PCM 播放器：首包即播，后续分片无缝续播。
 *
 * 用法与 useTTS.ts 保持一致：
 * ```ts
 * const player = new PcmStreamPlayer(24000);
 * await player.resume();
 * player.pushChunk(bytes);
 * player.playedSeconds; // 已播放秒数，用于 UI 进度
 * await player.close();
 * ```
 */
export class PcmStreamPlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private startTime = 0;
  private totalDuration = 0;
  private closed = false;

  constructor(private readonly sampleRate: number = 24000) {}

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        typeof window !== 'undefined'
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!Ctor) {
        throw new Error('当前浏览器不支持 Web Audio 播放');
      }
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    if (this.closed) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (this.nextTime === 0) {
      this.nextTime = ctx.currentTime + 0.05;
      this.startTime = this.nextTime;
    }
  }

  async pause(): Promise<void> {
    if (this.closed) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'running') {
      await ctx.suspend();
    }
  }

  get isPaused(): boolean {
    return this.ctx?.state === 'suspended';
  }

  pushChunk(bytes: Uint8Array): void {
    if (this.closed || !bytes || bytes.length === 0) return;
    const ctx = this.ensureContext();
    // 允许 resume() 之前先 push：自动初始化播放时钟，避免首包静默丢失
    if (this.nextTime === 0) {
      this.nextTime = ctx.currentTime + 0.05;
      this.startTime = this.nextTime;
    }
    // PCM16LE -> Float32（长度非偶数时丢弃末尾孤字节）
    const frames = Math.floor(bytes.length / 2);
    if (frames === 0) return;
    const buffer = ctx.createBuffer(1, frames, this.sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, frames * 2);
    for (let i = 0; i < frames; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(this.nextTime, ctx.currentTime);
    if (this.startTime === 0) this.startTime = startAt;
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.totalDuration += buffer.duration;
  }

  /** 已播放秒数（用于流式进度展示） */
  get playedSeconds(): number {
    if (!this.ctx || this.startTime === 0) return 0;
    const elapsed = this.ctx.currentTime - this.startTime;
    if (elapsed <= 0) return 0;
    return Math.min(elapsed, this.totalDuration);
  }

  async close(): Promise<void> {
    this.closed = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.nextTime = 0;
    this.startTime = 0;
    this.totalDuration = 0;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // 忽略关闭时的竞态错误
      }
    }
  }
}
