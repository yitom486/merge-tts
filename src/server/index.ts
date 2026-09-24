import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import { fetchRemoteModels, fetchRemoteVoices, generateTTSAudio } from './tts-service';
import type { TTSGenerateRequest } from './types';

const app = new Hono();

// 中间件：日志与 CORS
app.use('*', logger());
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://localhost:3001'],
  allowHeaders: ['Content-Type', 'x-gemini-api-key'],
  exposeHeaders: ['Content-Type', 'Content-Disposition'],
}));


/**
 * 提取 API Key（请求头优先，其次是本地环境变量）
 */
function resolveApiKey(headerKey?: string): string {
  return (headerKey && headerKey.trim() !== '') ? headerKey.trim() : (process.env.GEMINI_API_KEY || '').trim();
}

/**
 * GET /api/health
 * 健康检查与密钥状态探测（绝对不向客户端泄露 Key 内容）
 */
app.get('/api/health', (c) => {
  const serverKeyExists = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  return c.json({
    status: 'ok',
    hasServerKey: serverKeyExists,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/models
 * 动态拉取模型列表（坚决不硬编码，通过 Google 接口或动态元数据获取）
 */
app.get('/api/models', async (c) => {
  const clientKey = c.req.header('x-gemini-api-key');
  const apiKey = resolveApiKey(clientKey);

  try {
    const result = await fetchRemoteModels(apiKey);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error?.message || '拉取模型列表失败' }, 500);
  }
});

/**
 * GET /api/voices
 * 动态拉取可用声音列表
 */
app.get('/api/voices', async (c) => {
  const clientKey = c.req.header('x-gemini-api-key');
  const apiKey = resolveApiKey(clientKey);

  try {
    const voices = await fetchRemoteVoices(apiKey);
    return c.json({ voices });
  } catch (error: any) {
    return c.json({ error: error?.message || '获取声音列表失败' }, 500);
  }
});

/**
 * POST /api/tts/generate
 * 核心语音生成接口：返回纯二进制 WAV 音频流
 */
app.post('/api/tts/generate', async (c) => {
  const clientKey = c.req.header('x-gemini-api-key');
  const apiKey = resolveApiKey(clientKey);

  if (!apiKey) {
    return c.json({
      error: '缺少 Gemini API Key。请在控制台设置弹窗中输入您的 API Key，或在服务端 .env 中配置 GEMINI_API_KEY。',
    }, 401);
  }

  let body: TTSGenerateRequest;
  try {
    body = await c.req.json<TTSGenerateRequest>();
  } catch {
    return c.json({ error: '无效的 JSON 请求体' }, 400);
  }

  if (!body.text || body.text.trim().length === 0) {
    return c.json({ error: '朗读文本不能为空' }, 400);
  }

  try {
    const { audioBuffer, mimeType } = await generateTTSAudio(body, apiKey);

    // 直接输出二进制 WAV 音频流
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': 'inline; filename="gemini-speech.wav"',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('TTS 生成失败:', error);
    return c.json({ error: error?.message || '生成音频失败' }, 500);
  }
});

// 托管打包后的前端静态页面 (单体独立部署支持)
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.PORT) || 3001;

console.log(`[Gemini TTS Server] 正在以 Bun 原生服务启动在 http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
