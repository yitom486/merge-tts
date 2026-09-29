# Gemini 3.8 TTS Studio - 工程设计规范与开发指南

本文档定义了本项目（**Gemini 3.8 TTS Studio**）的技术架构、设计系统准则、接口安全规范及开发注意事项。所有后续开发与协作均须严格遵循此规范。

---

## 1. 架构总览 (Architecture Overview)

* **运行环境 (Runtime)**: [Bun](https://bun.sh) (v1.3+)
* **语言标准 (Language)**: TypeScript (Strict Mode)
* **服务端框架 (Backend)**: [Hono](https://hono.dev) (原生运行于 Bun)
* **前端框架 (Frontend)**: React 19 / Vite
* **样式系统 (Styling)**: TailwindCSS v4 / v3 (CSS 变量驱动) + shadcn/ui 组件范式
* **核心模型**: Google `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts`

### 目录结构规划
```text
d:/project/js/tts/gemini/
├── AGENTS.md                  # 代理开发指南与设计规范（本文件）
├── .env                       # 本地环境变量（GEMINI_API_KEY，不入库）
├── .env.example               # 环境变量模板
├── package.json               # 依赖配置与 Bun scripts
├── tsconfig.json              # TypeScript 配置
├── vite.config.ts             # Vite 配置与前端代理
└── src/
    ├── server/                # Hono 服务端代码
    │   ├── index.ts           # Hono 主入口与路由分发
    │   ├── tts-service.ts     # Gemini 3.8 Flash TTS 调用封装
    │   └── types.ts           # 服务端与 API 类型定义
    └── client/                # 前端单页应用
        ├── index.html         # HTML 入口
        ├── main.tsx           # React 挂载入口
        ├── App.tsx            # 主应用布局
        ├── styles/
        │   ├── globals.css    # 核心设计变量与全局动画定义
        │   └── theme.css      # 明/暗主题变量与统一过渡配置
        ├── components/
        │   ├── ui/            # shadcn 原子级组件 (Button, Slider, Select, etc.)
        │   ├── Header.tsx     # 顶部栏与统一主题切换开关
        │   ├── Editor.tsx     # 文本输入与表演标签插入面板
        │   ├── VoicePicker.tsx# 预置音色与自定义 Voice 选择器
        │   ├── AudioPlayer.tsx# 录音棚级波形播放器与下载
        │   └── ApiKeyModal.tsx# 客户端可选 Key 设置弹窗
        ├── hooks/
        │   ├── useTheme.ts    # 共享统一过渡的主题切换 Hook
        │   └── useTTS.ts      # 音频生成与状态流管理 Hook
        └── lib/
            └── utils.ts       # cn 类合并与通用辅助函数
```

---

## 2. UI 视觉规范与去“AI味”准则 (Anti-AI-Tropes Design)

### 2.1 风格基调：清淡、简约、演播室质感
* **严禁滥用 AI 常见俗套视觉**：
  * ❌ 严禁大面积饱和度过高的紫蓝粉霓虹渐变（Neon Rainbow Gradients）。
  * ❌ 严禁浮夸的机器人头、发光光晕大背景（Glow Blobs）。
  * ❌ 严禁臃肿复杂的拟物投影。
* **遵循瑞士平面/现代工学极简风格（Editorial & Studio Minimalist）**：
  * ✔ 使用克制、优雅的微色调背景，辅以极细边框（Hairline Border，1px）。
  * ✔ 字体采用清晰利落的现代无衬线体（Inter / Geist / 系统原生字体栈）。
  * ✔ 控件具有明确的功能感与专业工具感，类似现代音频工作站（DAW）与写作软件的结合体。

### 2.2 严格禁止硬编码颜色（100% Token 变量驱动）
所有颜色必须抽离为 CSS 变量，严禁在 TSX/JSX 或 CSS 中使用十六进制（如 `#ffffff`, `#1e293b`）硬编码。

#### 变量体系规范 (`src/client/styles/theme.css`):
```css
:root {
  /* 基础画布与前景色 */
  --bg-app: 0 0% 98%;             /* 浅灰白底色，不刺眼 */
  --bg-card: 0 0% 100%;           /* 纯白卡片 */
  --bg-subtle: 220 14% 96%;        /* 次级中性灰 */
  --fg-primary: 224 71% 4%;        /* 深度文字色 */
  --fg-muted: 220 9% 46%;          /* 次级弱化文字色 */
  
  /* 边框与分割线 */
  --border-subtle: 220 13% 91%;
  --border-focus: 224 71% 4%;
  
  /* 强调色（极简暗石板蓝/沉稳色系，绝非刺眼荧光） */
  --accent: 222 47% 20%;
  --accent-fg: 210 40% 98%;
  
  /* 标签专属色（用于 [laughs] 等行内表演标签） */
  --tag-bg: 220 14% 94%;
  --tag-border: 220 13% 86%;
  --tag-fg: 220 9% 30%;
}

.dark {
  /* 暗黑主题：深邃沉静，非纯死黑 */
  --bg-app: 224 25% 6%;
  --bg-card: 224 25% 8%;
  --bg-subtle: 224 20% 12%;
  --fg-primary: 210 20% 98%;
  --fg-muted: 217 10% 60%;
  
  --border-subtle: 224 20% 15%;
  --border-focus: 210 20% 90%;
  
  --accent: 210 40% 98%;
  --accent-fg: 224 71% 4%;
  
  --tag-bg: 224 20% 13%;
  --tag-border: 224 20% 20%;
  --tag-fg: 217 15% 75%;
}
```

---

## 3. 统一明暗主题切换动画 (Synchronized Theme Transitions)

### 3.1 问题与解决策略
传统主题切换容易出现“某些组件慢半拍变色、某些组件瞬间闪烁”的不协调情况。
本项目要求**所有组件共享严格一致的主题切换曲线与时间**。

### 3.2 技术手段与实现规范
1. **全局过渡变量与类名同步**：
   定义统一的时间常数与缓动贝塞尔曲线：
   * 切换时长：`320ms`
   * 缓动函数：`cubic-bezier(0.16, 1, 0.3, 1)`（平滑减速，质感优雅自然）
2. **主题切换锁定机制（Theme Transition Lock）**：
   在执行主题切换时，向 `document.documentElement` 添加临时类 `.theme-transitioning`，使所有受到背景、边框、字体、投影影响的元素以完全同步的动画完成过渡：
   ```css
   /* 全局共享主题切换动画 */
   html.theme-transitioning,
   html.theme-transitioning *,
   html.theme-transitioning *::before,
   html.theme-transitioning *::after {
     transition: 
       background-color 320ms cubic-bezier(0.16, 1, 0.3, 1),
       border-color 320ms cubic-bezier(0.16, 1, 0.3, 1),
       color 320ms cubic-bezier(0.16, 1, 0.3, 1),
       box-shadow 320ms cubic-bezier(0.16, 1, 0.3, 1),
       fill 320ms cubic-bezier(0.16, 1, 0.3, 1) !important;
     transition-delay: 0ms !important;
   }
   ```
3. **现代浏览器增强 (View Transitions API)**：
   若浏览器原生支持 `document.startViewTransition()`，则优先启用平滑扩散或交叉淡化过渡，若不支持则降级使用上述统一过渡锁定方案。

---

## 4. API 架构与密钥安全 (API & Secret Management)

### 4.1 密钥分级与处理原则
1. **第一层级（服务端保密）**：
   * 存放在根目录 `.env` 中的 `GEMINI_API_KEY`。
   * 服务端 Hono 直接从 `process.env.GEMINI_API_KEY` 读取，永不向前端泄漏。
2. **第二层级（客户端可选覆盖）**：
   * 前端设置弹窗允许用户临时输入自定义 Key（存储于本地 `localStorage`，不上传除 Hono 后端之外的任何地方）。
   * 请求发往 Hono 时置于请求头 `x-gemini-api-key`。
   * **Hono 取值优先级**：`c.req.header('x-gemini-api-key') || process.env.GEMINI_API_KEY`。

### 4.2 后端接口清单
* `POST /api/tts/generate`:
  * 输入：`{ text: string, voiceName: string, model: string, speechMetadata?: string }`
  * 输出：直接返回 `Content-Type: audio/wav` 二进制音频数据流或带 Base64 的 JSON，支持分块流式传输。
* `GET /api/models`:
  * 动态从 Google Generative Language API (`models.list`) 获取支持 TTS 的模型列表（严禁在前端或后端硬编码固定死列表），包含模型 ID、显示名、描述。
* `GET /api/voices`:
  * 100% 来自官方 Voices/ListVoices 实时响应（含自定义设计/复刻音色），无任何本地预置兜底。
* `GET /api/health`:
  * 健康检查与当前 API Key 就绪状态（仅返回布尔值 `hasKey: boolean`，不返回 Key 内容）。
* `POST /api/tts/unified`:
  * 统一合成（嵌入调用方）：输入文本/语种/用途/语音偏好/首选服务/凭证，包内解析模型与音色、设置超时取消；成功 200（含 `usedFallback`），双失败 500（含两次原因），缺参 400；失败只兜底本地 TTS。
* 发布入口：`gemini-tts-studio/server`（`createTTSApp` 等）与 `gemini-tts-studio/client`（`VoiceSettings` + `style.css` + 无头客户端）。

---

## 5. Gemini 3.8 Flash TTS 功能特性实现要点

1. **完全动态模型拉取与版本自适应（100% 零硬编码）**：
   * 前端模型选择与标签渲染完全依赖 `/api/models` 实时响应。
   * 服务端向 Google `GET /v1beta/models` 或通过 SDK `models.list()` 动态检索过滤支持语音合成的模型。
   * **动态版本自适应算法（Future-Proofing）**：
     * 严禁在代码中写死 `gemini-3.8-flash-tts` 或硬编码优先级映射；
     * 系统通过正则动态提取模型语义版本号（如 `gemini-4-flash-tts` -> `4.0`，`gemini-4.5-pro-tts` -> `4.5`）；
     * 自动加权打分：版本号占主导分值，结合 Pro/Flash 旗舰与 Lite 规格层级，高版本模型永远全自动跃居榜首；
     * 动态计算最高版本与阶梯标识（`flagship` 最新旗舰、`lite` 极速低延、`pro` 专业高质、`preview` 预览版），未来谷歌无论发布 Gemini 4、4.5 还是 5，系统均无需改动一行代码即可全自动接入并识别为最新旗舰。

2. **行内表演标签快捷插入**：   * 编辑器上方提供紧凑、轻量的药丸式标签条：
     * `[laughs]`（笑声）
     * `[sighs]`（叹息）
     * `[whispers]`（耳语）
     * `[short pause]`（停顿）
     * `[clears throat]`（清嗓）
     * `[gasp]`（倒吸冷气）
   * 点击标签直接在当前光标处无缝插入，并保持光标位置。
3. **音频呈现**：
   * 极简现代的波形进度条、播放/暂停、快进/快退与一键下载 `.wav`。

---

## 6. 失败显式化原则 (Fail-Fast, No Silent Fallbacks)

* **严禁静默兜底**：无 Key、远端拉取失败、空结果一律抛错，由调用方如实展示；禁止返回本地写死的预置模型/音色表掩盖失败。
* **缺参即 400**：合成请求缺少 `text` / `voiceName`（Gemini 另需 `model`）直接拒绝，不做任何默认音色/模型填充。
* **允许的例外（非数据兜底）**：
  * 输入建议项（区域下拉、语言下拉、编辑器标签条）——用户可见的输入辅助，非结果伪造；
  * SSE 单包降级（Azure REST 无真流式，服务端以单包走同一 SSE 协议下发，并在 UI 注明）——协议归一，非数据伪造；
  * 排序与分组展示逻辑（自定义置顶、字母序、语言分组）——纯展示层，不捏造数据。

