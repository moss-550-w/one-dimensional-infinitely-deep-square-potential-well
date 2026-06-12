/**
 * QuantumMath — 量子力学与傅里叶数学计算库。
 *
 * 本模块为「一维无限深方势阱」唯一物理系统提供精确的数学内核。
 * 视觉层一律派生于此处的计算结果，禁止在渲染层另行近似（Claude.md 二·5 / 九·3）。
 *
 * 单位约定（自然单位）：默认 ħ = 1, m = 1, L = 1。
 * 所有公开函数允许通过 opts 覆盖 { hbar, mass, wellWidth }，以便后续接入真实常量。
 *
 * 势阱定义：V(x) = 0, 0 < x < L; V(x) = ∞ 其余。本征态（实值）：
 *   ψ_n(x) = sqrt(2/L) · sin(nπx/L),  n = 1, 2, 3, ...
 *   E_n    = n²π²ħ² / (2 m L²)
 */

/** 默认物理参数（自然单位）。 */
export const DEFAULTS = Object.freeze({
  hbar: 1,
  mass: 1,
  wellWidth: 1
});

/**
 * 第 n 个能量本征值 E_n = n²π²ħ²/(2mL²)。
 * @param {number} n 量子数（正整数）
 * @param {{hbar?:number, mass?:number, wellWidth?:number}} [opts]
 * @returns {number} 能量本征值
 */
export function eigenEnergy(n, opts = {}) {
  assertQuantumNumber(n);
  const { hbar, mass, wellWidth } = { ...DEFAULTS, ...opts };
  return (n * n * Math.PI * Math.PI * hbar * hbar) / (2 * mass * wellWidth * wellWidth);
}

/**
 * 能级比 E_n / E_1 = n²。用于可视化时无量纲的能级间距展示。
 * @param {number} n 量子数（正整数）
 * @returns {number}
 */
export function eigenEnergyRatio(n) {
  assertQuantumNumber(n);
  return n * n;
}

/**
 * 第 n 个本征函数在位置 x 处的取值 ψ_n(x) = sqrt(2/L)·sin(nπx/L)。
 * 阱外（x ≤ 0 或 x ≥ L）返回 0，满足无限深势阱边界条件。
 * @param {number} n 量子数（正整数）
 * @param {number} x 位置
 * @param {{wellWidth?:number}} [opts]
 * @returns {number} 波函数振幅
 */
export function eigenFunction(n, x, opts = {}) {
  assertQuantumNumber(n);
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  if (x <= 0 || x >= L) return 0;
  return Math.sqrt(2 / L) * Math.sin((n * Math.PI * x) / L);
}

/**
 * 复合波函数 ψ(x) = Σ c_n ψ_n(x)（t=0，实值）。
 * @param {number[]} coeffs 系数数组，coeffs[i] 对应量子数 n=i+1
 * @param {number} x 位置
 * @param {{wellWidth?:number}} [opts]
 * @returns {number}
 */
export function superpose(coeffs, x, opts = {}) {
  let sum = 0;
  for (let i = 0; i < coeffs.length; i++) {
    sum += coeffs[i] * eigenFunction(i + 1, x, opts);
  }
  return sum;
}

/**
 * 复合 Simpson 数值积分 ∫ₐᵇ f(x) dx。
 * @param {(x:number)=>number} f 被积函数
 * @param {number} a 下限
 * @param {number} b 上限
 * @param {number} [steps=2000] 区间数（自动取偶）
 * @returns {number}
 */
export function integrate(f, a, b, steps = 2000) {
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h);
  }
  return (h / 3) * sum;
}

/**
 * 本征态归一化模长 ∫₀ᴸ |ψ_n|² dx，理论值应为 1。
 * @param {number} n 量子数
 * @param {{wellWidth?:number}} [opts]
 * @returns {number}
 */
export function normalizationOf(n, opts = {}) {
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  return integrate((x) => eigenFunction(n, x, opts) ** 2, 0, L);
}

/**
 * 判断一组展开系数是否满足归一化 Σ|c_n|² ≈ 1。
 * @param {number[]} coeffs 实系数数组
 * @param {number} [tol=1e-6] 容差
 * @returns {boolean}
 */
export function isCoefficientSetNormalized(coeffs, tol = 1e-6) {
  const sum = coeffs.reduce((acc, c) => acc + c * c, 0);
  return Math.abs(sum - 1) < tol;
}

/* ===== 傅里叶分析（第二章：波的语言） ===== */

/**
 * Wilbraham–Gibbs 常数 (2/π)·Si(π) ≈ 1.17898。
 *
 * 物理含义：对纯正弦基 sin(nπx/L) 展开「在 (0,L) 内取值 1」的目标函数，
 * 端点 x=0,L 处级数恒为 0（sin 为零），故端点附近存在 0→1 的跳变。
 * 部分和在该跳变邻域的过冲峰极限值即为本常数 ≈1.17898 —— 即超出收敛值 1
 * 约 17.9%。该过冲量恰为「跳变幅度」的 8.949%（0.0894898…），这正是
 * Claude.md 标注 1.08949 的来源：它对应「0→1 半幅方波」的峰值 (1+G)/2。
 *
 * 关键诚实性（Claude.md 二·5 / 六·2）：本项目用纯正弦级数逼近「值为 1」的方波，
 * 其曲线真实峰值就是 ≈1.179，过冲不随项数 N 消失，绝不可"假装完美逼近"。
 */
