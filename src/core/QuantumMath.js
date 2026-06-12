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

/** 量子数校验：必须为正整数。 */
function assertQuantumNumber(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`量子数 n 必须是正整数，收到: ${n}`);
  }
}
