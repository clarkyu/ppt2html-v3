import type { Deck, DeckSpec } from './types'
import { normalizeDeck } from './render/normalize'

// A hand-authored deck that exercises every layout + theme variable,
// used to verify the renderer and player before the AI is wired up.
const SAMPLE_SPEC: DeckSpec = {
  title: '如何做一次打动人心的演讲',
  subtitle: '从结构到表达的 6 个关键',
  theme: 'aurora',
  slides: [
    {
      layout: 'cover',
      eyebrow: '演讲课',
      title: '如何做一次**打动人心**的演讲',
      subtitle: '结构、故事与表达——把想法讲进听众心里',
    },
    {
      layout: 'section',
      eyebrow: '第一部分',
      title: '为什么大多数演讲很无聊',
      subtitle: '不是内容不好，而是没有为“听”而设计',
    },
    {
      layout: 'bullets',
      title: '无聊演讲的三宗罪',
      bullets: [
        '**信息堆砌**：一次讲太多，听众记不住',
        '**没有主线**：一页一个主题，缺少贯穿的故事',
        '**自说自话**：只讲“我想说的”，不讲“听众关心的”',
      ],
      note: '提醒学员：观众的注意力平均只有 10 分钟，主线比信息量更重要。',
    },
    {
      layout: 'big-number',
      value: '10 分钟',
      caption: '这是听众能保持高度专注的平均时长',
    },
    {
      layout: 'two-col',
      title: '把“信息”改写成“信息 + 意义”',
      left: {
        heading: '❌ 只有信息',
        bullets: ['我们的营收增长了 30%', '用户数达到 200 万', '上线了 5 个新功能'],
      },
      right: {
        heading: '✅ 信息 + 意义',
        bullets: [
          '增长 30%，意味着我们跑赢了大盘',
          '200 万用户，等于每 8 秒就有人加入',
          '5 个新功能，都在解决同一个痛点',
        ],
      },
    },
    {
      layout: 'timeline',
      title: '一场演讲的黄金结构',
      steps: [
        { label: '钩子', text: '用一个问题或故事，30 秒抓住注意力' },
        { label: '冲突', text: '点出听众真正在意的问题' },
        { label: '方案', text: '给出你的核心观点与证据' },
        { label: '行动', text: '让听众明确“接下来做什么”' },
      ],
    },
    {
      layout: 'comparison',
      title: '照读 PPT vs. 讲故事',
      items: [
        {
          heading: '照着念',
          tone: 'negative',
          points: ['听众在读，不在听', '声音平淡无起伏', '结束即被遗忘'],
        },
        {
          heading: '讲故事',
          tone: 'positive',
          points: ['画面感带动情绪', '有节奏、有停顿', '被记住、被转述'],
        },
      ],
    },
    {
      layout: 'quote',
      text: '人们会忘记你说过的话，但永远记得你带给他们的感受。',
      author: 'Maya Angelou',
    },
    {
      layout: 'image-text',
      title: '排练，是唯一的捷径',
      body:
        '真正自然的表达，来自**充分的排练**。\n\n- 至少完整排练 3 遍\n- 录下来回看自己的语速与停顿\n- 对着镜子或朋友讲一遍',
    },
    {
      layout: 'code',
      title: '开场的“黄金 30 秒”模板',
      language: 'text',
      code:
        '想象一下 [听众熟悉的场景]，\n此刻你正面临 [一个具体的问题]。\n\n如果有一种方法，能让你 [渴望的结果]，\n你愿意花接下来 10 分钟听我讲吗？',
    },
    {
      layout: 'end',
      title: '现在，去讲一个好故事',
      subtitle: '结构给人记忆，故事给人共鸣',
    },
  ],
}

export function getSampleDeck(): Deck {
  return normalizeDeck(SAMPLE_SPEC, { prompt: '如何做一次打动人心的演讲', id: 'sample-deck' })
}
