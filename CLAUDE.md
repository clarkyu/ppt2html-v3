# ppt2html-v3 — 项目记忆(供 Claude Code 会话恢复上下文)

一句话主题 → AI 生成 HTML 课件,像 PPT 一样播放。**纯静态 PWA,零后端**:
Vite 8 + TypeScript(vanilla,无框架)+ reveal.js 6 + IndexedDB,BYOK 调用
LLM。部署在 GitHub Pages:https://clarkyu.github.io/ppt2html-v3/
(push 到 main 自动部署,`.github/workflows/`)。

详细开发历史(每个 PR 做了什么、为什么)见 `docs/DEVLOG.md`。

## 开发约定(必守)

- **分支**:只在**当前会话被指定的 `claude/*` 分支**上开发(会话三及以前是
  `claude/pwa-slide-generator-0s4imt`,会话四起是 `claude/project-review-jt4jb5`);
  每次 PR 被合并后 `git fetch origin main && git checkout -B <该分支> origin/main`
  重置,并推送同步远端(纯已合并历史,`--force-with-lease` 即可)。绝不推其他分支。
- **提交身份**:提交前先 `git config user.email noreply@anthropic.com && git config user.name Claude`,
  否则 stop-hook 会拦。合并产生的 `noreply@github.com` 提交是 GitHub 的,不要 amend,推送同步分支指针即可。
- **PR**:一律开草稿 PR,用户自己合并;合并信号来自 webhook("#NN 已合并")。
  用户指示过:**不要主动查部署状态**,听指令往前干。
- **节奏**:实现 → `npm run build`(含 tsc)→ 无头 Playwright 验证(全过才算)→
  提交 → 推送 → 草稿 PR → 汇报 → 等合并 → 重置分支 → 下一个。

## 无头验证方法(已验证可用的固定配方)

```js
import pw from '/opt/node22/lib/node_modules/playwright/index.js'   // CJS default import
const { chromium } = pw
// 删除代理环境变量,否则连不上本地 dev server
for (const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy','NO_PROXY','no_proxy']) delete process.env[k]
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] })
```

- dev server:`npx vite --port 5199 --strictPort`;测系统密钥行为时再起一个
  `VITE_DEEPSEEK_API_KEY=testkey npx vite --port 5198`。
- mock LLM:settings 里把 openai.baseUrl 指到 `location.origin+'/fake-llm'`,
  `page.route('**/fake-llm/**')` 返回 SSE:
  `data: {"choices":[{"delta":{"content":"..."}}]}\n\ndata: [DONE]\n\n`。
- 种数据:直接 `indexedDB.open('ppt2html')` 往 `decks` store put;settings 走
  `localStorage['ppt2html.settings.v1']`。
- PDF 页数:`page.pdf()` 后数 `/\/Type[\s]*\/Page[^s]/g`。
- PPTX 检查:python zipfile 解包看 slide XML;LibreOffice(需 `apt-get install libreoffice-impress`)
  转 PDF + `pdftoppm`(poppler-utils)逐页目检;python-pptx 可做严格解析。
- TTS 测试:`Object.defineProperty(window,'speechSynthesis',{value:stub})`
  (直接赋值无效,speechSynthesis 是只读访问器)。
- mock 非流式调用(requestText,如澄清/单页改写):`page.route` 返回 JSON
  `{"choices":[{"message":{"content":"..."}}]}`(不是 SSE)。
- 无头 Chromium 的坑:纯 CJK 的 blob 下载文件名会报成 "download"(环境 locale 问题,
  非产品 bug);新起浏览器实例 = 全新 IndexedDB。
- Playwright `browser.newPage()` 每次新建**隔离 context**(IndexedDB 不共享)——
  多页共用种子数据必须 `browser.newContext()` 后 `context.newPage()`。
- 新版 Chrome **原生同时暴露无前缀 `SpeechRecognition` 与 `webkitSpeechRecognition`**——
  语音测试桩必须两个名字都 defineProperty 覆盖,否则应用拿到原生实现静默失败。
