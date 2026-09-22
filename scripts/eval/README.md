# 课件质量评测（prompt 回归）

改 `DECK_SCHEMA_GUIDE`（或任何生成 prompt）之前先跑基线，改完再跑一次对比——
让质量迭代看得见增减，而不是凭手感。

## 三种模式

```bash
npm run eval -- --mock     # 评分器自测（内置好/坏两份 fixture，秒级，无网络）
npm run eval -- --local    # 给内置示例课件 + 6 个模板打分（零 API，含实测溢出）
EVAL_LLM_KEY=sk-... npm run eval   # golden set 真实生成（16 个固定主题）
```

真实生成默认走 DeepSeek（`EVAL_LLM_BASE` / `EVAL_LLM_MODEL` 可换任意 OpenAI
兼容端点），Key 只从环境变量读取，绝不落盘。`--only id1,id2` 跑子集（未知 id
直接报错退出）；`--no-render` 跳过浏览器实测溢出；`--baseline <某次 scores.json>`
在报告里输出逐指标 Δ（路径不存在或无法解析同样报错退出，不会静默跑成"无对比"）。
带时长的主题会像产品一样换算成 `slideCount`（`home.ts` 同一公式），页数目标也由此而来。

## 契约只有一份

容量上限、内容页集合、字数折算与逐页检查都在 `src/lib/qualityContract.js`
（纯 ESM，Node 与浏览器共用）：产品里的「一键精修」（`src/lib/quality.ts`）
和这里的评分器跑的是**同一段代码**；`llm/prompt.ts` §8 把同样的数字讲给模型。
改上限时三处一起改，`--mock` 自测里有一致性断言。

字数按**中文字**计：拉丁字母算 ½、空格算 ¼——一条约 10 个英文单词的 bullet
和 28 个汉字的 bullet 落在同一条线上（此前英文课件按原始字符数计，精修几乎
把每一页英文都改成碎片）。

## 指标（均为代理指标，看 Δ 不看绝对值）

- **结构合规**：cover/end 位置、页数区间、章节数、连续 bullets ≤2
- **容量违规**：逐版式字数/条数上限（镜像 prompt §8，防溢出第一道防线）
- **具体性锚点率**：内容页（quote 除外）含数字/年份/百分比锚点或可指名案例（启发式）的比例（规则 §5）
- **观点句率**（代理：中文 bullet ≥12 字 / 英文 ≥6 词）、**版式多样性**、bullets 页占比
- **imageQuery 纪律**：缺失/非英文/重复
- **讲稿覆盖率**（内容页有 ≥20 字 note）、不配平 `**`、语言错配
- **实测溢出**：每页按 1280×720 真渲染并跑 `fitSlide`，统计需缩放页与
  触及 0.4 下限页——容量上限没防住的真实溢出压力

## 产物

`scripts/eval/results/<时间戳-模式>/`：`decks/*.json`（原始课件）、
`scores.json`（机器可读，供 `--baseline`）、`report.md`（人读）。
结果目录已 gitignore；要保留的基线，把 `scores.json` 复制到
`scripts/eval/baselines/<名字>.json`（该目录不被忽略）再提交，或 `git add -f`。

Playwright 从环境解析：优先 `PLAYWRIGHT_MODULE`，其次项目内 `playwright`，
再次沙箱路径；浏览器可用 `PW_CHROME` 指定。
