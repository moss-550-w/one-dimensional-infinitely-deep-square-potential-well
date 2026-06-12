/**
 * graphData — 第五章「思想的长河」知识图谱数据（Claude.md 六·5 / design.md 第五章）。
 *
 * 设计红线（不可妥协）：
 *   1. 连线分四类并以不同颜色编码：启发(蓝)/解决(绿)/挑战(红)/独立发现(橙)。
 *   2. 哥德尔与海森堡之间**没有直接连线**——点击两者中间空白才浮现"理性的边界"反思，
 *      防止把不完备性与不确定性做误导性等同（Claude.md 六·5 关键规则）。
 *   3. 历史诚实：每条边只陈述其真实关系，不虚构严密因果链（design.md 零·历史的偶然性）。
 *
 * 中心节点为「一维无限深方势阱」，呼应全站唯一物理系统。
 */

/** 连线四种关系类型与配色（Claude.md 六·5）。 */
export const RELATION = Object.freeze({
  INSPIRED: { id: 'inspired', label: '启发', color: 0x3b82f6 }, // 蓝
  SOLVED: { id: 'solved', label: '解决了', color: 0x22c55e }, // 绿
  CHALLENGED: { id: 'challenged', label: '挑战', color: 0xef4444 }, // 红
  INDEPENDENT: { id: 'independent', label: '独立发现', color: 0xf59e0b }, // 橙
  CORE: { id: 'core', label: '汇入', color: 0x22d3ee } // 青：连向中心势阱（非四类历史关系，仅结构性指向）
});

/**
 * 节点：思想家与核心系统。
 * group: 'core' 中心系统 | 'math' 数学家 | 'physics' 物理学家 | 'logic' 逻辑/基础。
 */
export const NODES = [
  { id: 'well', name: '一维无限深方势阱', group: 'core', size: 1.5 },
  { id: 'pythagoras', name: '毕达哥拉斯', group: 'math', size: 0.9 },
  { id: 'newton', name: '牛顿', group: 'physics', size: 1.0 },
  { id: 'berkeley', name: '贝克莱', group: 'logic', size: 0.85 },
  { id: 'fourier', name: '傅里叶', group: 'math', size: 1.1 },
  { id: 'riemann', name: '黎曼', group: 'math', size: 0.95 },
  { id: 'cantor', name: '康托尔', group: 'math', size: 0.95 },
  { id: 'russell', name: '罗素', group: 'logic', size: 0.9 },
  { id: 'hilbert', name: '希尔伯特', group: 'math', size: 1.2 },
  { id: 'heisenberg', name: '海森堡', group: 'physics', size: 1.1 },
  { id: 'schrodinger', name: '薛定谔', group: 'physics', size: 1.1 },
  { id: 'vonneumann', name: '冯·诺依曼', group: 'math', size: 1.1 },
  { id: 'godel', name: '哥德尔', group: 'logic', size: 1.1 }
];

/**
 * 连线：source/target 引用节点 id，relation 取 RELATION，note 为点击时显示的诚实注解。
 * 注意：godel 与 heisenberg 间**刻意无边**（见 REFLECTION）。
 */
export const LINKS = [
  // —— 通向核心势阱：构成其数学/物理描述的支柱 ——
  { source: 'fourier', target: 'well', relation: 'CORE', note: '势阱波函数按本征态展开，正是傅里叶级数的语言。' },
  { source: 'hilbert', target: 'well', relation: 'CORE', note: '态是希尔伯特空间中的向量，测量是向本征基的投影。' },
  { source: 'schrodinger', target: 'well', relation: 'CORE', note: '定态薛定谔方程给出势阱的本征能量 Eₙ=n²π²ħ²/2mL²。' },
  { source: 'heisenberg', target: 'well', relation: 'CORE', note: '势阱中 Δx 受阱宽约束，Δp 随之有下界——不确定性具体显形。' },

  // —— 启发（蓝）——
  { source: 'pythagoras', target: 'fourier', relation: 'INSPIRED', note: '"万物皆数"与琴弦谐音：振动可分解为基频与泛音，是傅里叶分析的远古回声。' },
  { source: 'newton', target: 'schrodinger', relation: 'INSPIRED', note: '经典力学的运动方程，启发了对"波的运动方程"的追寻——但答案是全新的。' },
  { source: 'fourier', target: 'hilbert', relation: 'INSPIRED', note: '傅里叶把函数写成正交基的叠加，启发了"函数即向量"的几何视角。' },
  { source: 'riemann', target: 'hilbert', relation: 'INSPIRED', note: '黎曼的积分与流形思想，为函数空间的度量与完备性铺路。' },

  // —— 解决了（绿）——
  { source: 'fourier', target: 'riemann', relation: 'SOLVED', note: '傅里叶级数"收敛于什么"的追问，催生了黎曼对积分与收敛的严格定义。' },
  { source: 'hilbert', target: 'schrodinger', relation: 'SOLVED', note: '希尔伯特空间为薛定谔的波动力学提供了自洽的数学居所。' },
  { source: 'vonneumann', target: 'heisenberg', relation: 'SOLVED', note: '冯·诺依曼证明矩阵力学与波动力学是同一希尔伯特空间上的等价表述。' },

  // —— 挑战（红）——
  { source: 'berkeley', target: 'newton', relation: 'CHALLENGED', note: '贝克莱讥讽无穷小为"消失量的幽灵"，迫使微积分走向严格化。' },
  { source: 'russell', target: 'cantor', relation: 'CHALLENGED', note: '罗素悖论击中朴素集合论，动摇了康托尔无穷集合的地基。' },
  { source: 'russell', target: 'hilbert', relation: 'CHALLENGED', note: '基础危机挑战希尔伯特"将数学完全形式化"的纲领。' },

  // —— 独立发现（橙）——
  { source: 'heisenberg', target: 'schrodinger', relation: 'INDEPENDENT', note: '矩阵力学与波动力学几乎同时、以截然不同的形式被独立提出。' },
  { source: 'cantor', target: 'hilbert', relation: 'INSPIRED', note: '康托尔的无穷基数，让"无限维空间"成为可严肃讨论的对象。' }
];

/**
 * 理性的边界——哥德尔 ⟷ 海森堡之间的反思（两者无直接连线，Claude.md 六·5）。
 * 由场景在两节点中点放置一个"?"热点，点击才浮现，杜绝把两条定理简单等同。
 */
export const REFLECTION = {
  pair: ['godel', 'heisenberg'],
  title: '理性的边界',
  text: [
    '哥德尔不完备性，是关于形式系统自我指涉的极限；',
    '海森堡不确定性，是关于非对易算符的共同测量极限。',
    '将两者简单等同，是一种诱人却危险的哲学跳跃。',
    '它们来自不同方向，却共同标出同一件事——',
    '理性既有强大的建构力量，也有其内禀的边界'
  ]
};

/** 节点分组配色（与四类连线区分开，用于节点球体本身）。 */
export const GROUP_COLOR = Object.freeze({
  core: 0x22d3ee,
  math: 0x8b5cf6,
  physics: 0x3b82f6,
  logic: 0xf59e0b
});
