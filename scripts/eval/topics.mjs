// Golden-set topics for prompt-quality regression runs. Fixed on purpose:
// the same inputs across runs is what makes score deltas attributable to
// prompt changes. Edit deliberately — changing a topic resets its baseline.
//
// Spread: the six template scenarios (training / report / launch / classroom /
// retro / pitch) + science, tech, humanities, health; two English topics; two
// with duration pressure (short & long); one with pasted material.

export const TOPICS = [
  { id: 'train-comm', topic: '给团队做一次高效沟通培训', opts: {} },
  { id: 'report-q2', topic: '增长团队二季度工作汇报', opts: { durationMinutes: 10 } },
  { id: 'launch-app', topic: '发布一款帮助小学生练口算的 App', opts: {} },
  { id: 'class-photosyn', topic: '给初中生讲清楚光合作用', opts: {} },
  { id: 'retro-outage', topic: '一次线上事故的复盘：从故障到机制', opts: {} },
  { id: 'pitch-saas', topic: '向客户提案：用 SaaS 替换自建报表系统', opts: {} },
  { id: 'sci-carbon', topic: '三分钟看懂碳中和', opts: { durationMinutes: 5 } },
  { id: 'tech-ml', topic: '用一节课讲清楚什么是机器学习', opts: { durationMinutes: 30 } },
  { id: 'hum-songci', topic: '宋词的美学世界', opts: {} },
  { id: 'health-strength', topic: '如何科学地进行力量训练', opts: {} },
  { id: 'biz-finance', topic: '公司财报怎么看', opts: { richContent: true } },
  { id: 'edu-reading', topic: '如何培养孩子的阅读习惯', opts: { richContent: false } },
  { id: 'en-onboarding', topic: 'Onboard new hires to our core values', opts: {} },
  { id: 'en-timemgmt', topic: 'Time management for new professionals', opts: { durationMinutes: 15 } },
  {
    id: 'material-review',
    topic: '增长团队半年复盘',
    opts: {
      material:
        '一、上半年结果\n- 转化率从 2.1% 提升到 2.9%\n- 获客成本下降 12%，NPS 达到 62\n' +
        '二、三个关键动作\n- 上线落地页 A/B 测试框架\n- 注册流程从 7 步减到 3 步\n- 客服话术库重写\n' +
        '三、下半年计划\n- 目标转化率 3.5%\n- 复购率提升到 28%',
    },
  },
  { id: 'psy-effects', topic: '带你认识常见的心理学效应', opts: {} },
]
