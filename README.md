# 课件生成器 · 一句话变精美 PPT

输入一句话主题，AI 自动编排结构与版式，生成一份精美的 HTML 网页课件，并在浏览器里**像 PPT 一样播放**。纯前端 PWA，可安装、可离线重播。

## ✨ 特性

- **一句话生成** —— 输入主题，AI 输出结构化课件（封面 / 章节 / 要点 / 对比 / 时间线 / 金句 / 大数字 / 代码 / 图文 / 结束等 11 种版式）。
- **精美主题** —— 内置 5 套设计主题（极光 / 水墨 / 暖阳 / 森林 / 深邃），排版、配色、渐变一体成型。
- **专业播放器** —— 基于 [reveal.js]：全屏、键盘 / 触屏翻页、过场动画、逐条渐入、总览模式、演讲者备注、打印导出 PDF。
- **BYOK · 零后端** —— 使用你自己的 API Key，直接在浏览器调用大模型；密钥只存本机，不经过任何服务器。
- **多模型** —— 同时支持 **Claude（Anthropic）** 与 **OpenAI 兼容端点**（可填 DeepSeek / 通义千问等的 base URL），设置里随时切换。
- **PWA** —— 可安装到桌面 / 主屏，应用外壳与已生成课件均可离线使用。
- **本地课件库** —— 生成的课件存于浏览器 IndexedDB，可随时重播、删除。

## 🧱 技术栈

| 关注点 | 方案 |
|---|---|
| 构建 | Vite + TypeScript（无框架，轻量） |
| 播放引擎 | reveal.js 6 |
| PWA | vite-plugin-pwa（Workbox） |
| 存储 | IndexedDB（idb） |
| 文本渲染 | marked + DOMPurify（安全渲染要点里的 Markdown） |
| 大模型 | 自写流式 `fetch` 客户端，统一 Anthropic Messages 与 OpenAI Chat Completions |

## 🚀 本地运行

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建
npm run icons      # 由 design/icon-source.svg 重新生成 PWA 图标
```

## 🔑 配置模型（BYOK）

首次使用请进入「设置」填写：

1. **模型服务**：选择 `Claude` 或 `OpenAI 兼容`。
2. **API Base URL**：
   - Claude：`https://api.anthropic.com`
   - OpenAI：`https://api.openai.com/v1`（或改成 DeepSeek / 通义千问等兼容服务的地址）
3. **API Key**：粘贴你的密钥（**仅保存在本机浏览器 localStorage**，只发送给你填写的服务地址）。
4. **模型**：如 `claude-opus-4-8`、`gpt-4o-mini`、`deepseek-chat` 等。

> ⚠️ 这是纯前端应用，靠浏览器直连模型服务。Claude 与 OpenAI 官方端点均支持浏览器直连；部分第三方端点可能因 **CORS** 限制无法在浏览器直接调用——遇到此情况需自行架设代理。

## 📦 部署到 GitHub Pages

仓库已内置 `.github/workflows/deploy.yml`：推送到 `main` 分支后自动构建并发布到 GitHub Pages。首次需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

站点将发布在 `https://<user>.github.io/ppt2html-v3/`（`vite.config.ts` 中的 `base` 已按仓库名配置，采用 hash 路由，无需 SPA 回退）。

## 🗂 目录结构

```
src/
├─ main.ts              应用引导 + 路由挂载
├─ router.ts            hash 路由
├─ types.ts             Deck / Slide / 版式与主题的数据契约
├─ sample.ts            内置示例课件（无需 Key 即可预览）
├─ ui/                  home / library / settings / viewer / generating
├─ llm/                 client(流式) · prompt · settings(BYOK) · extractJson
├─ render/              renderDeck · layouts · normalize · themes.css · slides.css · preview
├─ player/              reveal.js 播放器封装 + 打印/导出样式
├─ store/               IndexedDB CRUD
├─ styles/              tokens.css · app.css（应用外壳）
└─ lib/                 dom · markdown · icons · toast
```

## 🧠 工作原理

1. 用户输入一句话 → 构造系统提示词（内含课件 JSON schema 与设计规则）。
2. 流式调用大模型，模型输出**结构化课件 JSON**（而非直出 HTML，更稳定、可控、安全）。
3. 前端把 JSON 规范化后，用各版式模板 + 所选主题渲染成 reveal.js 幻灯片。
4. 存入 IndexedDB，进入播放器像 PPT 一样播放。

## 📄 许可

MIT
