# Merge TTS · 通用语音合成服务与工作台

基于 **Bun + Hono + React** 的多厂商 TTS 服务：Google Gemini（流式/双人/自定义音色）、Azure Speech，以及本地 OpenAI 兼容 TTS 服务（例如 Piper/Kokoro），附带一个录音棚风格的 Web 工作台。

- 后端可独立部署，也可作为 npm 包（`gemini-tts-studio/server`）被其他项目直接挂载。
- 新增 TTS 厂商只需实现 `TTSProvider` 接口并注册一行，无需改路由与前端。

## 快速开始

```bash
bun install

# 配置密钥（二选一：弹窗填写存浏览器，或写 .env）
cp .env.example .env   # GEMINI_API_KEY / AZURE_SPEECH_KEY / AZURE_SPEECH_REGION

bun run dev            # 后端 :3001 + 前端 :5173
```

| 命令 | 说明 |
|---|---|
| `bun run dev` | 前后端联调 |
| `bun run dev:server` / `dev:client` | 单独起后端 / 前端 |
| `bun run build` | 打包前端到 `dist/` |
| `bun start` | 生产启动（含静态托管） |
| `bun run build:lib` | 打包可发布的 server 库到 `lib/` |

## 环境变量

| 变量 | 说明 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio Key（Gemini 全功能必需） |
| `AZURE_SPEECH_KEY` | Azure Speech Key（Azure 通道必需，与区域同区） |
| `AZURE_SPEECH_REGION` | 如 `japaneast`、`eastus`（必须与 Key 同区） |
| `LOCAL_TTS_ENDPOINT` | 本地服务 `/v1` 或 `/v1/audio/speech` 地址；也可每次请求传 `endpoint` |
| `LOCAL_TTS_MODEL` | 本地服务默认模型；请求 `model` 可覆盖 |
| `LOCAL_TTS_API_KEY` | 本地服务可选 Key；无鉴权的回环服务可留空 |
| `LOCAL_TTS_VOICES` | 本地服务缺少 `/v1/audio/voices` 时可选的逗号分隔音色 ID |
| `PORT` | 后端端口，默认 `3001` |

前端弹窗填写的 Key 存 `localStorage`，请求时经 `x-{provider}-api-key` 头发送，优先级高于服务端 `.env`。

## HTTP API（默认前缀 `/api`）

通用约定：`provider` 缺省为 `gemini`（query / body / `x-tts-provider` 头均可传）；Key 缺失返回 `401`，未知厂商返回 `400`。

### 健康与发现

```bash
GET /api/health                        # { status, hasServerKey, providers: { gemini, azure, local }, timestamp }
GET /api/providers                     # 已注册厂商及默认模型/音色
GET /api/models?provider=gemini        # 动态模型列表（Gemini 经原生 SDK 实时拉取；Azure 无模型概念，返回空列表）
GET /api/models/gemini-3.8-flash-tts   # 指定模型详情（原生 SDK models.get）
GET /api/voices?provider=azure&region=japaneast
GET /api/models?provider=local&endpoint=http://127.0.0.1:8880/v1
GET /api/voices?provider=local&endpoint=http://127.0.0.1:8880/v1
```

失败显式化：需要 Key 的服务缺 Key 返回 `401`，未知厂商/缺参返回 `400`；合成和发现接口的错误为 `{ "error": "可读说明", "code": "E_...", "retryable": false }`。密钥和上游错误原文不会写入合成错误响应。Gemini 合成缺 `text` / `voiceName` / `model` 直接拒绝；从动态发现接口选择可用值。

### 语音合成

```bash
# 一次性：返回纯二进制音频（wav/mp3）
POST /api/tts/generate
Content-Type: application/json
x-gemini-api-key: <key>                # 或 x-azure-api-key

{
  "provider": "gemini",
  "text": "Hello! [laughs] 真好听",
  "voiceName": "Puck",
  "model": "gemini-3.8-flash-tts",
  "speechMetadata": "cheerful",
  "languageCode": "en-us",             # 仅 Gemini
  "region": "japaneast",               # 仅 Azure
  "style": "cheerful",               # 仅 Azure；必须在所选音色 StyleList 中
  "speakers": [                        # 仅 Gemini：双人对话（剧本须含 Speaker 1:/2: 标记）
    { "speaker": "Speaker 1", "voiceName": "Puck" },
    { "speaker": "Speaker 2", "voiceName": "Kore" }
  ]
}
```

本地服务使用同一路由，`provider` 为 `local`。请求可传完整回环地址、请求级 Key、模型、音色和语速：

```json
{
  "provider": "local",
  "endpoint": "http://127.0.0.1:8880/v1/audio/speech",
  "apiKey": "optional-local-key",
  "model": "kokoro",
  "voiceName": "ja-female",
  "text": "こんにちは",
  "speed": 1.1,
  "format": "mp3"
}
```

请求中的 `endpoint` 只接受 `localhost`、`127.0.0.1` 或 `[::1]`；服务器可信环境变量或 `createLocalTTSProvider` 配置可指向其他网络地址。请求级 `apiKey` 优先于 `x-{provider}-api-key`、`x-provider-api-key` 和环境变量，仅用于服务端转发。`GET /models` 查询本地 `/v1/models`，`GET /voices` 查询 `/v1/audio/voices`；后者不是 OpenAI 标准接口，缺失时设置 `LOCAL_TTS_VOICES`，不要虚构音色。流式路由对本地服务返回单包 SSE，MIME 为上游实际音频格式。

