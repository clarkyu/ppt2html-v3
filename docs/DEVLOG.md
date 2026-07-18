# 开发日志(Claude Code 会话存档)

按 PR 逆序记录每次落地的内容与关键决策,供后续会话/协作者快速恢复上下文。
项目约定与架构地图见仓库根 `CLAUDE.md`。

## 会话四(2026-07,PR #56–#59,分支 claude/project-review-jt4jb5)

起点:10 个并行 agent 全量精读 80 个文件恢复上下文。随后两条产品讨论定调:
①「一句话生成高质量课件」的本质 = 意图澄清 + 内容硬指标 + 可靠性护栏 + 低成本
人工把关,一句话只是触发器;质量天花板在用户私有事实 → 素材注入是最大杠杆。
②手机场景四连问(丝滑/质量/分享欲/分享通道)→ 移动三 PR 系列先行。

### PR #70 — 讲稿引用素材（material 存 deck 的契约落定）
- 契约决策(PR 正文陈述,用户合并即认可):`deck.material` 本地持久化。
  风险为零的依据——share 的 portable() 是**显式字段白名单**(material 不加入
  就不外泄,已加注释锁死);HTML/PPTX 导出只嵌渲染产物;本地备份携带利于恢复。
- notes.ts 第 8 条引用规则(优先引用素材数字/事实/案例并保真);batchPrompt
  附素材块,长素材按本批页标题切片;无素材 deck 零行为变化。
- 验证含契约断言:分享链接编解码往返后无 material 字段。

### PR #68 — 整册修改 v2（结构性操作：删除页/调整顺序）
- 解决 v1 不敢碰的两只拦路虎:①烙入页码过期——`remountPlayer` 整体重挂,
  renderDeckSlides 重跑使页码/角标/回顾自动重排;②重挂丢回调——viewer 的
  `onSlide` 注册表把位置记忆/练习 HUD/备注面板/演讲者刷新全部重新接线并回位。
- 规划器 v2:rewrite/drop/move 三操作;本地校验(cover/end 禁 drop/move、
  move 目标钳内容区);`recomposeSlides` 纯函数先删后移一次重组。
- 两阶段执行:改写逐页走 LLM(页码此时稳定)→ 删/移零 LLM 成本本地重组
  → applyStructure(落库+重挂);撤销恢复执行前完整快照(内容+结构)。
- 仍不支持:新增页(需凭空生成内容)、换版式。

### PR #66 — 导入件「AI 重构」
- 洞察:重构=重排版式+重写文字,整册修改 v1 做不了,但**素材管线天然能做**——
  `lib/deckMaterial.ts` 把导入课件序列化成提纲式素材(章节→「一、」编号,备注
  随带,cover/end 剔除),走完整生成向导,「结构沿用+事实保真」自动生效。
- 导入成功后由直跳编辑器改为选择面板(AI 重构推荐/直接编辑);产出新课件,
  导入原件不动;`sharepanel--fixed` 变体(长页面浮层钉视口)。

### PR #65 — 素材 v2(文件导入 + 长素材切片)
- 文件导入:txt/md 直读,docx=mammoth(浏览器版,ambient 类型),pdf=pdf.js
  (worker 走 ?url,上限 50 页),全部本机解析;不支持类型/空文件本地化报错。
- 长素材(>3000 字)切片:`lib/materialSlice.ts` 段落分块+CJK 二元组/英文词
  词面重叠打分,分部/分段请求只带相关块(预算 3000,原序拼接,无命中回退
  开头);**结构规划保持全量**(要看提纲整体形状)。
- 体积治理:manualChunks 固定 pdfjs/mammoth chunk 名 + workbox globIgnores
  排除出 PWA 离线包(~900KB 不进 precache,离线时文件导入不可用是取舍)。

### PR #63 — 整册 AI 修改（对话式全篇指令）
- 两步设计:**先计划后执行**——`llm/globalEdit.ts` 一次便宜调用通读全篇摘要,
  输出 {ops:[{page,instruction}]}(跨页协调:例子不雷同/术语统一);面板展示
  逐页计划,用户确认后才逐页走 regenerateSlide(每页即时生效+落库,可整撤)。
- 规划结果本地不信任校验(越界/重复/缺指令过滤,上限 20);v1 只支持页内改写,
  增删页/换版式在 prompt 里明确排除(播放器重挂+烙入页码重排,留 v2)。
