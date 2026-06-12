import { describe, it, expect } from 'vitest';
import {
  eigenEnergy,
  eigenEnergyRatio,
  eigenFunction,
  superpose,
  integrate,
  normalizationOf,
  isCoefficientSetNormalized
} from './QuantumMath.js';

describe('QuantumMath · 本征能量', () => {
  it('自然单位下 E_n = n²π²/2', () => {
    expect(eigenEnergy(1)).toBeCloseTo((Math.PI * Math.PI) / 2, 10);
    expect(eigenEnergy(2)).toBeCloseTo((4 * Math.PI * Math.PI) / 2, 10);
    expect(eigenEnergy(3)).toBeCloseTo((9 * Math.PI * Math.PI) / 2, 10);
  });

  it('能级比 E_n/E_1 = n²', () => {
    expect(eigenEnergyRatio(1)).toBe(1);
    expect(eigenEnergyRatio(4)).toBe(16);
    // 与绝对能量自洽
    expect(eigenEnergy(5) / eigenEnergy(1)).toBeCloseTo(eigenEnergyRatio(5), 10);
  });

  it('物理参数可覆盖：能量随 1/L² 缩放', () => {
    const e1 = eigenEnergy(1, { wellWidth: 1 });
    const e2 = eigenEnergy(1, { wellWidth: 2 });
    expect(e1 / e2).toBeCloseTo(4, 10);
  });

  it('非正整数量子数抛错', () => {
    expect(() => eigenEnergy(0)).toThrow(RangeError);
    expect(() => eigenEnergy(-1)).toThrow(RangeError);
    expect(() => eigenEnergy(1.5)).toThrow(RangeError);
  });
});

describe('QuantumMath · 本征函数', () => {
  it('阱外取值为 0（边界条件）', () => {
    expect(eigenFunction(1, 0)).toBe(0);
    expect(eigenFunction(1, 1)).toBe(0);
    expect(eigenFunction(1, -0.1)).toBe(0);
    expect(eigenFunction(1, 1.1)).toBe(0);
  });

  it('基态在阱中心取峰值 sqrt(2/L)', () => {
    expect(eigenFunction(1, 0.5)).toBeCloseTo(Math.sqrt(2), 10);
  });

  it('每个本征态归一化 ∫|ψ_n|²dx = 1', () => {
    for (let n = 1; n <= 6; n++) {
      expect(normalizationOf(n)).toBeCloseTo(1, 6);
    }
  });

  it('本征态相互正交 ∫ψ_mψ_n dx = 0 (m≠n)', () => {
    const pairs = [
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 5]
    ];
    for (const [m, n] of pairs) {
      const overlap = integrate((x) => eigenFunction(m, x) * eigenFunction(n, x), 0, 1);
      expect(overlap).toBeCloseTo(0, 6);
    }
  });
});

describe('QuantumMath · 数值积分', () => {
  it('Simpson 积分 ∫₀¹ x² dx = 1/3', () => {
    expect(integrate((x) => x * x, 0, 1)).toBeCloseTo(1 / 3, 8);
  });

  it('Simpson 积分 ∫₀^π sin x dx = 2', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 8);
  });
});

describe('QuantumMath · 叠加与归一化', () => {
  it('superpose 在节点处由各本征态线性合成', () => {
    // 纯基态：系数 [1] 时 ψ(0.5) = ψ_1(0.5)
    expect(superpose([1], 0.5)).toBeCloseTo(eigenFunction(1, 0.5), 10);
  });

  it('叠加态整体仍归一化（系数已归一）', () => {
    // c = (1/√2, 1/√2) 是合法归一系数
    const c = [Math.SQRT1_2, Math.SQRT1_2];
    const norm = integrate((x) => superpose(c, x) ** 2, 0, 1);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('isCoefficientSetNormalized 判定 Σ|c_n|²≈1', () => {
    expect(isCoefficientSetNormalized([1])).toBe(true);
    expect(isCoefficientSetNormalized([Math.SQRT1_2, Math.SQRT1_2])).toBe(true);
    expect(isCoefficientSetNormalized([0.6, 0.8])).toBe(true);
    expect(isCoefficientSetNormalized([1, 1])).toBe(false);
  });
});