export const GIBBS_CONSTANT = 1.1789797444721673;

/**
 * 方波正弦级数第 k 个奇谐波（次数 n=2k−1）的理想振幅 b_n = 4/(πn)。
 * @param {number} k 谐波序号（正整数，对应次数 n=2k−1）
 * @returns {number}
 */
export function squareWaveCoefficient(k) {
  assertQuantumNumber(k);
  return 4 / (Math.PI * (2 * k - 1));
}

/**
 * 合成任意一组谐波在位置 x 的取值：Σ aₘ·sin(nₘπx/L + φₘ)。
 * 用于谐波工作台 —— 每个谐波的振幅/相位可被用户独立调节。
 * @param {Array<{n:number, amplitude:number, phase?:number}>} harmonics
 * @param {number} x 位置
 * @param {{wellWidth?:number}} [opts]
 * @returns {number}
 */
export function synthesizeHarmonics(harmonics, x, opts = {}) {
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  let s = 0;
  for (const h of harmonics) {
    s += h.amplitude * Math.sin((h.n * Math.PI * x) / L + (h.phase || 0));
  }
  return s;
}

/**
 * 前 N 个奇谐波的理想方波部分和：
 *   f_N(x) = Σ_{k=1}^N 4/(π(2k−1)) · sin((2k−1)πx/L)
 * 在 (0,L) 内收敛到 1；端点强制为 0，故跳变处必现吉布斯过冲。
 * @param {number} N 谐波项数（正整数）
 * @param {number} x 位置
 * @param {{wellWidth?:number}} [opts]
 * @returns {number}
 */
export function fourierSquareWave(N, x, opts = {}) {
  assertQuantumNumber(N);
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  let s = 0;
  for (let k = 1; k <= N; k++) {
    const n = 2 * k - 1;
    s += (4 / (Math.PI * n)) * Math.sin((n * Math.PI * x) / L);
  }
  return s;
}

/**
 * 数值求前 N 项部分和在 (0, L/2] 上的首个（全局最大）过冲峰。
 * @param {number} N 谐波项数
 * @param {{wellWidth?:number}} [opts]
 * @returns {{x:number, value:number}} 峰位置与峰值。value 随 N 增大趋近
 *   GIBBS_CONSTANT 而非收敛到 1 —— 过冲永不消失，只是越来越靠近跳变点。
 */
export function gibbsPeak(N, opts = {}) {
  assertQuantumNumber(N);
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  const samples = 5000;
  let bestX = 0;
  let bestV = -Infinity;
  for (let i = 1; i <= samples; i++) {
    const x = (i / samples) * (L / 2);
    const v = fourierSquareWave(N, x, opts);
    if (v > bestV) {
      bestV = v;
      bestX = x;
    }
  }
  return { x: bestX, value: bestV };
}

/* ===== 希尔伯特空间（第三章：无限的几何） ===== */

/**
 * 未归一化基函数 sin(nπx/L)。
 * 区别于含 sqrt(2/L) 归一化因子的 eigenFunction —— 此处用于内积/正交性的几何演示。
 * @param {number} n 量子数（正整数）
 * @param {number} x 位置
 * @param {{wellWidth?:number}} [opts]
 * @returns {number}
 */
export function basisFunction(n, x, opts = {}) {
  assertQuantumNumber(n);
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  return Math.sin((n * Math.PI * x) / L);
}

/**
 * 两基函数乘积 sin(mπx/L)·sin(nπx/L)，用于正交性演示的乘积曲线。
 */
export function basisProduct(m, n, x, opts = {}) {
  return basisFunction(m, x, opts) * basisFunction(n, x, opts);
}

/**
 * 希尔伯特空间内积 ⟨m|n⟩ = (2/L)∫₀ᴸ sin(mπx/L)sin(nπx/L)dx（Claude.md 六·3）。
 * 对正整数 m,n 解析等于 δ_mn（正交归一）；本函数以数值积分如实计算。
 * @returns {number} m=n 时 ≈1；m≠n 时 ≈0
 */
export function innerProduct(m, n, opts = {}) {
  assertQuantumNumber(m);
  assertQuantumNumber(n);
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  return (2 / L) * integrate((x) => basisProduct(m, n, x, opts), 0, L);
}

/**
 * 部分内积 (2/L)∫₀ᵘᵖᵖᵉʳ sin(mπx/L)sin(nπx/L)dx。
 * 用于第三章"积分累加 → 0"的扫描动画：随 upper 从 0 推进到 L，
 * 正负面积逐步相消，最终结算到 δ_mn。
 * @param {number} upper 积分上限
 */
export function partialInnerProduct(m, n, upper, opts = {}) {
  assertQuantumNumber(m);
  assertQuantumNumber(n);
  const { wellWidth: L } = { ...DEFAULTS, ...opts };
  if (upper <= 0) return 0;
  return (2 / L) * integrate((x) => basisProduct(m, n, x, opts), 0, upper);
}

/** 量子数校验：必须为正整数。 */
function assertQuantumNumber(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`量子数 n 必须是正整数，收到: ${n}`);
  }
}