```bash
# 流式（SSE）：首包即播；Azure 自动降级为单包，前端同一套解析
POST /api/tts/stream
# 事件：data: {"audio":"<base64 PCM>","mimeType":"audio/L16;codec=pcm;rate=24000"}
# 收尾：data: {"done":true,"mimeType":"..."}   出错：data: {"error":"..."}
```

双人对话规则：剧本每行以 `Speaker 1:` / `Speaker 2:` 开头；未检测到双方标记时自动降级单人。`voice_` / `voicekey_` 开头的自定义音色 ID 可直接填入 `voiceName`。

### 自定义音色（仅 Gemini）

```bash
# 自然语言设计音色（返回 id + 可直接试听的 sampleAudio）
POST /api/voices/design
{ "input": "A warm narrator in his 40s with a British accent",
  "displayName": "My Narrator", "gender": "male", "languageCode": "en-GB" }

# 声音复刻（base64 音频；source 10–30s 干净人声 + 同一人授权声明朗读，建议 24kHz WAV）
POST /api/voices/replicate
{ "displayName": "Me", "store": true,
  "sourceAudio": "<base64>", "sourceMime": "audio/wav",
  "consentAudio": "<base64>", "consentMime": "audio/wav" }
# 授权声明原文："I am the owner of this voice and I consent to Google using
#  this voice to create a synthetic voice model."

GET    /api/voices/:id    # 自定义音色详情（含 prompted 试听小样）
DELETE /api/voices/:id    # 删除自定义音色（200 个/项目上限，1 年 TTL）
```

## 作为库被其他项目使用

只需要打包 server 部分（`bun run build:lib` → `lib/`，已在 `package.json` 的 `exports` / `files` 中配好，`npm publish` 即带走；前端 React 代码不进包）。

```bash
npm i gemini-tts-studio
```

```ts
import { createTTSApp, registerProvider, createLocalTTSProvider } from 'gemini-tts-studio/server';
import type { TTSProvider } from 'gemini-tts-studio/server';

// 挂载到自己的 Hono/Bun 服务，任意前缀
const app = createTTSApp({ prefix: '/tts-engine', corsOrigins: false, enableLogger: false });

export default { port: 3001, fetch: app.fetch };
```

已有 Hono Gateway 可用 `gateway.route('/', app)` 挂载，完整路径为 `/tts-engine/tts/generate` 等，无需另起端口或开启 CORS。`createTTSApp` 选项：`prefix`（默认 `/api`）、`corsOrigins`（`false` 关闭 CORS）、`extraAllowHeaders`、`enableLogger`、`extraProviders`、`defaultProvider`。同时导出 `getProvider / listProviders / geminiProvider / azureProvider / localProvider / createLocalTTSProvider` 及全部类型。

自定义厂商最小实现：

```ts
const myProvider: TTSProvider = {
  id: 'mytts',
  displayName: 'My TTS',
  defaultModel: 'my-1',
  defaultVoice: 'my-voice',
  listModels: async () => ({ models: [...], source: 'fallback' }),
  listVoices: async () => [...],
  synthesize: async (params, apiKey) => ({ audioBuffer, mimeType }),
  synthesizeStream: async (params, apiKey, onChunk) => ({ mimeType }), // 可选
};
```

## 厂商差异速览

| | Gemini | Azure | Local |
|---|---|---|
| 流式 | 真流式（首包即播） | REST 单包，服务端自动降级，前端同一套解析 | 单包 SSE |
| 语言 | `languageCode` 全局切换 | 语言由音色决定（`zh-CN-*` 中文），无全局切换 | 由模型/音色决定 |
| 风格/标签 | `speechMetadata` + `[laughs]` 行内标签 | `style` 经音色 StyleList 验证；`[..]` 标签服务端自动去掉 | 由本地服务决定 |
| 免费额度 | AI Studio 免费测试层 | F0 每月 50 万字符 |
| Key | AI Studio API Key | Speech Key，且必须与区域同区 | 可选 |

## 发布

`package.json` 已就绪（`exports`/`files`/`prepublishOnly`），仓库 Actions 在 Release 发布时自动 `build:lib` 并 `npm publish`（需在仓库 Secrets 配 `NPM_TOKEN`）。发新版前先 bump `version`。

### 0.1.0 → 0.2.0

现有 `gemini-tts-studio/server` 导出及 Gemini/Azure 路由保持可用。新增 `local` provider、请求体 `apiKey` / `endpoint` / Azure `style`、Azure 音色 `locale` / `styles`，合成与发现错误增加 `code` 和 `retryable` 字段。请继续读取 `error` 字段向用户展示；Gemini 的模型和音色仍需先动态发现并在合成请求中明确传入。

## 许可证

MIT，见 [LICENSE](./LICENSE)。

## 目录结构

```text
src/server/
├── app.ts            # createTTSApp 工厂（可发布，无副作用）
├── index.ts          # 独立部署入口（/api + 前端静态托管）
├── types.ts          # 通用类型
└── providers/        # gemini.ts / azure.ts / registry(index.ts) / types.ts
src/client/            # React 工作台（暂不进包）
scripts/build-lib.ts   # lib 打包脚本
```