- 无头 locale 是 en-US:UI 语言检测会正确返回 'en',断言"语言跟随"需先
  `localStorage.setItem('ui-lang','zh')` 再 reload。
- Bash 里 `pkill -f 'vite --port …'` 会匹配到自己的命令行把 shell 杀掉(exit 144),
  用 `pkill -f '[v]ite --port …'` 防自匹配。

## 架构地图(按功能找文件)

- **类型契约**:`src/types.ts`(Deck/Slide/12 种 layout/StatItem/Branding/Outline/Structure)
- **LLM**:`src/llm/client.ts`(streamText/tokenLimit:DeepSeek≤8192、o*/gpt-5 用
  max_completion_tokens;httpError 本地化)、`prompt.ts`(DECK_SCHEMA_GUIDE,三条生成路径共用;
  contextBlock 含**素材注入**块——保真引用+提纲沿用两规则,MATERIAL_MAX_CHARS=8000)、
  `outline.ts`(结构→分部→分段生成,completeSlides 增量 JSON 解析)、`clarify.ts`(有素材时改问缺口)、
  `edit.ts`(单页改写)、`notes.ts`(演讲稿逐字稿,批量 6 页/次)、`settings.ts`
  (BYOK + 系统密钥 VITE_DEEPSEEK_API_KEY;imageGen 配置)
- **渲染**:`src/render/renderDeck.ts`、`layouts.ts`、`normalize.ts`、`fit.ts`、
  `semanticIcons.ts`(33 个语义图标)、`slides.css`、`themes.css`(7 主题)、
  `customTheme.ts`(自定义主题:色板按 WCAG 对比度推导全套 CSS 变量 + 归一化/校验)、
  `preview.ts`(缩略图/单页预览,感知 customTheme)
- **播放**:`src/player/player.ts`(mountPlayer/PlayerHandle/步进模式)、`presenter.ts`
  (演讲者视图)、`narrate.ts`(TTS 语音讲解自动放映)、`player.css`
- **UI**:`src/ui/home.ts`(快速/逐步双入口 + 素材框/语音输入/剪贴板粘贴)、`guided.ts`+`outline.ts`
  (向导,prefetch/草稿续作)、`generating.ts`(分段成稿+胶片墙)、`viewer.ts`(播放页全部工具,
  Wake Lock 防熄屏)、`rewritePanel.ts`(播放页单页 AI 改写浮层,原地换 .s 块不重挂播放器)、
  `refinePanel.ts`(一键精修:lib/quality 机械定位→只重写不达标页)、`globalEditPanel.ts`
  +`llm/globalEdit.ts`(整册指令:先出逐页计划再执行,v1 仅页内改写)、
  `editor.ts`(逐页编辑/AI 改写/候选图/AI 配图)、`settings.ts`、`stylePicker.ts`
  (换风格画廊:7 内置 + 我的风格)、`sharePanel.ts`(分享+二维码+卡片图+系统分享)
- **质量**:`src/lib/quality.ts`(机械质量检查:容量/锚点/观点句/备注,与 prompt §8、
  `scripts/eval/score.mjs` 三方同一契约,改一处同步三处);`scripts/eval/`(评测器,
  `npm run eval`,--mock/--local/golden 三模式,--baseline 出 Δ,详见其 README)
- **图片**:`src/images/search.ts`(Unsplash/Pexels/Pixabay/Openverse 混合+候选)、
  `abstract.ts`(7 族抽象 SVG 背景)、`genai.ts`(OpenAI 兼容图像生成,BYOK)
- **导出**:`src/export/standalone.ts`(单文件 HTML)、`pptx.ts`(可编辑 PPTX,
  pptxgenjs 动态 import)
- **分享**:`src/lib/share.ts`(deflate→base64url→`#/s/` 路由,data: 背景剥离,
  customTheme 入口 sanitize)、`src/lib/shareCard.ts`(canvas 自绘 1080×1440 竖版
  分享卡片:色板封面+二维码,文案跟随课件语言;`themePalette` 从 abstract.ts 取平面色板)
