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
// 端口被占用（EADDRINUSE）时：先停掉旧进程再起
// PowerShell: Get-NetTCPConnection -LocalPort 3001 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
// 或换端口：$env:PORT=3002; bun run dev:server（前端代理会自动跟随 PORT，见 vite.config.ts）

export default {
  port,
  fetch: app.fetch,
};
