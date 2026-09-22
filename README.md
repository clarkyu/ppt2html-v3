# 课件生成器 · 一句话变精美 PPT

输入一句话主题，AI 编排结构与版式，生成一份精美的 HTML 课件，在浏览器里**像 PPT 一样播放**。纯前端 PWA：零后端、可安装、可离线重播、BYOK（密钥只存本机）。

在线地址：https://clarkyu.github.io/ppt2html-v3/

## ✨ 特性

**生成**

- **开箱即用 · 系统兜底** —— 默认走系统提供的 DeepSeek（`deepseek-v4-pro` 别名，始终指向最新版），免填 Key 即可生成；想用 Claude / OpenAI / Gemini / 通义 / Kimi / GLM / Grok / Mistral / Groq / OpenRouter 等 12 家预设时再填自己的 Key。（静态站点内置的系统 Key 随构建产物公开下发，属「换取零门槛」的取舍。）
- **两条入口** —— **快速生成**一次成稿；或**逐步向导**：1~2 个澄清问题（选模型时已预取）→ 确认整体结构（分几个部分、每部分多少页 / 多长时间）→ 逐环节流式细化每一页 → 总览（按环节折叠、增删部分、回退修改）→ 分段成稿（胶片墙逐页揭幕、断段重试、草稿 24h 续作）。
- **按时长估页** —— 选「分享时长」自动换算页数（约 1.3 分钟一页，10 分钟 ≈ 8 页，5~40 页封顶）。
- **素材注入** —— 粘贴文字或导入 txt / md / docx / pdf（本机解析，≤ 8000 字）：数字与事实保真引用，含提纲则结构沿用；长素材按环节切片下发；导入的 PPTX 也可当素材让 AI 重构。
- **课件模板库** —— 培训 / 汇报 / 发布 / 课堂 / 复盘 / 提案 6 种骨架，占位文字就是写作指导（目前为中文内容）。
- **思考模式** —— 支持的模型（如 DeepSeek V4）可一键开启推理再作答。

**内容与视觉**

- **12 种版式** —— 封面 / 章节 / 要点 / 两栏 / 大数字 / 数据卡 / 金句 / 对比 / 时间线 / 代码 / 图文 / 结束，含 33 个语义图标、代码高亮、`**加粗**` 强调，中英文自适应。
- **不溢出** —— 生成时约束每页信息量（`src/lib/qualityContract.js` 一份契约，prompt / 精修 / 评测器共用），渲染时再自动缩放标题与内容适配 16:9。
- **7 套内置主题 + 我的风格** —— 极光 / 水墨 / 暖阳 / 森林 / 深邃 / 沙丘 / 玫瑰；自定义主题只需选底色与双强调色，按 WCAG 对比度推导整套配色，可一键换装、跨课件复用。
- **背景图** —— 抽象 SVG 背景 7 族（零网络），或按页面内容联网搜图：自己的 Unsplash / Pexels / Pixabay Key 优先，其次构建时注入的系统 Key，最后免 Key 的 Openverse（CC 授权，带署名）；AI 配图（OpenAI 兼容图像接口，需自备 Key）。设置里可关闭，编辑器里可逐页换图 / 移除。

**AI 修改（播放页，均可撤销）**

- **单页改写**（原地生效）→ **一键精修**（机械定位只重写不达标页）→ **整册指令**（先出逐页计划再执行：改写 / 删页 / 调序 / 新增 / 换版式）。
- **逐页编辑器** —— 每页实时预览 + 按版式编辑，增删页、调顺序、换主题、候选图挑选。
- **演讲稿逐字稿** —— 批量后置生成，优先引用素材事实。

**播放**

- reveal.js 播放器：全屏、键盘 / 触屏翻页、逐条步进、总览、演讲者视图（双窗口）、语音讲解自动放映（TTS）、练习模式（按讲稿估时逐页排练）、位置记忆、Wake Lock 防熄屏、打印适配。

**导出与分享**

- 单文件 HTML、PDF 打印、可编辑 PPTX（备注 / 主题色 / 背景全带，长列表自动压缩到页内，导出件可**无损回导**）、导入 PPTX（表格、软换行、讲稿）。
- 无后端分享链接（内容压进 URL）+ 二维码 + 竖版分享卡片图 + 系统分享；接收端可「保存副本」或「我也要做一份」。

**移动与无障碍**

- 手机可用：语音输入主题、剪贴板粘贴、横屏提示、紧凑工具栏；浮层均为可键盘操作的对话框，切换按钮暴露状态，减弱动画时停用循环动画。
- 界面中 / 英双语；课件内文案跟随**课件语言**（按汉字占比判定），不跟界面。

## 🧱 技术栈

