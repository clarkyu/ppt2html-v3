// Scenario deck templates (课件模板库): hand-curated DeckSpec skeletons whose
// placeholder copy is WRITING GUIDANCE (what to say on this page and how to
// say it well) rather than lorem — plus per-page speaker notes explaining how
// to deliver each page. Picking one instantiates a fresh editable deck.
//
// Authored via a parallel writer+judge pass, then mechanically validated
// against the per-page capacity rules in llm/prompt.ts (titles ≤20 chars,
// bullets ≤5×≤28, two-col ≤4×≤18, comparison ≤3×4×≤16, icons ∈ 33-key set).

import type { Deck, DeckSpec } from './types'
import { normalizeDeck } from './render/normalize'

export interface DeckTemplate {
  slug: string
  name: { zh: string; en: string }
  desc: { zh: string; en: string }
  spec: DeckSpec
}

/** A fresh Deck from a template (random id unless overridden for previews). */
export function instantiateTemplate(tpl: DeckTemplate, id?: string): Deck {
  return normalizeDeck(structuredClone(tpl.spec), {
    prompt: tpl.name.zh,
    id: id ?? crypto.randomUUID(),
  })
}

export const TEMPLATES: DeckTemplate[] = [
{
  "slug": "training",
  "name": {
    "zh": "技能培训工作坊",
    "en": "Skills Training Workshop"
  },
  "desc": {
    "zh": "企业内训或技能工作坊适用:按「目标→痛点→方法→练习→行动」组织课程,内置开场提问与分组演练两处互动设计位。",
    "en": "For corporate training and hands-on workshops: goals, pain points, method, practice and action, with two built-in interaction slots."
  },
  "spec": {
    "title": "技能培训工作坊模板",
    "subtitle": "目标 → 痛点 → 方法 → 练习 → 行动",
    "theme": "sand",
    "slides": [
      {
        "layout": "cover",
        "eyebrow": "企业内训 · 工作坊",
        "title": "课程名:一句能力承诺",
        "subtitle": "副标题:一句话说清对象与收获",
        "imageQuery": "workshop training room whiteboard",
        "note": "开场 30 秒定基调:自我介绍只留一句与主题相关的资历,马上抛出课程承诺。常见错误:念完整份履历——学员只关心「这课对我有什么用」。"
      },
      {
        "layout": "bullets",
        "title": "学习目标:学完你能做什么",
        "bullets": [
          "目标要写**可观察的行为**,不写「了解/掌握」",
          "如「独立完成一次结构化面谈」,能演示能检验",
          "最多 3 条:目标越少,课程越聚焦"
        ],
        "imageQuery": "archery target arrow bullseye",
        "note": "逐条念目标,并告诉学员课程结束前会如何检验这些目标。常见错误:把目标写成内容清单——「介绍…讲解…」是讲师视角,目标必须是学员的行为。",
        "bulletIcons": [
          "target",
          "check",
          "flag"
        ]
      },
      {
        "layout": "section",
        "eyebrow": "第一部分",
        "title": "痛点:为什么老办法失灵了",
        "subtitle": "一句话戳中学员每天的真实困扰",
        "imageQuery": "tangled rope knot closeup",
        "note": "章节页停留 10 秒即可,用一句过渡:「在讲方法之前,先看看我们现在到底卡在哪」。"
      },
      {
        "layout": "big-number",
        "value": "__%",
        "caption": "写一个让学员心头一紧的数字,并注明出处",
        "imageQuery": "falling dominoes chain reaction",
        "note": "停顿两秒再念数字,让冲击自己发生。数字必须和学员的日常损失相关(时间、钱、返工),并注明出处;找不到可靠数字就删掉这页改用真实案例,绝不编造。"
      },
      {
        "layout": "two-col",
        "title": "现状·差距:我们离标准有多远",
        "left": {
          "heading": "现状:大家的做法",
          "bullets": [
            "写具体行为,不写形容词",
            "如「口头交代,无确认」",
            "2~4 条,来自真实观察"
          ]
        },
        "right": {
          "heading": "期望:高手的做法",
          "bullets": [
            "同场景下的正确动作",
            "如「书面复述并确认」",
            "与左栏逐条对应"
          ]
        },
        "imageQuery": "canyon gap suspension bridge",
        "note": "左右逐条对照着讲,每念一条现状就问一句「有没有人中招?」。常见错误:把现状写成批评,学员会防御——用「我们都这样」的口吻,先共情再指出差距。"
      },
      {
        "layout": "image-text",
        "title": "互动:先听学员怎么说",
        "body": "把提问写在这里:一个与痛点直接相关、人人都答得上的问题。\n\n- 形式:举手 / 便签 / 弹幕接龙\n- 时长:3~5 分钟,给足冷场缓冲\n- 收口:复述 2~3 个学员原话",
        "imageQuery": "sticky notes brainstorm wall",
        "note": "这是第一处互动设计位:问完就闭嘴,数到十再救场,冷场是学员在思考。常见错误:自问自答——你一开口,学员就永远不会开口了。收口时点名引用学员原话,后面讲方法时再回扣。"
      },
      {
        "layout": "section",
        "eyebrow": "第二部分",
        "title": "方法:一个可复用的框架",
        "subtitle": "一句话概括框架,像口诀一样好记",
        "imageQuery": "compass map navigation trail",
        "note": "这里是全课的转折点,语气提起来:「吐槽完问题,接下来给大家一套能直接带走的工具」。"
      },
      {
        "layout": "timeline",
        "title": "方法框架:给套路起个名字",
        "steps": [
          {
            "label": "第一步",
            "text": "动词开头:这一步做什么、产出什么"
          },
          {
            "label": "第二步",
            "text": "每步一个动作,不要合并两件事"
          },
          {
            "label": "第三步",
            "text": "给一个判断标准:做到什么算完成"
          },
          {
            "label": "第四步",
            "text": "步骤 3~5 个为宜,多了记不住"
          }
        ],
        "imageQuery": "stepping stones river path",
        "note": "先报框架全貌再逐步展开,并给框架起一个好记的名字,比如「三查一确认」。常见错误:把步骤讲成知识点罗列——每一步都要回答「学员当下具体做什么」。"
      },
      {
        "layout": "comparison",
        "title": "新手误区 vs 高手做法",
        "items": [
          {
            "heading": "新手误区",
            "tone": "negative",
            "points": [
              "写真实出现的错误动作",
              "写错误的直接后果",
              "最多 4 条,别堆砌"
            ]
          },
          {
            "heading": "高手做法",
            "tone": "positive",
            "points": [
              "与左卡逐条对应",
              "写可模仿的动作",
              "附一个判断口诀"
            ]
          }
        ],
        "imageQuery": "chess pieces strategy board",
        "note": "用真实案例讲误区,最好是你自己踩过的坑,自嘲比说教有效十倍。常见错误:只讲对错不讲原因——每组对比都补一句「为什么新手会这样做」。"
      },
      {
        "layout": "section",
        "eyebrow": "第三部分",
        "title": "练习与行动:把方法带走",
        "subtitle": "从「听懂了」到「会做了」",
        "imageQuery": "climbing wall practice gym",
        "note": "明确告诉学员接下来要动手:收起手机、准备纸笔。练习的仪式感从这一刻开始建立。"
      },
      {
        "layout": "bullets",
        "title": "刻意练习:分组演练",
        "bullets": [
          "任务:写清要产出什么,如「一份完整话术」",
          "规则:几人一组、几分钟、谁来计时",
          "示范:先完整演示一遍,再放手让学员做",
          "点评:学员先互评,讲师最后补充"
        ],
        "imageQuery": "team workshop group discussion",
        "note": "这是第二处互动设计位,也是全课价值最高的 20 分钟——宁可砍内容,不砍练习。常见错误:任务太大做不完,把任务切到 10 分钟内有产出;巡场时只记录、不打断,把问题留到点评环节集中讲。",
        "bulletIcons": [
          "tool",
          "time",
          "idea",
          "chat"
        ]
      },
      {
        "layout": "timeline",
        "title": "行动计划:越具体越会发生",
        "steps": [
          {
            "label": "24 小时内",
            "text": "一个 10 分钟能完成的小动作"
          },
          {
            "label": "本周",
            "text": "在真实工作里完整用一次方法"
          },
          {
            "label": "本月",
            "text": "写下可检验的结果,如「用满 3 次」"
          }
        ],
        "imageQuery": "runner starting line track",
        "note": "让每人写下自己的三条,并说给同桌听——公开承诺会大幅提高执行率。常见错误:行动写成愿望,「多沟通」不是行动,「周三前约张三谈 15 分钟」才是。"
      },
      {
        "layout": "end",
        "title": "结束语:回扣开头的承诺",
        "subtitle": "一句话总结 + 答疑与联系方式",
        "imageQuery": "sunrise open road horizon",
        "note": "回到封面那句能力承诺,问学员「现在你能做到了吗」,然后留答疑时间。别用「谢谢大家」草草收尾——最后一句话决定学员带走什么。"
      }
    ]
  }
},
{
  "slug": "work-report",
  "name": {
    "zh": "工作汇报",
    "en": "Work Report"
  },
  "desc": {
    "zh": "向上级做周报/月报/季报等周期性进展汇报时用:结论先行、指标说话、不足敢讲、风险配动作、计划可验收。",
    "en": "For periodic progress reports to leadership: lead with the conclusion, let metrics speak, pair every risk with an action, and end with a verifiable plan."
  },
  "spec": {
    "title": "××团队 · 本期工作汇报",
    "subtitle": "结论先行 · 数字说话 · 风险有动作",
    "theme": "aurora",
    "slides": [
      {
        "layout": "cover",
        "eyebrow": "周期性工作汇报",
        "title": "××团队 · 本期工作汇报",
        "subtitle": "副标题写本期最大的一件事,不写「工作总结」",
        "imageQuery": "office desk morning light",
        "note": "开场 30 秒直接给结论,不要从「我先介绍一下背景」讲起。上级最想立刻听到:整体是好是坏、哪个数字最关键、有没有需要他做的事。"
      },
      {
        "layout": "bullets",
        "title": "结论先行:先说答案",
        "bullets": [
          "**总体判断**只选一个词:超预期 / 符合 / 低于",
          "给最硬的数字:如「营收 +23%,超目标 5 点」",
          "最需要老板知道的一件事:一个风险或一个请求"
        ],
        "imageQuery": "compass on map",
        "note": "金字塔原理:结论先行,论据后置。最常见的错误是按时间顺序讲过程,把结论留到最后——听众开会前 30 秒注意力最高,答案必须放在这里。讲完这页停一下,确认大家对总体判断没有异议,再往下讲。",
        "bulletIcons": [
          "flag",
          "up",
          "warning"
        ]
      },
      {
        "layout": "section",
        "eyebrow": "第一部分",
        "title": "进展盘点:数字与事实",
        "subtitle": "先讲指标,再讲亮点与不足",
        "imageQuery": "warehouse inventory shelves",
        "note": "章节页停 5 秒即可,报出本部分要回答的问题:这个周期我们到底做得怎么样?"
      },
      {
        "layout": "stats",
        "title": "关键指标:数字先说话",
        "stats": [
          {
            "value": "__%",
            "label": "核心结果 vs 目标"
          },
          {
            "value": "__",
            "label": "关键交付数"
          },
          {
            "value": "±__%",
            "label": "环比上期变化"
          },
          {
            "value": "__",
            "label": "质量或口碑指标"
          }
        ],
        "imageQuery": "speedometer gauge closeup",
        "note": "每个数字必须带比较基准——对目标、对上期、对同行,没有基准的数字毫无意义。只放 2~4 个能支撑第 2 页结论的指标,其余进附录;被追问时,你要能当场报出口径和数据来源。"
      },
      {
        "layout": "bullets",
        "title": "亮点:只讲有证据的成绩",
        "bullets": [
          "写具体行为:「响应时间从 3 天缩到 4 小时」",
          "写因果:动作 → 数字变化,不写形容词",
          "点名团队或个人贡献,功劳落到人",
          "最多 3 件事:亮点超过 3 个等于没有重点"
        ],
        "imageQuery": "trophy award ceremony",
        "note": "每个亮点都要经得起「So what」的追问:这件事让哪个指标动了?常见错误是罗列「完成了某某工作」——完成不等于成果,要讲它带来的变化和为什么值得听众在意。",
        "bulletIcons": [
          "check",
          "target",
          "team",
          "star"
        ]
      },
      {
        "layout": "two-col",
        "title": "不足:差距与原因分开写",
        "left": {
          "heading": "差距在哪(事实)",
          "bullets": [
            "写没达标的具体指标",
            "写差多少:如差 12%",
            "写影响到谁、影响什么"
          ]
        },
        "right": {
          "heading": "原因是什么(分析)",
          "bullets": [
            "区分外因与内因",
            "内因写到动作层面",
            "每条原因对应一条改进"
          ]
        },
        "imageQuery": "gap bridge canyon",
        "note": "敢讲不足反而加分——问题上级在别处早晚会知道。关键是把事实和归因分开:陈述事实不带情绪,分析原因不甩锅。常见错误:把原因全推给外部环境,或用「执行不到位」这种查不下去的空话。"
      },
      {
        "layout": "big-number",
        "value": "__%",
        "caption": "本期最值得被记住的一个数字",
        "imageQuery": "single spotlight stage",
        "note": "整场汇报能留下一个数字就是成功——挑对结论最有说服力的那个,放大讲透:它的口径、对比基准、背后含义。如果没有这样的数字,直接删掉这页,不要硬凑。"
      },
      {
        "layout": "section",
        "eyebrow": "第二部分",
        "title": "风险与下一步",
        "subtitle": "暴露问题,并给出你的动作",
        "imageQuery": "crossroads signpost sky",
        "note": "这一部分才是汇报的真正价值:上级要的不是完美,而是「问题在掌控之中」的确定感。"
      },
      {
        "layout": "comparison",
        "title": "风险分级:红黄绿",
        "items": [
          {
            "heading": "🔴 需要决策",
            "tone": "negative",
            "points": [
              "写风险的具体事实",
              "量化影响:钱或时间",
              "写清需要谁拍板什么"
            ]
          },
          {
            "heading": "🟡 持续跟进",
            "tone": "neutral",
            "points": [
              "写风险信号与阈值",
              "写你的监控动作",
              "写触发升级的条件"
            ]
          },
          {
            "heading": "🟢 已经化解",
            "tone": "positive",
            "points": [
              "写上期风险的结果",
              "一句话讲化解动作"
            ]
          }
        ],
        "imageQuery": "traffic light street dusk",
        "note": "风险页最常见的错误是只报风险不报动作,把焦虑传染给听众。每条红色风险必须配一个明确请求:要资源、要决策还是要授权。绿色一栏同样重要——它证明你有化解风险的能力。"
      },
      {
        "layout": "timeline",
        "title": "下一步:可验收的计划",
        "steps": [
          {
            "label": "本周",
            "text": "写立刻启动的动作,指定到人"
          },
          {
            "label": "两周内",
            "text": "写第一个可检查的里程碑"
          },
          {
            "label": "月内",
            "text": "写关键交付与它的验收标准"
          },
          {
            "label": "下周期",
            "text": "写目标数字,与本期指标呼应"
          }
        ],
        "imageQuery": "road milestones horizon",
        "note": "每一步都要能回答三个问题:谁来做、做到什么程度算完成、什么时候检查。常见错误是写「持续优化」「加强推进」——没有验收标准的计划等于没有计划。最后一步的目标数字,要能接得上第 4 页的指标。"
      },
      {
        "layout": "image-text",
        "title": "需要的支持:把求助说成选择题",
        "body": "把请求写成**可以当场拍板**的决策题:\n\n- 要什么:人 / 钱 / 时间 / 授权,给出数量\n- 为什么是现在:晚给的代价是什么\n- 给出 A/B 选项,并附上你的建议",
        "imageQuery": "handshake meeting table",
        "note": "会上能当场解决的求助,绝不要留到会后邮件。把开放题变成选择题:不问「怎么办」,而是「A 和 B 我建议 A,您看?」——决策成本越低,拿到支持越快。"
      },
      {
        "layout": "end",
        "title": "回到结论",
        "subtitle": "重申总体判断 + 你最需要的一个支持",
        "imageQuery": "sunrise open road",
        "note": "结尾 20 秒:重复第 2 页的结论和你的核心请求,然后停下来等回应。不要用「以上就是我的汇报」草草收尾——最后一句话决定了会后大家记住什么。"
      }
    ]
  }
},
{
  "slug": "product-launch",
  "name": {
    "zh": "产品发布会",
    "en": "Product Launch"
  },
  "desc": {
    "zh": "新品或新功能发布会:从悬念开场、痛点共鸣、产品亮相到数据背书与行动号召的完整叙事骨架。",
    "en": "For new product or feature launch events: a complete narrative skeleton from suspense hook and pain points to reveal, proof, and call to action."
  },
  "spec": {
    "title": "「产品名」新品发布会",
    "subtitle": "悬念开场 · 痛点共鸣 · 亮相与证明 · 行动号召",
    "theme": "rose",
    "slides": [
      {
        "layout": "cover",
        "eyebrow": "新品发布会",
        "title": "写一句**悬念**,别出现产品名",
        "subtitle": "副标题埋钩子:「关于 XX,今天将被重新定义」",
        "note": "开场自我介绍不要超过一句话。乔布斯发布 iPhone 时先说「今天我们将重新发明电话」,产品名压到最后才揭晓。常见错误:封面直接放产品截图和参数,悬念荡然无存。",
        "imageQuery": "stage spotlight dark theater"
      },
      {
        "layout": "big-number",
        "value": "××%",
        "caption": "写痛点规模的惊人数字,注出处",
        "note": "翻到这页先沉默三秒,让数字自己说话,再开口解释它意味着什么。数字要选听众切身有感的:与其说市场规模,不如说「每人每年浪费多少小时」。常见错误:用行业黑话数字,台下无感。",
        "imageQuery": "crowd waiting long line"
      },
      {
        "layout": "section",
        "eyebrow": "第一幕",
        "title": "痛点共鸣",
        "subtitle": "导语:描述听众每天都在忍受的那个瞬间",
        "note": "这一幕的目标是让观众心里说「对,这就是我」。用讲故事的口吻,不要用汇报的口吻。常见错误:急着讲产品——痛没铺够,解药就不值钱。",
        "imageQuery": "tangled cables messy desk"
      },
      {
        "layout": "bullets",
        "title": "三个无人解决的老问题",
        "bullets": [
          "写具体场景:「每周花 6 小时手动对数据」",
          "写代价:这个麻烦让用户损失了什么",
          "写无奈:为什么现有方案都没解决它"
        ],
        "note": "每讲完一条痛点停一拍,观察台下是否点头——点头率是发布会最早的成败信号。常见错误:痛点写成形容词(「效率低下」),要写成可画面化的行为和数字。",
        "imageQuery": "overflowing paperwork office desk",
        "bulletIcons": [
          "time",
          "cross",
          "warning"
        ]
      },
      {
        "layout": "section",
        "eyebrow": "第二幕",
        "title": "产品亮相",
        "subtitle": "此页只放产品名 + 一句话定位",
        "note": "这是全场情绪最高点:翻页前留两秒静默,再清晰念出产品名,像揭幕一样。One more thing 的仪式感就在这一页。常见错误:亮相页塞满功能参数,把高潮讲成说明书。",
        "imageQuery": "red curtain product unveiling"
      },
      {
        "layout": "image-text",
        "title": "一句话讲清它是什么",
        "body": "用「给谁 + 解决什么 + 凭什么」写一段话:\n\n- **给谁**:一个具体人群,越窄越有力\n- **解决什么**:呼应第一幕的痛点\n- **凭什么**:一个独特机制或技术",
        "note": "定位句要短到观众能原样转述给别人——他们复述不出来,传播就断了。常见错误:定位里堆三个卖点,结果一个都记不住。",
        "imageQuery": "sleek minimal device white"
      },
      {
        "layout": "bullets",
        "title": "只讲三个核心卖点",
        "bullets": [
          "卖点写收益不写功能:「导出快 10 倍」",
          "每个卖点配一个现场可演示的动作",
          "最强的那个放最后,给它一半时间"
        ],
        "note": "卖点超过三个等于没有卖点。把参数翻译成人话:「续航 5000mAh」要说成「两天不用充电」。常见错误:照着规格表念——观众买的是改变,不是配置。",
        "imageQuery": "product detail macro closeup",
        "bulletIcons": [
          "rocket",
          "target",
          "star"
        ]
      },
      {
        "layout": "section",
        "eyebrow": "第三幕",
        "title": "证明与行动",
        "subtitle": "导语:按数据、对比、证言、价格收拢信任",
        "note": "从这一幕起语气从激情切换到可信:放慢语速,像顾问,不像推销员。亮相之后观众心里只剩两个问题——「真的吗」和「多少钱」,这一幕按信任阶梯依次回答。常见错误:证明材料东拼西凑没有递进,应按数据、对比、证言、价格排列。",
        "imageQuery": "handshake office window light"
      },
      {
        "layout": "stats",
        "title": "数据背书:让第三方说话",
        "stats": [
          {
            "value": "××%",
            "label": "内测者的关键提升"
          },
          {
            "value": "×× 家",
            "label": "首批签约客户数"
          },
          {
            "value": "×× 万",
            "label": "等候名单人数"
          }
        ],
        "note": "每个数字都要经得起追问:样本多大、谁测的、哪个周期。宁可少放一个数,绝不编一个数。常见错误:用自夸型数据(满意度 99%),不如用行为型数据(续费率、日活)。",
        "imageQuery": "wooden abacus beads closeup"
      },
      {
        "layout": "comparison",
        "title": "和现有方案比,赢在哪",
        "items": [
          {
            "heading": "传统方案",
            "tone": "negative",
            "points": [
              "写用户的真实抱怨",
              "写它的结构性短板",
              "写迁移或学习成本"
            ]
          },
          {
            "heading": "我们(产品名)",
            "tone": "positive",
            "points": [
              "逐条对应地反打",
              "用数字量化差距",
              "写只有你能做到的"
            ]
          }
        ],
        "note": "对比要打在同一维度上、左右逐条对应;不点名贬低竞品,用「传统方案」指代更体面。常见错误:列十个维度全赢——观众只会记住你的心虚,选两三个真正的胜负手就够。",
        "imageQuery": "fork road two paths"
      },
      {
        "layout": "quote",
        "text": "贴一句内测用户的原话:要带具体数字和场景,不要形容词堆砌的夸奖。",
        "author": "姓名 · 公司与职位(真实可查)",
        "note": "证言的说服力来自具体身份加具体数字,「某互联网公司运营总监:每周省 5 小时」远胜「用户都说好」。念证言时放慢语速,像转述朋友的话。常见错误:匿名证言,基本等于没有证言。",
        "imageQuery": "customer portrait smiling interview"
      },
      {
        "layout": "timeline",
        "title": "价格与发售节奏",
        "steps": [
          {
            "label": "今天",
            "text": "公布价格:给一个低于预期的锚点"
          },
          {
            "label": "预售",
            "text": "写早鸟权益:限时价或限量礼"
          },
          {
            "label": "发售日",
            "text": "写具体日期与购买渠道"
          },
          {
            "label": "首批交付",
            "text": "写到手时间,管理好预期"
          }
        ],
        "note": "报价前先重述价值再揭价格,乔布斯的定价法是先展示一个高锚点(「按理该卖 999 美元」)再揭真实价格,掌声就在落差里。常见错误:价格页匆匆带过——这是观众最想听的一页。",
        "imageQuery": "calendar countdown launch date"
      },
      {
        "layout": "end",
        "title": "现在,只需一个动作",
        "subtitle": "写唯一 CTA:扫码预约 / 立即下单",
        "note": "结尾只给一个行动指令,给两个都嫌多。二维码或链接在屏幕上至少停留 30 秒,配一句紧迫感话术:「前 1000 名享早鸟价」。常见错误:结尾只写「谢谢」,现场热度白白流走。",
        "imageQuery": "phone qr code scan"
      }
    ]
  }
},
{
  "slug": "classroom",
  "name": {
    "zh": "课堂教学",
    "en": "Classroom Lesson"
  },
  "desc": {
    "zh": "为 K12/大学的一节课备课:从导入提问、概念讲解、例题示范到误区辨析、小结与分层作业的完整教学骨架。",
    "en": "Plan a single class session: hook question, concept teaching, worked example, misconception check, recap and tiered homework."
  },
  "spec": {
    "title": "课堂教学:一节课的完整骨架",
    "subtitle": "导入 · 概念 · 例题 · 误区 · 小结 · 作业",
    "theme": "sand",
    "slides": [
      {
        "layout": "cover",
        "eyebrow": "学科 · 年级 · 第 N 课",
        "title": "课题:一个引发好奇的问题",
        "subtitle": "副标题写清:学完这课能解决什么",
        "imageQuery": "classroom blackboard chalk morning",
        "note": "开场先不讲课:把课题当问题抛出去,请两位学生猜答案再往下走。常见错误是一上来就念目录——先制造好奇,再给地图。"
      },
      {
        "layout": "image-text",
        "title": "导入:一个答不准的问题",
        "body": "在这里写导入问题:取自学生生活或热点,答案反直觉最好。\n\n- 问题要能让全班分成两派\n- 别用「想不想知道」式假提问\n- 预设 1~2 个学生的典型回答",
        "imageQuery": "student raising hand classroom",
        "note": "抛出问题后停够 10 秒,至少听两个学生说出猜想再继续——沉默不是冷场,是思考。常见错误:自问自答,3 秒就公布答案,导入就废了。"
      },
      {
        "layout": "bullets",
        "title": "学习目标:能做到什么",
        "bullets": [
          "目标用「能+动词」写:能解释、能算、能判断",
          "一节课最多 **3 个**目标,多了等于没有",
          "写学生视角「你将能…」,不写「了解掌握」"
        ],
        "imageQuery": "dartboard bullseye arrow wood",
        "note": "逐条念目标,并告诉学生下课前会回来逐条对照——目标是契约,不是装饰。常见错误:目标写成「了解、体会」这类没法检验的词。",
        "bulletIcons": [
          "target",
          "check",
          "user"
        ]
      },
      {
        "layout": "section",
        "eyebrow": "新知环节",
        "title": "概念讲解:从已知到新知",
        "subtitle": "先接住旧知识,再引出新概念",
        "imageQuery": "open book desk lamp study",
        "note": "过渡时用一句话回收导入:『刚才那个问题,答案就藏在接下来这个概念里。』让新知带着悬念登场。"
      },
      {
        "layout": "two-col",
        "title": "概念界定:是什么·不是什么",
        "left": {
          "heading": "它是什么",
          "bullets": [
            "用一句大白话下定义",
            "给一个最典型的例子",
            "指出 1~2 个关键特征"
          ]
        },
        "right": {
          "heading": "它不是什么",
          "bullets": [
            "写最易混淆的邻近概念",
            "给一个「像但不是」的反例",
            "点破两者的判别标准"
          ]
        },
        "imageQuery": "two doors contrast architecture",
        "note": "概念教学的要害在边界:学生不是记不住定义,是分不清「像它但不是它」的东西。先例子后定义,比先定义后例子记得牢。"
      },
      {
        "layout": "timeline",
        "title": "讲解路径:四步搭桥",
        "steps": [
          {
            "label": "唤旧",
            "text": "从学生已经会的知识出发"
          },
          {
            "label": "搭桥",
            "text": "指出旧知识搞不定的新情况"
          },
          {
            "label": "立新",
            "text": "引出新概念,给核心定义"
          },
          {
            "label": "检验",
            "text": "回到导入问题,用新知解释"
          }
        ],
        "imageQuery": "stone bridge river mist",
        "note": "每走一步停一下问『到这里有问题吗』。新知识必须挂在旧知识上,凭空开讲学生只能死记。常见错误:跳过唤旧,直接立新。"
      },
      {
        "layout": "section",
        "eyebrow": "练习环节",
        "title": "例题与误区:练出手感",
        "subtitle": "先看老师做一遍,再自己错一遍",
        "imageQuery": "pencil notebook exercise desk",
        "note": "给学生一个锚:『接下来这道题会做,这节课就没白上。』用一道题为整个环节定标准。"
      },
      {
        "layout": "code",
        "title": "例题板书:四步示范",
        "language": "text",
        "code": "【题干】写一道覆盖本课核心概念的题\n【审题】圈出条件与所求,别急着动笔\n【联想】这道题对应哪个概念/哪条公式\n【解答】分步写,每一步只做一件事\n【回看】检验结果,说出这类题的套路",
        "imageQuery": "geometry compass ruler wooden desk",
        "note": "边写边把思考说出声(出声思维),让学生看见『老师是怎么想的』。常见错误:只演示正确步骤,不暴露『我为什么这么想』。"
      },
      {
        "layout": "comparison",
        "title": "常见误区:错在哪一步",
        "items": [
          {
            "heading": "典型错解",
            "tone": "negative",
            "points": [
              "贴一份真实学生错解",
              "标出出错的那一步",
              "写出背后的错误直觉"
            ]
          },
          {
            "heading": "正确思路",
            "tone": "positive",
            "points": [
              "对照给出正确的一步",
              "点破两者的关键差别",
              "给一句好记的判别法"
            ]
          }
        ],
        "imageQuery": "crossroads signpost countryside path",
        "note": "错解要用真实作业(匿名),编造的错误学生不信。先让全班找错、再公布答案——找错比听讲更能练出辨别力。"
      },
      {
        "layout": "quote",
        "text": "在这里写本课口诀:一句话装下方法,押韵更好记。",
        "author": "本课口诀 · 带全班齐读两遍",
        "imageQuery": "ink brush inkstone rice paper",
        "note": "口诀让方法可携带——考场上学生想起的往往不是定义而是口诀。带全班齐读两遍,声音会加深记忆;没有口诀就现场和学生一起编。"
      },
      {
        "layout": "bullets",
        "title": "小结:三句话带走",
        "bullets": [
          "一句话概念:今天学的核心到底是什么",
          "一句话方法:遇到这类题先做哪一步",
          "一句话误区:最容易在哪里掉坑"
        ],
        "imageQuery": "student backpack sunset road",
        "note": "小结别自己讲:点 2~3 个学生用自己的话说,你只补漏。然后回到学习目标逐条打勾,让学生亲眼看到『我做到了』。",
        "bulletIcons": [
          "book",
          "tool",
          "warning"
        ]
      },
      {
        "layout": "two-col",
        "title": "作业:必做与选做",
        "left": {
          "heading": "必做 · 人人过关",
          "bullets": [
            "2~3 题覆盖核心概念",
            "一题专打今天的误区",
            "总量 20 分钟内做完"
          ]
        },
        "right": {
          "heading": "选做 · 跳一跳",
          "bullets": [
            "一道综合或开放题",
            "鼓励一题多解",
            "写下一课的预习问题"
          ]
        },
        "imageQuery": "stack exercise books red pen",
        "note": "分层作业给每个学生台阶:必做保底,选做喂饱学有余力的。布置时说明每题对应哪个目标,学生才知道为什么要做。"
      },
      {
        "layout": "end",
        "title": "下课前,回到那个问题",
        "subtitle": "现在,你能回答开头的提问了吗",
        "imageQuery": "empty school corridor sunset",
        "note": "用导入的问题收尾,形成闭环:请一位课前答错的同学再答一次——这是整节课最有成就感的瞬间,也是学习发生的证据。"
      }
    ]
  }
},
{
  "slug": "retrospective",
  "name": {
    "zh": "项目复盘",
    "en": "Project Retrospective"
  },
  "desc": {
    "zh": "项目收尾后开复盘会用:从目标回顾、结果对照到根因分析、经验沉淀与改进行动的完整骨架。",
    "en": "For post-project retro meetings: review goals, compare results against targets, dig into root causes, and land lessons and improvement actions."
  },
  "spec": {
    "title": "「项目名」复盘",
    "subtitle": "回顾目标 · 对照结果 · 分析根因 · 沉淀规律",
    "theme": "forest",
    "slides": [
      {
        "layout": "cover",
        "eyebrow": "项目复盘",
        "title": "「项目名」复盘:**把学费赚回来**",
        "subtitle": "一句话:这次复盘最想让团队记住什么",
        "imageQuery": "rearview mirror mountain road",
        "note": "开场 30 秒先立规矩:复盘对事不对人,发言只谈事实与机制。常见错误是一开场就追责,团队立刻进入防御,后面听到的全是场面话。"
      },
      {
        "layout": "section",
        "eyebrow": "第一部分",
        "title": "回看:目标与结果",
        "subtitle": "先对照事实,再谈观点",
        "imageQuery": "compass paper map desk",
        "note": "介绍复盘四步法:回顾目标、评估结果、分析原因、总结规律,本章只做前两步。常见错误是跳过目标直接吐槽过程,复盘就变成了诉苦会。"
      },
      {
        "layout": "bullets",
        "title": "目标回顾:回到出发点",
        "bullets": [
          "抄立项时的**原话**:目标数字与截止日",
          "写下当时的关键假设:后来成立了吗",
          "列成功标准:当初说好怎么算赢",
          "目标若中途改过,写明何时、为何改"
        ],
        "imageQuery": "archery target arrow bullseye",
        "note": "这一页只陈述、不评价。常见错误是用今天的记忆改写当初的目标——后见之明会让复盘失真,务必回到立项文档抄原文。",
        "bulletIcons": [
          "target",
          "question",
          "check",
          "flag"
        ]
      },
      {
        "layout": "stats",
        "title": "结果对照:数字不撒谎",
        "stats": [
          {
            "value": "__%",
            "label": "核心目标达成率"
          },
          {
            "value": "±__天",
            "label": "进度偏差"
          },
          {
            "value": "±__%",
            "label": "预算偏差"
          },
          {
            "value": "__个",
            "label": "上线后问题数"
          }
        ],
        "imageQuery": "dashboard gauges cockpit instruments",
        "note": "每个数字都按“目标多少、实际多少、差在哪”来讲。常见错误是只报好看的数字、回避没达成的——复盘的信用就毁在这一页。"
      },
      {
        "layout": "two-col",
        "title": "亮点与不足:**只写行为**",
        "left": {
          "heading": "✅ 做得好(要保持)",
          "bullets": [
            "写具体动作,不写形容词",
            "例:每日站会同步风险",
            "注明是谁、在哪个环节"
          ]
        },
        "right": {
          "heading": "❌ 待改进(要改变)",
          "bullets": [
            "写事实与后果,不贴标签",
            "例:需求冻结晚了两周",
            "不足条数不少于亮点"
          ]
        },
        "imageQuery": "balance scale wooden desk",
        "note": "强调:形容词(给力、拉胯)无法复用,只有行为才能被复制或规避。常见错误是亮点写满一栏、不足只有一条客套话——那说明还没人敢说真话。"
      },
      {
        "layout": "section",
        "eyebrow": "第二部分",
        "title": "深挖:根因分析",
        "subtitle": "从表象追到机制,不停在“谁的错”",
        "imageQuery": "tree roots soil underground",
        "note": "本章进入“分析原因”。先声明:接下来提到的所有名字只用于还原事实,不用于追责——这句话说在前面,后面才挖得动。"
      },
      {
        "layout": "timeline",
        "title": "五个为什么:追问到根因",
        "steps": [
          {
            "label": "表象",
            "text": "写观察到的问题:如上线延期两周"
          },
          {
            "label": "为什么①",
            "text": "直接原因:联调时发现接口不符"
          },
          {
            "label": "为什么②",
            "text": "过程原因:接口文档一直没冻结"
          },
          {
            "label": "为什么③",
            "text": "机制原因:评审会没有验收标准"
          },
          {
            "label": "根因",
            "text": "追到流程或机制缺失即可停"
          }
        ],
        "imageQuery": "domino chain falling closeup",
        "note": "示范一条完整追问链,再让团队照着填自己的问题。常见错误有两个:问两层就停,停在“某人疏忽”;或为凑五层硬编——追到机制层就够了。"
      },
      {
        "layout": "comparison",
        "title": "归因于人 vs 归因于机制",
        "items": [
          {
            "heading": "❌ 归因于人",
            "tone": "negative",
            "points": [
              "结论:下次小心点",
              "无法防止再发生",
              "团队学会隐瞒问题"
            ]
          },
          {
            "heading": "✅ 归因于机制",
            "tone": "positive",
            "points": [
              "结论:改流程改工具",
              "换谁来都不再犯",
              "问题敢摆上桌面"
            ]
          }
        ],
        "imageQuery": "gears machinery mechanism brass",
        "note": "这是复盘文化的分水岭。判断标准只问一句:换一个人在同样位置,会不会犯同样的错?会,那就是机制问题,改机制而不是换人。"
      },
      {
        "layout": "section",
        "eyebrow": "第三部分",
        "title": "沉淀:经验与行动",
        "subtitle": "不落成规律和行动,复盘等于白开",
        "imageQuery": "notebook fountain pen library",
        "note": "前两章是看过去,本章是改未来。常见错误是复盘会开得很热烈、散会即忘——接下来两页就是防遗忘的:一页存规律,一页派行动。"
      },
      {
        "layout": "quote",
        "text": "我们并不是从经验中学习,而是从对经验的反思中学习。",
        "author": "约翰·杜威(教育哲学家)",
        "imageQuery": "still lake reflection dawn",
        "note": "用这句话给沉淀部分定调:项目本身不会自动变成能力,写下来的规律才会。念完停顿两秒,再翻下一页。"
      },
      {
        "layout": "image-text",
        "title": "经验卡:把教训写成规律",
        "body": "好经验是**可迁移的规律**,不是流水账。\n\n- 句式:当__情况出现,应__,因为__\n- 每条注明适用边界与例外\n- 3~5 条,存入团队知识库",
        "imageQuery": "index cards handwritten notes",
        "note": "念一条示范:“当需求方超过两个时,应指定唯一决策人,因为多头意见会拖垮排期。”常见错误是写成“要加强沟通”这类口号——套话进不了知识库。"
      },
      {
        "layout": "bullets",
        "title": "改进行动:到人、到日",
        "bullets": [
          "每条行动 = 动词 + 负责人 + 截止日",
          "例:6月前把接口评审纳入流程,张三负责",
          "最多 3 条:超过三条等于没有",
          "定好复查点:谁、在何时验收效果"
        ],
        "imageQuery": "checklist clipboard pen desk",
        "note": "行动只留三条,因为改机制成本很高,贪多必然全部落空。散会前当场认领负责人,别留“会后再定”——会后就没有然后了。",
        "bulletIcons": [
          "flag",
          "check",
          "warning",
          "time"
        ]
      },
      {
        "layout": "end",
        "title": "复盘结束,改进开始",
        "subtitle": "__月__日,我们回来复查这三条行动",
        "imageQuery": "sunrise open road horizon",
        "note": "结束语一定点出复查日期,让行动有闭环。最后感谢每一位说了真话的人——那是复盘里最稀缺的资源。"
      }
    ]
  }
},
{
  "slug": "pitch",
  "name": {
    "zh": "商业提案",
    "en": "Business Pitch"
  },
  "desc": {
    "zh": "向客户、领导或投资人争取一个决定时用:从抓注意力的提问,到算清代价与回报,再到小到难以拒绝的下一步。",
    "en": "For pitching clients, executives, or investors: a persuasion arc from an attention-grabbing question to an easy-to-say-yes next step."
  },
  "spec": {
    "title": "商业提案:让对方说\"是\"的结构",
    "subtitle": "问题 → 代价 → 方案 → 回报 → 信任 → 行动",
    "theme": "noir",
    "slides": [
      {
        "layout": "cover",
        "eyebrow": "商业提案",
        "title": "帮[客户]把[痛点]变成[收益]",
        "subtitle": "提案对象 · 你的公司 · 日期",
        "imageQuery": "city skyline sunrise aerial",
        "note": "封面标题别放产品名,放对方能得到的结果——按左边的公式填空。开口第一句也不是自我介绍,直接进下一页的提问。常见错误:把封面当名片用,堆满 logo 和头衔。"
      },
      {
        "layout": "image-text",
        "title": "开场钩子:先问一个扎心的问题",
        "body": "用对方的日常场景提问:『每当__发生,你们要多花多少钱、多少天?』\n\n- 问题必须指向对方的钱、时间或风险\n- 目标是让对方在心里说\"确实是\"",
        "imageQuery": "spotlight dark stage",
        "note": "前 30 秒决定对方要不要认真听。最常见的错误是先讲公司历史和团队介绍——没人关心。先让对方对问题点头,你后面说的每一句才有人听。"
      },
      {
        "layout": "big-number",
        "value": "__ 万/年",
        "caption": "维持现状,每年流失的成本",
        "imageQuery": "leaking faucet water drops",
        "note": "把损失算成一个年化数字,算法要经得起追问:工时×人数×单价,或错单率×客单价。宁可保守也别高估——数字一旦被当场挑战,后面的信任就没了。"
      },
      {
        "layout": "bullets",
        "title": "现状 · 差距 · 原因",
        "bullets": [
          "**现状**:写可观察的事实,如\"审批平均走 5 天\"",
          "**差距**:对标行业头部,或对方自己定的目标",
          "**原因**:点出根因,而不是罗列表面现象",
          "**为何是现在**:政策、竞品或成本正在变化"
        ],
        "imageQuery": "canyon gap rope bridge",
        "note": "这一页回答\"问题为什么存在、为什么现在必须解决\"。常见错误:把原因归咎到在场的人身上——要描述流程和系统的毛病,别让听众觉得自己被批评。",
        "bulletIcons": [
          "search",
          "target",
          "question",
          "time"
        ]
      },
      {
        "layout": "section",
        "eyebrow": "方案 · 回报",
        "title": "我们的方案",
        "subtitle": "一句话说清:用什么方式,消掉前面那个数字",
        "imageQuery": "lightbulb glowing dark room",
        "note": "章节页停两秒再翻,给听众一个换挡信号。口头预告:\"接下来五分钟,讲我们怎么把刚才那个数字降下来。\"别在这页展开细节。"
      },
      {
        "layout": "timeline",
        "title": "方案:落地路径与见效点",
        "steps": [
          {
            "label": "第 1 步",
            "text": "写动作与交付物,如\"两周完成数据接入\""
          },
          {
            "label": "第 2 步",
            "text": "每一步给出时间点,让对方看到节奏"
          },
          {
            "label": "第 3 步",
            "text": "写清对方需要配合什么,别藏到签约才说"
          },
          {
            "label": "见效点",
            "text": "标出第一个可验证成果何时出现"
          }
        ],
        "imageQuery": "stone steps garden path",
        "note": "方案页不是讲技术,是让对方相信\"能落地、有节奏、我方省心\"。常见错误:一口气讲架构图——细节放附录,被问到再展开,主线只讲步骤和时间。"
      },
      {
        "layout": "two-col",
        "title": "之前 vs 之后",
        "left": {
          "heading": "现在的做法",
          "bullets": [
            "写具体行为与耗时",
            "如\"人工核对要 3 天\"",
            "突出重复劳动与出错"
          ]
        },
        "right": {
          "heading": "用我们之后",
          "bullets": [
            "同一件事的新做法",
            "如\"自动核对 10 分钟\"",
            "数字与左栏一一对应"
          ]
        },
        "imageQuery": "forest fork road split",
        "note": "左右必须一一对应:同一件事、两种做法,对比才有力。常见错误:右栏写一堆功能名词——写结果,不写功能;每一行都要能让对方脑补出画面。"
      },
      {
        "layout": "stats",
        "title": "价值与回报:把账算给对方看",
        "stats": [
          {
            "value": "__%",
            "label": "成本下降幅度"
          },
          {
            "value": "__ 倍",
            "label": "第一年投资回报"
          },
          {
            "value": "__ 个月",
            "label": "收回投入的时间"
          }
        ],
        "imageQuery": "calculator coins wooden desk",
        "note": "回报页只留 3 个数,每个数都要能当场口头拆出算法。常见错误:放 8 个指标显得全面——对方只会记住 1 个,你要替他选好那一个,通常是回本时间。"
      },
      {
        "layout": "section",
        "eyebrow": "信任 · 行动",
        "title": "凭什么是我们",
        "subtitle": "对方心里一定在比较,你要主动替他比",
        "imageQuery": "chess board king pieces",
        "note": "进入信任环节。别急着自夸:先承认对方有别的选择,再给差异点——主动比较比回避比较可信得多。这一页只做预告,比较放下一页。"
      },
      {
        "layout": "comparison",
        "title": "三种选择,摆在桌面上",
        "items": [
          {
            "heading": "维持现状",
            "tone": "negative",
            "points": [
              "代价见前面那页",
              "问题只会越来越贵",
              "\"再等等\"也是决定"
            ]
          },
          {
            "heading": "其他方案",
            "tone": "neutral",
            "points": [
              "客观承认对手长处",
              "再点出关键短板",
              "摆事实,不贬低"
            ]
          },
          {
            "heading": "选择我们",
            "tone": "positive",
            "points": [
              "写可验证的差异点",
              "如专利、案例、团队",
              "给出兜底承诺"
            ]
          }
        ],
        "imageQuery": "three doors hallway",
        "note": "把\"维持现状\"列为第一个对手——多数提案输给的不是竞品,是\"再等等\"。夸对手一句再谈差异,你的可信度反而更高;贬低对手只会显得心虚。"
      },
      {
        "layout": "quote",
        "text": "放一句真实客户或试点用户的原话,带具体数字或场景",
        "author": "客户公司 · 职位 · 姓名(须真实可查)",
        "imageQuery": "handshake office window",
        "note": "证言是第三方替你说话,比自夸有力十倍。还没有客户?换成试点数据或行业权威的判断。绝不能编——一句假证言会毁掉前面攒下的全部信任。"
      },
      {
        "layout": "bullets",
        "title": "下一步:只要一个决定",
        "bullets": [
          "**只提一个请求**:如\"授权两周试点\"",
          "门槛要低:小范围、可退出、有明确期限",
          "写清双方各投入什么:人、数据、时间",
          "给出你的承诺,如\"48 小时内出评估报告\""
        ],
        "imageQuery": "fountain pen contract signature",
        "note": "提案大多死在结尾:讲完只问\"大家有什么问题吗\"。正确做法是给一个小到难以拒绝的下一步,并当场把时间定下来——离场前拿到日程,比拿到夸奖有用。",
        "bulletIcons": [
          "flag",
          "key",
          "team",
          "time"
        ]
      },
      {
        "layout": "end",
        "title": "回到开场那个问题",
        "subtitle": "一句话重述:选择我们,痛点变成收益",
        "imageQuery": "mountain summit sunrise horizon",
        "note": "收尾回扣开场的提问,形成闭环:\"还记得开头那个数字吗?它可以从下个月开始变小。\"留下联系方式,但更重要的是——确认下一步的日程再离场。"
      }
    ]
  }
}
]