- **素材**:`src/lib/extractText.ts`(txt/md/docx/pdf 本机解析,mammoth/pdfjs 懒加载
  且被 workbox globIgnores 排除出离线包)、`materialSlice.ts`(长素材>3000 字按环节
  词面切片,结构规划保全量)、`deckMaterial.ts`(deck→提纲式素材,导入件 AI 重构用)
- **其他**:`src/lib/lang.ts`(CJK 检测,课件语言跟随)、`highlight.ts`(零依赖代码高亮)、
  `draft.ts`(向导草稿 24h)、`styles.ts`(我的风格 localStorage 库)、`i18n.ts`(全部文案 zh/en)

## 已知坑(踩过、修过,别再踩)

- **pptxgenjs**:多 run 段落 + 原生 bullet 表达不了(外层 bullet 只落第一个 run,
  后续 run 输出非法段中 buNone 或拆段)→ 圆点用强调色文本 run 手绘(`bulletRuns`);
  `addImage rounding:true` 是**椭圆裁剪**不是圆角,别用。
- **CSS `[hidden]`**:已全局加 `[hidden]{display:none!important}`,因为 `.btn` 等的
  display 会压过 UA 规则(示例课件的编辑按钮曾因此常年可见)。
- **bgCssUrl**:data URI 必须单引号包裹(`url('...')`,内部 `'`→`%27`),双引号会把
  style 属性截断。
- **DeepSeek**:thinking 模式不支持 response_format:json_object(会返回空);
  max_tokens 上限 8192,长课件必须分段生成。
- **编辑器 collectSlide**:carry-over 模式——没有表单控件的字段必须显式从 prev 带过来,
  否则保存即丢(note 字段曾因此在非 bullets 版式上静默丢失)。
- **分享链接**:二维码容量 ~2.9K 字符;data: URI 背景必须剥离(QR_MAX_CHARS 在 share.ts)。
- **自定义主题**:任何进入渲染的色值必须先 `normalizeHex`/`sanitizeCustomTheme`——
  分享链接/localStorage 的畸形色值会让 parseHex 抛错致白屏、PPTX 出 NaN 颜色;
  亮/暗判定用 WCAG 对比度(取黑/白文字对比更高者),别用 `luminance>0.5`(高饱和中
  亮度色会选错);CSS 与 PPTX 两条推导共用同一判定,别各写一套。用户可输入的风格名
  进 innerHTML 必须 `escapeHtml`(存储型自 XSS)。
- **导出/演讲者视图**:body/html 需带 `.player` 类,否则 `--font-body`/`--pos`/`--neg`
  (只在 `.player` 里定义)不解析——曾导致导出件字体退化。
- 系统密钥经 GitHub Actions secrets 注入(VITE_DEEPSEEK_API_KEY / VITE_UNSPLASH_KEY /
  VITE_PEXELS_KEY / VITE_PIXABAY_KEY),打进静态包=公开可读,是已接受的取舍。
- **abstract.ts 的 SVG 无 width/height 属性**(只有 viewBox)——canvas drawImage
  栅格化跨浏览器不可靠,分享卡片因此在 canvas 上自绘背景而非贴 SVG。
- **播放页原地改单页**:只换 section 里的 `.s` 块 + `aside.notes`,别重挂播放器
  (会丢所有 onSlideChange 回调);换完 `reveal.sync()`(步进 fragments)+ `fitSlide`。
- **hash-fragment 分享链接无法做 OG 富预览**(内容不经服务器)——分享卡片图就是
  预览的替代方案,别再尝试动态 OG。
