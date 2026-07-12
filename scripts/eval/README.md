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
兼容端点），Key 只从环境变量读取，绝不落盘。`--only id1,id2` 跑子集；
`--no-render` 跳过浏览器实测溢出；`--baseline <某次 scores.json>` 在报告里输出
逐指标 Δ。

## 指标（均为代理指标，看 Δ 不看绝对值）

- **结构合规**：cover/end 位置、页数区间、章节数、连续 bullets ≤2
- **容量违规**：逐版式字数/条数上限（镜像 prompt §8，防溢出第一道防线）
- **具体性锚点率**：内容页含数字/年份/百分比等真实锚点的比例（规则 §5）
- **观点句率**（代理：bullet 长度 ≥12 字）、**版式多样性**、bullets 页占比
- **imageQuery 纪律**：缺失/非英文/重复
- **讲稿覆盖率**（内容页有 ≥20 字 note）、不配平 `**`、语言错配
- **实测溢出**：每页按 1280×720 真渲染并跑 `fitSlide`，统计需缩放页与
  触及 0.4 下限页——容量上限没防住的真实溢出压力

## 产物

`scripts/eval/results/<时间戳-模式>/`：`decks/*.json`（原始课件）、
`scores.json`（机器可读，供 `--baseline`）、`report.md`（人读）。
结果目录已 gitignore；要保留的基线请刻意提交。

Playwright 从环境解析：优先 `PLAYWRIGHT_MODULE`，其次项目内 `playwright`，
再次沙箱路径；浏览器可用 `PW_CHROME` 指定。