- 至此 AI 修改工具族三层齐备:单页改写(#58)→ 机械精修(#62)→ 整册指令(#63)。

### PR #62 — 一键精修(机械定位,AI 只修不达标页)
- 核心决策:**缺陷定位不花 token**——`lib/quality.ts` 把 DECK_SCHEMA_GUIDE
  硬指标变成确定性检查(容量超限/缺锚点/标签式要点/备注缺失,quote 页豁免
  锚点),输出中文可执行 critique;只对被标记页发起带清单的 regenerateSlide。
- 与 prompt §8、eval/score.mjs 三方同一契约(改任何一处要同步另两处)。
- refinePanel:扫描报告→确认→顺序批量(取消保留已完成,失败跳过)→全部撤销。

### PR #61 — 质量评测器(golden set + 机械评分)
- 给「prompt 是质量最高杠杆」补回归保障:`scripts/eval/`,npm run eval。
- 三模式:--mock(评分器自测 12 断言)/--local(示例+6 模板,零 API)/
  golden(16 固定主题,EVAL_LLM_KEY 真实生成,复用应用自身管线跑在无头浏览器)。
- 指标含**实测溢出**(逐页 1280×720 真渲染跑 fitSlide 数需缩放页);--baseline
  输出逐指标 Δ。首跑即抓到真实问题:示例课件章节数 1<2、two-col 超限 2 字。

### PR #59 — 素材注入 v1
- 设计原则:**不让用户在「素材/提纲」间自我分类**(边界模糊),统一素材框,
  系统按素材里已有的东西决定尊重多少;结构确认屏 = 天然消歧检查点。
- `GenerateOptions.material`(生成期输入不落 deck);contextBlock 注入素材块
  +两规则(事实保真优先引用/含提纲则结构沿用),自动流经快速/结构/分部/分段
  全部路径;STRUCTURE_SYSTEM 第 7 条;clarify 有素材时改问缺口;8000 字双层上限;
  首页可折叠素材框(隐私提示),粘贴按钮在素材框展开时定向过来;草稿自动携带。
- 验证:mock LLM 捕获请求体逐条断言素材与规则真实到达(13/13)。

### PR #58 — 播放页「AI 改这页」(手机编辑替代)
- `src/ui/rewritePanel.ts`:一句话指令 → 复用 regenerateSlide(版式/背景钉死)→
  原地生效;可再改一轮/一键撤销(面板打开前快照);关闭即 abort,迟到结果
  丢弃(wrap.isConnected)。
- **原地换页而非重挂播放器**:只换 section 的 `.s` 块 + notes aside,reveal 元素
  与全部 onSlideChange 回调保留;reveal.sync() 保步进,fitSlide 防溢出。
- persistable 才显示(示例/分享 deck 不可写库);验证 11/11(mock 非流式 JSON)。

### PR #57 — 移动三件套
- Wake Lock 播放防熄屏(visibilitychange 重获取,API 缺失静默);首页语音输入
  (Web Speech,**Chrome 已原生暴露无前缀 SpeechRecognition,桩要覆盖双名**,
  识别语言跟随 UI 语言);剪贴板一键粘贴。API 不可用按钮均隐藏。

### PR #56 — 分享卡片图 + 系统分享 + 接收端 CTA
- 洞察:hash-fragment 链接内容不经服务器,静态站**永远做不了 OG 富预览**——
  卡片图就是预览:canvas 自绘 1080×1440 竖版 PNG(色板封面+标题+品牌行+白底
  二维码,文案跟随课件语言,**加粗剥离);微信长按扫码即达。
- abstract.ts 的 SVG 无固有尺寸、canvas 栅格化不可靠 → 卡片自绘背景;浅色主题
  二维码板加描边。`navigator.share` 支持时携带卡片文件(取消不报错);
  分享页新增「我也要做一份」CTA(接收方=最精准的潜在创作者)。
- URL>QR_MAX_CHARS(2900)时无卡片,保持原降级;验证 16/16 含 390 视口。

## 会话三·续(2026-07,PR #50–#54)

用户选定候选 ①②④(跳过③翻译),依次三个独立 PR 落地。

### PR #54 — 练习模式
- `src/player/rehearse.ts`:按讲稿估时(中文 4 字/秒、英文 2.5 词/秒,无讲稿回退
  可见内容,单页下限 8s);播放页 HUD(本页/累计 vs 预算,80% 琥珀预警、超时红色
  脉动),开启自动展开讲稿面板;结束弹逐页小结(条形对比、超时标红)。

### PR #53 — 导入 PPTX 反向转换
- `src/import/pptx.ts`:JSZip 解包 + DOMParser 解析 DrawingML;页序走
  presentation.xml+rels;占位符类型驱动(ctrTitle→封面/章节,**双 body 占位符→
  two-col**——占位符坐标常只在 layout 里,不能靠位置);无占位符文本框按**最大字号**
  认标题(≥24pt/单段/非纯数字);长独段→image-text;备注经 rels 全带;页码/幽灵
  序号/角标剔除。验证:python-pptx 外来件 6 页全对 + 自家导出回环无损 + 坏文件报错。
- jszip 提升为显式依赖。

### PR #52 — 课件模板库
- `src/templates.ts` + `#/templates` 画廊 + 首页「从模板开始」:6 场景骨架
  (培训/汇报/发布/课堂/复盘/提案,各 12~13 页)。模板哲学:页标题=方法论框架词,
  正文占位=指导性写作提示,note=讲法指导(常见错误)。
- 创作流程:6 作者+6 审校并行(按 prompt.ts 容量硬指标逐页清点)→ 机械校验 →
  用 `mdInline` 全量扫描修掉 CommonMark emphasis 边界失败(`**` 紧邻方括号漏星号)。

### PR #50/#51 — 记忆存档更新(#49 补录、下一步计划)

## 会话三(2026-07,PR #37–#49)

起点:一次 **103-agent 多代理审计**(6 个维度 + 对抗验证),产出 11 个确认 bug
+ 56 条 worthIt 建议,随后逐一落地;审计收口后继续做新方向(#44 起)。

### PR #49 — 自定义主题「我的风格」(全链路生效)
- `src/render/customTheme.ts`(新):用户选底色/双强调色/衬线,其余(正文/次要/卡片/
  边框/代码色/背景渐变)按亮度推导为整套 CSS 变量;`applyCustomTheme` 内联到播放根,
  `customThemeStyleAttr` 供导出内联。`Deck.customTheme` 覆盖命名 theme。
- `src/lib/styles.ts`(新):localStorage 风格库(增删查);`stylePicker.ts` 画廊加
  「我的风格」区(取色表单+实时预览/应用/删除),回调改 tagged `StyleSelection`。
- 全链路感知 customTheme:player / preview / presenter / editor / 独立 HTML / PPTX
  (`paletteFromCustom`)/ 分享链接。抽象背景按自定义色板重掷(`abstractBgWith`)。
- 顺带修复:导出/演讲者视图 body 加 `.player` 类(`--font-body`/`--pos`/`--neg` 一直未解析)。
- **流程**:先 6-agent 摸清主题系统全部接触点 → 实现 → 2 个对抗性审查员,修其发现的
  真实 bug:①畸形色值(分享链接/localStorage)致 parseHex 抛错白屏 + PPTX NaN 颜色
  → `normalizeHex`/`sanitizeCustomTheme` 入口校验;②亮/暗判定改 WCAG 对比度(非
  `luminance>0.5`,修高饱和中亮度色选错文字);③风格名 innerHTML 未转义(自 XSS)
  → escapeHtml。28 项无头验证全过。

### PR #48 — 存档(本文件 + CLAUDE.md)

### PR #47 — AI 配图 + 一键换风格 + 无后端链接分享(二维码)
- `src/images/genai.ts`:任意 OpenAI 兼容 `/images/generations`(BYOK,设置页配置);
  结果存 dataURL,重放/导出零二次计费;`gpt-image-*` 不发 response_format。
- `src/ui/stylePicker.ts`:7 主题迷你预览画廊;换装=热切主题 class + 抽象背景按新配色
  重绘(`abstractBg` 重掷)+ 保存,不重新生成。
- `src/lib/share.ts` + `src/ui/sharePanel.ts` + 路由 `#/s/<blob>`:deck JSON →
  deflate-raw → base64url 进 URL,打开方只读播放 + 可存副本;二维码
  (qrcode-generator,>2.9K 字符优雅降级);data: 背景剥离,打开方自动补图。
- 修复:全局 `[hidden]{display:none!important}`(.btn 的 display 压过 UA 规则,
  示例课件的编辑按钮曾常年可见)。

### PR #46 — 语音讲解自动放映
- `src/player/narrate.ts`:speechSynthesis 朗读每页讲稿(无 note 回退朗读可见内容),
  读完停 450ms 自动翻页;手动翻页重锚定;按课件语言选本地音色。
- 防护:Chrome 长句 15s 静音 bug 用 pause/resume 保活;看门狗按文本长度兜底推进;
  发声序号防串台;无 TTS 优雅降级。

### PR #45 — 完整演讲稿(逐字稿)
- `src/llm/notes.ts`:成稿后置批量撰写(6 页/批,带全篇一览),要求开场钩子/页间
  承接/数字给读法/首尾出彩;按批落盘,败批保留已写部分;3 次重试涵盖解析与页码错位。
- 播放页 🎤 按钮(进度 n/total,完成自动开备注面板,长备注覆盖需确认)。
- 编辑器备注字段扩到全部 12 版式;修复非 bullets 版式保存丢 note 的隐性 bug。

### PR #44 — 导出可编辑 PPTX
- `src/export/pptx.ts`:12 版式全部映射原生文本框/形状(非截图);7 主题平面色板;
  **加粗**→加粗+强调色 run;照片抓 dataURL(≤4MB/6s)、抽象 SVG canvas 栅格化,
  加主题色纱幕;备注入 PPT 备注栏;pptxgenjs 动态 import。
- 坑:多 run 段落原生 bullet 表达不了 → `bulletRuns` 手绘圆点;`rounding:true`
  是椭圆裁剪 → 移除。验证含 LibreOffice Impress 实开渲染逐页目检。

### PR #43 — 逐条播放 / 跳过模型屏 / 候选图选择器
- 播放页步进模式(fragments 热切换,偏好持久化);系统密钥用户引导流跳过模型选择屏
  (返回键仍可达);编辑器换背景改为 6 缩略图候选面板(Unsplash download ping 仅在选中时发)。

### PR #42 — 收尾长尾项
### PR #41 — 快速模式/语义图标/stats 版式/字体签名/代码高亮/结尾回顾
- 33 个语义图标(`semanticIcons.ts`);`stats` 第 12 种版式;sand/ink/sunrise 衬线
  字体签名;零依赖代码高亮(`highlight.ts`);首页「快速生成」一次成稿。
### PR #40 — 生成体验
- 分段成稿根治 8192 token 截断(`splitOutlineSegments`/`generateSegmentSlides`/
  `completeSlides` 增量解析);胶片墙逐页揭幕;断段重试保留已完成;向导预取;
  localStorage 草稿(24h)断点续作;向导返回不丢状态。
### PR #39 — 一眼惊艳
- hero 封面纱幕、幽灵章节序号、**加粗**强调渲染、入场动效、品牌署名行、结尾章节回顾。
### PR #38 — 提示词升级(内容质量最高杠杆)
- DECK_SCHEMA_GUIDE 重写:观点句 bullets、具体性硬指标(禁编造)、叙事弧线、
  单页容量硬上限、语义版式映射。
### PR #37 — 修复审计确认的 11 个 bug
- 含 bgCssUrl 双引号截断(自测发现的第 11 个)、CJK 语言跟随(`lib/lang.ts`)、
  http 错误本地化(401/404/429/5xx)等。

## 会话二(PR #35–#36)
- #35:Pixabay 图源 + 抽象背景模式;#36:抽象背景 7 族花样、独立 HTML 导出、
  演讲者视图(备注+计时+下页预览)。

## 会话一(项目从零到上线)
- M1–M5:脚手架/PWA、播放器+版式、AI 生成、IndexedDB 课件库、打磨部署;
  引导问答精简、大纲两步确认(结构→分部)、DeepSeek 预设与系统密钥。

## 多代理审计报告(2026-07)
- 103 agents,confirmed bugs 11 + worthIt 建议 56,全部已落地(#37–#43)。
- 报告 artifact:https://claude.ai/code/artifact/14058e6b-566c-4004-801d-baf77060c3ad