- **deck.material 是 local-only 契约**(PR #70 用户已认可):share.ts 的 portable()
  是显式字段白名单,material 绝不能加入;导出同样不得携带。

## 功能全景(截至 PR #63,全部已上线)

生成:引导问答(1~2 问)→ 结构确认 → 分部大纲 → 分段成稿(胶片墙揭幕/断段重试/
草稿续作/预取);快速一次成稿模式;单页 AI 改写(可撤销);**课件模板库**
(`#/templates`,6 场景骨架:培训/汇报/发布/课堂/复盘/提案,占位即写作指导);
**导入 PPTX**(课件库入口,JSZip+DOMParser 启发式映射版式,备注全带)。
内容:12 版式、语义图标、stats 数据卡、代码高亮、**加粗**强调、CJK/英文自适应、
演讲稿逐字稿(批量后置生成)。
播放:reveal.js、逐条步进、语音讲解自动放映(TTS)、演讲者视图、位置记忆、打印适配、
**练习模式**(按讲稿估时逐页排练:4 字/秒·2.5 词/秒,80% 预警/超时变红,小结报告)。
视觉:7 内置主题 + 自定义主题「我的风格」(自选底色/双强调色/衬线,按亮度推导全套色,
可一键换装、跨课件复用,全链路生效)、抽象 SVG 背景 7 族、照片背景(4 源+候选挑选)、AI 配图(BYOK)。
导出/分享:独立 HTML、PDF 打印、可编辑 PPTX(备注/主题色/背景全带)、
无后端链接分享+二维码+保存副本、**分享卡片图**(canvas 竖版 PNG 含二维码,
微信可长按)+ 系统分享(navigator.share 带文件)+ 接收端「我也要做一份」CTA。
移动(会话四新增):Wake Lock 播放防熄屏、主题语音输入(Web Speech,双前缀)、
剪贴板一键粘贴(素材框展开时定向素材框)、播放页单页 AI 改写(原地生效可撤销)。
素材注入:统一素材框(≤8000 字)——数字/事实保真优先引用,含提纲则结构沿用,
流经全部生成路径;有素材时澄清问题改问缺口;草稿自动携带;**文件导入**
(txt/md/docx/pdf 本机解析);长素材按环节切片下发(结构规划保全量);
**导入件 AI 重构**(导入 PPTX 后可把旧课件当素材重新生成,原件保留);
**讲稿引用素材**(deck.material 本地持久化,逐字稿优先引用素材事实)。
AI 修改三层(播放页,persistable 门禁):单页改写(#58)→ 一键精修(#62,机械
定位只修不达标页)→ 整册指令(#63 页内改写;#68 v2 加删除页/调整顺序——
两阶段执行,结构变动走 remountPlayer 重挂+onSlide 注册表重接线);均可撤销。
质量度量:`npm run eval` 评测器(golden 16 主题/本地模板/评分器自测,--baseline 出 Δ)。

## 补充坑(PR14–16 踩到的)

- **marked/CommonMark emphasis 边界**:`**` 紧邻标点(尤其方括号)会解析失败、
  星号原样漏出——写入渲染文案前可用 `mdInline` 自检(输出仍含 `**` 即失败)。
- **PPTX 占位符几何**:占位符的 a:off/a:ext 常只存在 slideLayout 里,slide XML
  没坐标——导入判断双栏不能只靠位置,要用「双 body 占位符」语义。
- **Vite 新依赖首次动态 import** 会触发 optimize+整页 reload(纯 dev 现象,
  prod 无);无头测试首跑会因此中断,重跑即可。

## 候选方向(未做)

1. 多语言课件一键翻译(整套 deck 翻译为另一语言)——用户曾明确跳过,勿擅自开工
2. golden set 真实基线:用户本机 EVAL_LLM_KEY 跑第一份,之后 prompt 迭代对 Δ
3. 整册修改 v3:新增页(需凭空生成内容)、更换版式

已完成(曾在候选里):自定义主题=PR #49;课件模板库=PR #52;导入 PPTX=PR #53;
练习模式=PR #54;分享卡片/系统分享/接收端 CTA=PR #56;移动三件套=PR #57;
播放页 AI 改写=PR #58;素材注入 v1=PR #59;质量评测器=PR #61;一键精修=PR #62;
整册 AI 修改=PR #63;素材 v2 文件导入+切片=PR #65;导入件 AI 重构=PR #66;
整册修改 v2 删页/调序=PR #68;讲稿引用素材=PR #70。

节奏照旧:实现→build→无头验证→草稿 PR→等合并→重置分支→下一个。
