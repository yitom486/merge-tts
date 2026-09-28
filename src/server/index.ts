import { serveStatic } from 'hono/bun';
import { createTTSApp } from './app';

// 本项目独立部署入口：默认挂载 /api + 托管前端静态资源。
// 别的项目复用时直接 `import { createTTSApp } from 'gemini-tts-studio/server'`，见 app.ts。
const app = createTTSApp();

// 托管打包后的前端静态页面 (单体独立部署支持)
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.PORT) || 3001;

console.log(`[Gemini TTS Server] 正在以 Bun 原生服务启动在 http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