| 关注点 | 方案 |
|---|---|
| 构建 | Vite 8 + TypeScript（vanilla，无框架） |
| 播放引擎 | reveal.js 6 |
| PWA | vite-plugin-pwa（Workbox，pdf.js / mammoth 按需加载且不进离线包） |
| 存储 | IndexedDB（idb）+ localStorage（设置 / 风格 / 草稿） |
| 文本渲染 | marked + DOMPurify |
| 大模型 | 自写流式 `fetch` 客户端，统一 Anthropic Messages 与 OpenAI Chat Completions |
| 导入 / 导出 | JSZip + DOMParser（PPTX 导入）、pptxgenjs（PPTX 导出）、pdf.js / mammoth（素材解析） |

## 🚀 本地运行

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # tsc + 生产构建到 dist/ + 离线包分块守卫（scripts/check-chunks.mjs）
npm run preview      # 预览生产构建
npm run typecheck    # 只做类型检查
npm run i18n:check   # 字典键 ↔ 源码引用双向校验
npm run audit:check  # 生产依赖 high/critical 通告门禁（含文档化的例外）
npm run eval -- --mock   # 课件质量评分器自测（详见 scripts/eval/README.md）
npm run icons        # 由 design/icon-source.svg 重新生成 PWA 图标
```

## 🔑 配置模型（BYOK）

有系统 Key 时可直接生成；想换模型请进入「设置」：

1. **预设**：点一家服务，base URL 自动填好；或手动选择 `Claude` / `OpenAI 兼容`。
2. **API Base URL**：Claude 用 `https://api.anthropic.com`，OpenAI 兼容用 `https://api.openai.com/v1`（或 DeepSeek / 通义等兼容地址）。
3. **API Key**：只保存在本机浏览器 localStorage，只发送给你填写的服务地址。
4. **模型**：从下拉里选（每家附常用清单与说明），或「自定义…」。

> ⚠️ 纯前端应用靠浏览器直连模型服务。Claude 与 OpenAI 官方端点支持浏览器直连；部分第三方端点可能受 **CORS** 限制，需自行架设代理。

## 📦 部署到 GitHub Pages

仓库内置 `.github/workflows/deploy.yml`：推送到 `main` 后依次跑依赖通告门禁、字典校验、构建（含离线分块守卫）、评分器自测，再发布到 GitHub Pages。首次需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。系统 Key 通过 Actions secrets 注入（`DEEPSEEK_API_KEY` / `UNSPLASH_KEY` / `PEXELS_KEY` / `PIXABAY_KEY`，均可缺省）。

站点发布在 `https://<user>.github.io/ppt2html-v3/`（`vite.config.ts` 的 `base` 已按仓库名配置，hash 路由无需 SPA 回退）。

## 🗂 目录结构

```
src/
├─ main.ts / router.ts   应用引导、hash 路由（离开守卫、语言切换）
├─ types.ts              Deck / Slide / 12 版式 / 主题 / 自定义主题的数据契约
├─ i18n.ts               界面文案 zh / en（t / tn / pages）
├─ sample.ts             内置示例课件；templates.ts 6 个课件模板
├─ ui/                   home · guided · structure · outline · generating · viewer · editor
│                        library · settings · templates · stylePicker · sharePanel
│                        rewritePanel · refinePanel · globalEditPanel
├─ llm/                  client(流式) · prompt · outline · clarify · edit · globalEdit · notes
│                        settings(BYOK + 系统 Key) · models · extractJson · errors
├─ render/               renderDeck · layouts · normalize · fit · preview · customTheme
│                        semanticIcons · themes.css · slides.css
├─ player/               player(reveal 封装) · presenter · narrate · rehearse · player.css
├─ images/               search(4 源搜图) · abstract(SVG 背景) · genai(AI 配图)
├─ export/               standalone(单文件 HTML) · pptx
├─ import/               pptx
├─ store/                IndexedDB CRUD
├─ styles/               tokens.css · app.css
└─ lib/                  share · shareCard · backup · quality · qualityContract · lang
                         extractText · materialSlice · deckMaterial · overlay · draft
                         composer · styles · markdown · highlight · toast · dom · …
scripts/
├─ check-chunks.mjs      离线包分块守卫（构建后自动跑）
├─ i18n-check.mjs        字典校验
├─ audit-check.mjs       依赖通告门禁
├─ eval/                 课件质量评测器（--mock / --local / golden）
└─ gen-icons.mjs         PWA 图标
```

## 🧠 工作原理

1. 用户输入一句话（可附素材）→ 构造系统提示词（课件 JSON schema + 设计与容量规则）。
2. 流式调用大模型，模型输出**结构化课件 JSON**（不直出 HTML：稳定、可控、可安全渲染）。
3. 前端把 JSON 规范化（`normalizeDeck` 是唯一信任边界），用各版式模板 + 主题渲染成 reveal.js 幻灯片，并按 16:9 自动适配。
4. 存入 IndexedDB，进入播放器像 PPT 一样播放；后续修改（AI 改写 / 编辑 / 换风格）都作用在同一份 JSON 上。

## 📄 许可

MIT
