/**
 * computeKernels — 计算密集型纯函数内核（Claude.md 七 / plan.md M6）。
 *
 * 把第四章动量表象的重计算（121 个动量点 × 240 步 Simpson 积分 + 加权标准差）
 * 抽离为**与渲染、DOM、THREE 全解耦**的纯函数，满足：
 *   1. node 环境可直接单测（数学先行，视觉派生）。
 *   2. 可被 Web Worker 直接调用，主线程零阻塞（plan.md：傅里叶/矩阵移出主线程）。
 *   3. 返回 Transferable 友好的 Float64Array，便于 postMessage 零拷贝回传。
 *
 * 物理与 QuantumMath 完全一致：动量谱即位置高斯波包的傅里叶变换
 *   φ(p) = (1/√(2πħ)) ∫ ψ(x) e^{−ipx/ħ} dx，密度 |φ(p)|²。
 */

import {
  gaussianPacket,
  momentumDensity,
  weightedStd,
  gaussianMomentumStd
} from './QuantumMath.js';

/**
 * 计算高斯波包的动量谱、位置谱与不确定度，一次性产出渲染所需的全部数值。
 *
 * @param {object} params
 * @param {number} params.sigma 位置标准差（波包宽度，>0）
 * @param {number} [params.x0=0.5] 波包中心
 * @param {number} [params.pMax=140] 动量轴半幅 [−pMax, pMax]
 * @param {number} [params.momentumSamples=120] 动量采样段数（点数=+1）
 * @param {number} [params.positionSamples=200] 位置采样段数（点数=+1）
 * @param {number} [params.integrationSteps=240] 每个动量点的 Simpson 积分步数
 * @param {object} [params.opts] 透传物理参数 { hbar, mass, wellWidth }
 * @returns {{
 *   sigma:number, x0:number, pMax:number,
 *   momentumDensity:Float64Array, momentumPeak:number,
 *   positionDensity:Float64Array, positionPeak:number,
 *   dx:number, dp:number, product:number, theoryDp:number
 * }}
 */
export function momentumSpectrum({
  sigma,
  x0 = 0.5,
  pMax = 140,
  momentumSamples = 120,
  positionSamples = 200,
  integrationSteps = 240,
  opts = {}
}) {
  if (!(sigma > 0)) throw new RangeError(`sigma 必须为正，收到: ${sigma}`);

  const psi = (x) => gaussianPacket(x, x0, sigma);
  const L = opts.wellWidth ?? 1;

  // —— 位置谱 |ψ(x)|² 与位置不确定度 Δx ——
  const posN = positionSamples;
  const posDensity = new Float64Array(posN + 1);
  const xs = new Float64Array(posN + 1);
  let posPeak = 0;
  for (let i = 0; i <= posN; i++) {
    const x = (i / posN) * L;
    const v = psi(x) ** 2;
    xs[i] = x;
    posDensity[i] = v;
    if (v > posPeak) posPeak = v;
  }

  // —— 动量谱 |φ(p)|² 与动量不确定度 Δp ——
  const momN = momentumSamples;
  const momDensity = new Float64Array(momN + 1);
  const ps = new Float64Array(momN + 1);
  let momPeak = 0;
  for (let i = 0; i <= momN; i++) {
    const p = -pMax + (2 * pMax * i) / momN;
    const d = momentumDensity(psi, p, 0, L, { ...opts, steps: integrationSteps });
    ps[i] = p;
    momDensity[i] = d;
    if (d > momPeak) momPeak = d;
  }

  // 数值不确定度（加权标准差，权重无需预归一）
  const dx = weightedStd(Array.from(xs), Array.from(posDensity)).std;
  const dp = weightedStd(Array.from(ps), Array.from(momDensity)).std;

  return {
    sigma,
    x0,
    pMax,
    momentumDensity: momDensity,
    momentumPeak: momPeak || 1,
    positionDensity: posDensity,
    positionPeak: posPeak || 1,
    dx,
    dp,
    product: dx * dp,
    theoryDp: gaussianMomentumStd(sigma, opts)
  };
}

/**
 * Worker 消息分发表：按 kernel 名调用对应纯函数。
 * 集中登记，便于 worker 与同步降级共用同一套实现，杜绝两路逻辑漂移。
 */
export const KERNELS = Object.freeze({
  momentumSpectrum
});
