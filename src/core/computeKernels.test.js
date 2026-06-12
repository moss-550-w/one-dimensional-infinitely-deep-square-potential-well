import { describe, it, expect } from 'vitest';
import { momentumSpectrum, KERNELS } from './computeKernels.js';
import { gaussianMomentumStd } from './QuantumMath.js';

describe('computeKernels · momentumSpectrum', () => {
  it('返回 Transferable 友好的 Float64Array 谱', () => {
    const r = momentumSpectrum({ sigma: 0.06, momentumSamples: 60, positionSamples: 80 });
    expect(r.momentumDensity).toBeInstanceOf(Float64Array);
    expect(r.positionDensity).toBeInstanceOf(Float64Array);
    expect(r.momentumDensity).toHaveLength(61);
    expect(r.positionDensity).toHaveLength(81);
  });

  it('谱值非负、峰值为正', () => {
    const r = momentumSpectrum({ sigma: 0.05 });
    expect(r.momentumPeak).toBeGreaterThan(0);
    expect(r.positionPeak).toBeGreaterThan(0);
    expect([...r.momentumDensity].every((v) => v >= 0)).toBe(true);
  });

  it('位置不确定度 Δx ≈ σ（数值核对）', () => {
    const r = momentumSpectrum({ sigma: 0.06, positionSamples: 400 });
    expect(r.dx).toBeCloseTo(0.06, 2);
  });

  it('Δx·Δp 在海森堡下界 ħ/2 附近（数值积分有限宽度，略大于 0.5）', () => {
    const r = momentumSpectrum({ sigma: 0.05, momentumSamples: 200, integrationSteps: 400 });
    expect(r.product).toBeGreaterThan(0.45);
    expect(r.product).toBeLessThan(0.75);
  });

  it('理论 Δp 与解析 ħ/(2σ) 一致', () => {
    const sigma = 0.05;
    const r = momentumSpectrum({ sigma });
    expect(r.theoryDp).toBeCloseTo(gaussianMomentumStd(sigma), 12);
  });

  it('压缩位置（σ↓）→ 动量数值展宽（Δp↑）', () => {
    const wide = momentumSpectrum({ sigma: 0.12, momentumSamples: 160, integrationSteps: 320 });
    const narrow = momentumSpectrum({ sigma: 0.04, momentumSamples: 160, integrationSteps: 320 });
    expect(narrow.dp).toBeGreaterThan(wide.dp);
  });

  it('动量谱关于 p=0 近似对称（中心波包，实值 ψ）', () => {
    const r = momentumSpectrum({ sigma: 0.06, momentumSamples: 100, integrationSteps: 300 });
    const n = r.momentumDensity.length - 1;
    for (const i of [10, 25, 40]) {
      expect(r.momentumDensity[i]).toBeCloseTo(r.momentumDensity[n - i], 6);
    }
  });

  it('sigma 非正抛错', () => {
    expect(() => momentumSpectrum({ sigma: 0 })).toThrow(RangeError);
    expect(() => momentumSpectrum({ sigma: -0.1 })).toThrow(RangeError);
  });

  it('KERNELS 分发表登记 momentumSpectrum', () => {
    expect(KERNELS.momentumSpectrum).toBe(momentumSpectrum);
  });
});
